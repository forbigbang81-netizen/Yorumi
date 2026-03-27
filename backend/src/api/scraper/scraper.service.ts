import { AnimePaheScraper } from '../../scraper/animepahe';
import { cacheGet, cacheSet } from '../../utils/redis-cache';

export class ScraperService {
    private fastScraper: AnimePaheScraper;
    private cache = new Map<string, { expiresAt: number; value: any }>();
    private inFlight = new Map<string, Promise<any>>();
    private hotStreamKeys = new Map<string, { animeSession: string; epSession: string; hits: number; lastAccess: number }>();

    constructor() {
        this.fastScraper = new AnimePaheScraper();
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

    async search(query: string) {
        const normalized = query.toLowerCase().trim();
        return this.getOrLoad(`search:v3:${normalized}`, 2 * 60 * 1000, async () => {
            const fast = await this.fastScraper.search(query);
            return Array.isArray(fast) ? fast : [];
        });
    }

    async getEpisodes(session: string) {
        const isCompleteEpisodePayload = (value: any) => {
            const episodes = Array.isArray(value?.episodes) ? value.episodes : [];
            const lastPage = Number(value?.lastPage || 1);
            const minimumExpectedEpisodes = lastPage <= 1 ? 1 : ((Math.floor(lastPage) - 1) * 30) + 1;
            return episodes.length >= minimumExpectedEpisodes;
        };

        return this.getOrLoad(
            `episodes:v7:${session}`,
            15 * 60 * 1000,
            async () => {
                const fast = await this.fastScraper.getEpisodes(session);
                if (Array.isArray(fast.episodes) && fast.episodes.length > 0) {
                    return fast;
                }
                return { episodes: [], lastPage: 1 };
            },
            {
                shouldCache: isCompleteEpisodePayload,
                allowCached: isCompleteEpisodePayload,
            }
        );
    }

    async getStreams(animeSession: string, epSession: string) {
        this.trackHotStream(animeSession, epSession);
        const key = `streams:v6:${animeSession}:${epSession}`;
        return this.getOrLoad(
            key,
            5 * 60 * 1000,
            async () => {
                const links = await this.fastScraper.getLinks(animeSession, epSession);
                return Array.isArray(links) ? links : [];
            },
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
