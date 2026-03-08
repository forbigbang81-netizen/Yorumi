
import { AnimePaheScraper } from '../../../src/scraper/animepahe';
import { cacheGet, cacheSet } from '../../utils/redis-cache';

export class ScraperService {
    private scraper: AnimePaheScraper;
    private cache = new Map<string, { expiresAt: number; value: any }>();
    private inFlight = new Map<string, Promise<any>>();
    private hotStreamKeys = new Map<string, { animeSession: string; epSession: string; hits: number; lastAccess: number }>();

    constructor() {
        this.scraper = new AnimePaheScraper();
    }

    private async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
        const now = Date.now();
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > now) {
            return cached.value as T;
        }

        const redisCached = await cacheGet<T>(key);
        if (redisCached !== null) {
            this.cache.set(key, { expiresAt: now + ttlMs, value: redisCached });
            return redisCached;
        }

        const inFlight = this.inFlight.get(key);
        if (inFlight) {
            return inFlight as Promise<T>;
        }

        const promise = loader()
            .then((value) => {
                this.cache.set(key, { expiresAt: Date.now() + ttlMs, value });
                cacheSet(key, value, Math.ceil(ttlMs / 1000)).catch((error) => {
                    console.warn(`[ScraperService] Redis cache set failed for "${key}"`, error);
                });
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
        return this.getOrLoad(`search:${normalized}`, 2 * 60 * 1000, () => this.scraper.search(query));
    }

    async getEpisodes(session: string) {
        return this.getOrLoad(`episodes:${session}`, 15 * 60 * 1000, async () => {
            // Fetch first page to see how many pages there are
            const firstPage = await this.scraper.getEpisodes(session, 1);
            let allEpisodes = [...firstPage.episodes];

            if (firstPage.lastPage > 1) {
                console.log(`Anime has ${firstPage.lastPage} pages of episodes. Fetching the rest in batches...`);

                // Helper for batching
                const batchSize = 5;
                const totalPages = firstPage.lastPage;

                // Create array of page numbers to fetch (2 to lastPage)
                const pagesToFetch = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

                // Process in batches
                for (let i = 0; i < pagesToFetch.length; i += batchSize) {
                    const batch = pagesToFetch.slice(i, i + batchSize);
                    console.log(`Fetching batch: pages ${batch[0]} - ${batch[batch.length - 1]}`);

                    const batchPromises = batch.map(pageNum => this.scraper.getEpisodes(session, pageNum));
                    const results = await Promise.all(batchPromises);

                    results.forEach(res => {
                        allEpisodes = [...allEpisodes, ...res.episodes];
                    });
                }
            }

            // Return structured data like the first page, but with all episodes
            return {
                episodes: allEpisodes,
                lastPage: firstPage.lastPage
            };
        });
    }

    async getStreams(animeSession: string, epSession: string) {
        this.trackHotStream(animeSession, epSession);
        const key = `streams:${animeSession}:${epSession}`;
        return this.getOrLoad(key, 20 * 60 * 1000, () => this.scraper.getLinks(animeSession, epSession));
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
