import { AnimePaheScraper } from '../../scraper/animepahe';
import { AnimeKaiScraper } from '../../scraper/animekai';
import { acquireLock, cacheGet, cacheSet, releaseLock } from '../../utils/redis-cache';

export class ScraperService {
    private fastScraper: AnimePaheScraper;
    private animeKaiScraper: AnimeKaiScraper;
    private cache = new Map<string, { expiresAt: number; value: any }>();
    private inFlight = new Map<string, Promise<any>>();
    private hotStreamKeys = new Map<string, { animeSession: string; epSession: string; hits: number; lastAccess: number }>();

    constructor() {
        this.fastScraper = new AnimePaheScraper();
        this.animeKaiScraper = new AnimeKaiScraper();
    }

    private isAnimePaheSession(session: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(session || '').trim());
    }

    private getEpisodeScraper(session: string) {
        return this.isAnimePaheSession(session) ? this.fastScraper : this.animeKaiScraper;
    }

    private async getOrLoad<T>(
        key: string,
        ttlMs: number,
        loader: () => Promise<T>,
        options?: {
            shouldCache?: (value: T) => boolean;
            allowCached?: (value: T) => boolean;
        }
    ): Promise<T> {
        const now = Date.now();
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > now) {
            const value = cached.value as T;
            if (!options?.allowCached || options.allowCached(value)) {
                return value;
            }
            this.cache.delete(key);
        }

        const redisCached = await cacheGet<T>(key);
        if (redisCached !== null) {
            if (!options?.allowCached || options.allowCached(redisCached)) {
                this.cache.set(key, { expiresAt: now + ttlMs, value: redisCached });
                return redisCached;
            }
        }

        const inFlight = this.inFlight.get(key);
        if (inFlight) {
            return inFlight as Promise<T>;
        }

        // Cross-instance dedup for Vercel serverless: each cold start gets its own
        // empty inFlight Map, so in-memory dedup doesn't prevent duplicate scrapers.
        // Use a Redis lock so that only ONE instance runs the loader while others
        // poll Redis for the cached result.
        const lockKey = `lock:dedup:${key}`;
        const lockTtlSeconds = Math.min(60, Math.max(15, Math.ceil(ttlMs / 1000)));
        let acquiredLock = false;

        try {
            acquiredLock = await acquireLock(lockKey, lockTtlSeconds);
        } catch {
            // Redis unavailable — proceed without distributed dedup.
        }

        if (!acquiredLock) {
            // Another instance is already running this loader. Poll Redis for the result.
            const pollStart = Date.now();
            const pollTimeout = 15_000;
            while (Date.now() - pollStart < pollTimeout) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const polled = await cacheGet<T>(key);
                if (polled !== null) {
                    if (!options?.allowCached || options.allowCached(polled)) {
                        this.cache.set(key, { expiresAt: Date.now() + ttlMs, value: polled });
                        return polled;
                    }
                }
            }
            // Timeout — fall through and run the loader ourselves as a safety net.
        }

        const promise = loader()
            .then((value) => {
                const shouldCache = options?.shouldCache ? options.shouldCache(value) : true;
                if (shouldCache) {
                    this.cache.set(key, { expiresAt: Date.now() + ttlMs, value });
                    cacheSet(key, value, Math.ceil(ttlMs / 1000)).catch((error) => {
                        console.warn(`[ScraperService] Redis cache set failed for "${key}"`, error);
                    });
                } else {
                    this.cache.delete(key);
                }
                return value;
            })
            .finally(() => {
                this.inFlight.delete(key);
                if (acquiredLock) {
                    releaseLock(lockKey).catch(() => undefined);
                }
            });

        this.inFlight.set(key, promise);

        // Opportunistic cleanup of expired entries.
        if (this.cache.size > 300) {
            const nowTs = Date.now();
            for (const [k, v] of this.cache.entries()) {
                if (v.expiresAt <= nowTs) {
                    this.cache.delete(k);
                }
            }
        }

        return promise;
    }

    private trackHotStream(animeSession: string, epSession: string): void {
        const key = `${animeSession}:${epSession}`;
        const current = this.hotStreamKeys.get(key);
        if (current) {
            current.hits += 1;
            current.lastAccess = Date.now();
            return;
        }
        this.hotStreamKeys.set(key, {
            animeSession,
            epSession,
            hits: 1,
            lastAccess: Date.now(),
        });

        if (this.hotStreamKeys.size > 200) {
            const sorted = [...this.hotStreamKeys.entries()].sort(
                (a, b) => (a[1].hits * 1000000 + a[1].lastAccess) - (b[1].hits * 1000000 + b[1].lastAccess)
            );
            for (let i = 0; i < sorted.length - 150; i++) {
                this.hotStreamKeys.delete(sorted[i][0]);
            }
        }
    }

    private async fetchStreamLinksWithRetries(animeSession: string, epSession: string) {
        const scraper = this.getEpisodeScraper(animeSession);
        const maxAttempts = this.isAnimePaheSession(animeSession) ? 3 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const links = await scraper.getLinks(animeSession, epSession);
            if (Array.isArray(links) && links.length > 0) {
                return links;
            }

            if (attempt < maxAttempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }

        return [];
    }

    async search(query: string) {
        const normalized = query.toLowerCase().trim();
        return this.getOrLoad(`search:v4:${normalized}`, 2 * 60 * 1000, async () => {
            const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
                try {
                    return await Promise.race([
                        promise,
                        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
                    ]);
                } catch {
                    return fallback;
                }
            };
            const [animePahe, animeKai] = await Promise.all([
                withTimeout(this.fastScraper.search(query), 7000, []),
                withTimeout(this.animeKaiScraper.search(query), 7000, []),
            ]);
            const seen = new Set<string>();
            const merged: any[] = [];

            const addItems = (items: unknown) => {
                if (!Array.isArray(items)) return;
                items.forEach((item: any) => {
                    const session = String(item?.session || '').trim();
                    if (!session || seen.has(session)) return;
                    seen.add(session);
                    merged.push(item);
                });
            };

            addItems(animePahe);
            addItems(animeKai);

            return merged;
        });
    }

    async getEpisodes(session: string) {
        const isCompleteEpisodePayload = (value: any) => {
            const episodes = Array.isArray(value?.episodes) ? value.episodes : [];
            const lastPage = Number(value?.lastPage || 1);
            const minimumExpectedEpisodes = lastPage <= 1 ? 1 : ((Math.floor(lastPage) - 1) * 30) + 1;
            return episodes.length >= minimumExpectedEpisodes;
        };
        const waitForFullCache = async (timeoutMs: number) => {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeoutMs) {
                const waitedCache = await cacheGet<any>(fullCacheKey);
                if (waitedCache && isCompleteEpisodePayload(waitedCache)) {
                    return waitedCache;
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            return null;
        };
        const fullCacheKey = `episodes:full:v2:${session}`;
        const lockKey = `lock:episodes:${session}`;
        const fullTtlMs = 24 * 60 * 60 * 1000;
        const shortTtlMs = 60 * 60 * 1000;
        const shortCacheKey = `episodes:v8:${session}`;

        const fullCached = await cacheGet<any>(fullCacheKey);
        if (fullCached && isCompleteEpisodePayload(fullCached)) {
            this.cache.set(shortCacheKey, { expiresAt: Date.now() + shortTtlMs, value: fullCached });
            return fullCached;
        }

        return this.getOrLoad(
            shortCacheKey,
            shortTtlMs,
            async () => {
                let hasLock = await acquireLock(lockKey, 90);
                if (!hasLock) {
                    const waitedCache = await waitForFullCache(25000);
                    if (waitedCache) return waitedCache;

                    hasLock = await acquireLock(lockKey, 90);
                }

                if (!hasLock) {
                    const staleCached = await cacheGet<any>(shortCacheKey);
                    if (staleCached && isCompleteEpisodePayload(staleCached)) {
                        return staleCached;
                    }
                    // Last-resort fallback: scrape anyway instead of surfacing an empty episode list.
                    const fast = await this.getEpisodeScraper(session).getEpisodes(session);
                    return Array.isArray(fast.episodes) && fast.episodes.length > 0
                        ? fast
                        : { episodes: [], lastPage: 1 };
                }

                try {
                    const fast = await this.getEpisodeScraper(session).getEpisodes(session);
                    if (Array.isArray(fast.episodes) && fast.episodes.length > 0) {
                        if (isCompleteEpisodePayload(fast)) {
                            cacheSet(fullCacheKey, fast, Math.ceil(fullTtlMs / 1000)).catch((error) => {
                                console.warn(`[ScraperService] Redis full episode cache set failed for "${fullCacheKey}"`, error);
                            });
                        }
                        return fast;
                    }
                    return { episodes: [], lastPage: 1 };
                } finally {
                    releaseLock(lockKey).catch(() => undefined);
                }
            },
            {
                shouldCache: isCompleteEpisodePayload,
                allowCached: isCompleteEpisodePayload,
            }
        );
    }

    async getStreams(animeSession: string, epSession: string) {
        this.trackHotStream(animeSession, epSession);
        const key = `streams:v7:${animeSession}:${epSession}`;
        return this.getOrLoad(
            key,
            5 * 60 * 1000,
            async () => this.fetchStreamLinksWithRetries(animeSession, epSession),
            {
                shouldCache: (value) => Array.isArray(value) && value.length > 0,
                allowCached: (value) => Array.isArray(value) && value.length > 0,
            }
        );
    }

    async prefetchStreams(animeSession: string, epSessions: string[]) {
        const uniqueSessions = [...new Set(epSessions.filter(Boolean))];
        await Promise.allSettled(uniqueSessions.map((epSession) => this.getStreams(animeSession, epSession)));
        return { success: true, warmed: uniqueSessions.length };
    }

    getHotStreamCandidates(limit: number = 20) {
        const now = Date.now();
        const fresh = [...this.hotStreamKeys.values()]
            .filter((entry) => now - entry.lastAccess < 6 * 60 * 60 * 1000)
            .sort((a, b) => (b.hits * 1000000 + b.lastAccess) - (a.hits * 1000000 + a.lastAccess))
            .slice(0, limit);
        return fresh;
    }
}

export const scraperService = new ScraperService();
