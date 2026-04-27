import { Redis } from '@upstash/redis';
import { request, gql } from 'graphql-request';
import Fuse from 'fuse.js';

// --- CONFIGURATION ---
type RedisLike = {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, options?: Record<string, unknown>): Promise<unknown>;
    del(key: string): Promise<unknown>;
    hget<T>(key: string, field: string): Promise<T | null>;
    hset(key: string, value: Record<string, unknown>): Promise<unknown>;
};
type MemoryEntry = { value: unknown; expiresAt: number | null };

const hasRedisConfig = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const upstashRedis = hasRedisConfig
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    : null;

const memoryStore = new Map<string, MemoryEntry>();
const memoryHashStore = new Map<string, Map<string, unknown>>();

function getTtlMs(options?: Record<string, unknown>) {
    const ex = Number(options?.ex);
    return Number.isFinite(ex) && ex > 0 ? ex * 1000 : null;
}

function getMemoryValue<T>(key: string): T | null {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        memoryStore.delete(key);
        return null;
    }
    return entry.value as T;
}

function setMemoryValue(key: string, value: unknown, options?: Record<string, unknown>) {
    if (options?.nx && getMemoryValue(key) !== null) return null;
    const ttlMs = getTtlMs(options);
    memoryStore.set(key, {
        value,
        expiresAt: ttlMs === null ? null : Date.now() + ttlMs,
    });
    return 'OK';
}

const redis: RedisLike = {
    async get<T>(key: string) {
        if (upstashRedis) {
            try {
                return await upstashRedis.get<T>(key);
            } catch (error) {
                console.warn(`[redis] Read failed for "${key}", using memory fallback`, error);
            }
        }
        return getMemoryValue<T>(key);
    },
    async set(key: string, value: unknown, options?: Record<string, unknown>) {
        if (upstashRedis) {
            try {
                return await upstashRedis.set(key, value, options);
            } catch (error) {
                console.warn(`[redis] Write failed for "${key}", using memory fallback`, error);
            }
        }
        return setMemoryValue(key, value, options);
    },
    async del(key: string) {
        memoryStore.delete(key);
        memoryHashStore.delete(key);
        if (upstashRedis) {
            try {
                return await upstashRedis.del(key);
            } catch (error) {
                console.warn(`[redis] Delete failed for "${key}"`, error);
            }
        }
        return null;
    },
    async hget<T>(key: string, field: string) {
        if (upstashRedis) {
            try {
                return await upstashRedis.hget<T>(key, field);
            } catch (error) {
                console.warn(`[redis] Hash read failed for "${key}.${field}", using memory fallback`, error);
            }
        }
        return (memoryHashStore.get(key)?.get(field) as T | undefined) ?? null;
    },
    async hset(key: string, value: Record<string, unknown>) {
        if (upstashRedis) {
            try {
                return await upstashRedis.hset(key, value);
            } catch (error) {
                console.warn(`[redis] Hash write failed for "${key}", using memory fallback`, error);
            }
        }
        const hash = memoryHashStore.get(key) ?? new Map<string, unknown>();
        for (const [field, fieldValue] of Object.entries(value)) {
            hash.set(field, fieldValue);
        }
        memoryHashStore.set(key, hash);
        return null;
    },
};

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

// --- TYPES ---
interface AniListResponse {
    Page: {
        media: Array<{
            id: number;
            title: {
                romaji: string;
                english: string | null;
                native: string | null;
            };
            synonyms: string[];
        }>;
    };
}

/**
 * The Main Function
 * @param mkSlug The unique MangaKatana slug (e.g., 'one-piece.2040')
 * @param mkTitle The title string from MangaKatana (e.g., 'One Piece')
 */
export async function getAniListId(mkSlug: string, mkTitle: string): Promise<number | null> {
    const CACHE_KEY = `map:mk:${mkSlug}`;

    // STEP 1: Check Redis (The "mapping.json" in the cloud)
    const cachedId = await redis.get<number>(CACHE_KEY);
    if (cachedId) {
        console.log(`⚡ Cache Hit: ${mkSlug} -> ${cachedId}`);
        return cachedId;
    }

    console.log(`🐢 Cache Miss: Fetching AniList for "${mkTitle}"...`);

    // STEP 2: Fetch from AniList API
    // We search for the top 5 results to perform a fuzzy check locally
    const query = gql`
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          title {
            romaji
            english
            native
          }
          synonyms
        }
      }
    }
  `;

    try {
        // Sanitize title (Remove 'Hot', 'New', or Volume numbers common on MK)
        const cleanQuery = mkTitle.replace(/\(Vol\.\d+\)/i, '').trim();

        const data = await request<AniListResponse>(ANILIST_ENDPOINT, query, { search: cleanQuery });
        const candidates = data.Page.media;

        if (!candidates || candidates.length === 0) return null;

        // STEP 3: Verify the Match (Fuzzy Check)
        // We double-check because AniList search can be weird.
        const fuse = new Fuse(candidates, {
            keys: ['title.romaji', 'title.english', 'synonyms'],
            includeScore: true,
            threshold: 0.4, // 0.0 is exact, 0.4 allows small differences
        });

        const result = fuse.search(mkTitle);

        if (result.length > 0) {
            const bestMatch = result[0].item;
            const anilistId = bestMatch.id;

            // STEP 4: Learn (Save to Redis)
            // This persists the mapping forever (or until you delete it)
            await redis.set(CACHE_KEY, anilistId);

            return anilistId;
        }

    } catch (error) {
        console.error("AniList API Error:", error);
    }

    return null;
}

// Export the redis instance for other services to use
export { redis };
