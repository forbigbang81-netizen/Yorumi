import * as mangakatana from '../../scraper/mangakatana'; 
import { anilistService } from '../anilist/anilist.service';
import { mappingService } from '../mapping/mapping.service';
import { cacheGet, cacheSet } from '../../utils/redis-cache';
import { createHash } from 'crypto';

export interface MangaSearchResult extends mangakatana.MangaSearchResult {
    source: 'mangakatana';
}

// In-memory search cache (5 minute TTL)
const searchCache = new Map<string, { data: any[], timestamp: number }>();
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CHAPTER_LIST_CACHE_KEY_PREFIX = 'manga:chapters:';
const CHAPTER_PAGES_CACHE_KEY_PREFIX = 'manga:pages:';
const SEARCH_CACHE_KEY_PREFIX = 'manga:search:';

const hashKey = (input: string) => createHash('sha1').update(input).digest('hex');
const MANGA_RESOLVE_CACHE_PREFIX = 'manga:resolve:';

const normalizeTitle = (value: string) =>
    String(value || '')
        .toLowerCase()
        .replace(/['\u2019]s\b/g, '')
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const getTitleCandidates = (media: any): string[] => {
    const synonyms = Array.isArray(media?.synonyms) ? media.synonyms : [];
    const primary = [media?.title?.english, media?.title?.romaji]
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean);
    const latinSynonyms = synonyms
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => Boolean(value))
        .filter((value: string) => /[A-Za-z]/.test(value));
    const secondary = [media?.title?.native, ...synonyms]
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean);

    return [...new Set([...primary, ...latinSynonyms, ...secondary])];
};

const scoreSearchResult = (candidate: any, titleCandidates: string[]) => {
    const candidateTitle = normalizeTitle(String(candidate?.title || ''));
    if (!candidateTitle) return 0;

    let bestScore = 0;
    for (const title of titleCandidates) {
        const normalized = normalizeTitle(title);
        if (!normalized) continue;
        if (candidateTitle === normalized) return 100;
        if (candidateTitle.includes(normalized) || normalized.includes(candidateTitle)) {
            bestScore = Math.max(bestScore, 90);
            continue;
        }

        const candidateWords = new Set(candidateTitle.split(' ').filter(Boolean));
        const titleWords = normalized.split(' ').filter(Boolean);
        const overlap = titleWords.filter((word) => candidateWords.has(word)).length;
        if (overlap > 0) {
            const ratio = overlap / Math.max(titleWords.length, candidateWords.size || 1);
            bestScore = Math.max(bestScore, Math.round(ratio * 100));
        }
    }

    return bestScore;
};

async function resolveScraperIdFromAniList(anilistId: string, media: any): Promise<string | null> {
    const mapping = await mappingService.getMapping(anilistId).catch(() => null);
    if (mapping?.id) {
        return mapping.id;
    }

    const titleCandidates = getTitleCandidates(media);
    if (titleCandidates.length === 0) {
        return null;
    }

    for (const title of titleCandidates.slice(0, 6)) {
        const resolveCacheKey = `${MANGA_RESOLVE_CACHE_PREFIX}${normalizeTitle(title)}`;
        const cached = await cacheGet<string>(resolveCacheKey).catch(() => null);
        if (cached) {
            await mappingService.saveMapping(anilistId, cached, title).catch(() => undefined);
            return cached;
        }

        const searchResults = await searchManga(title);
        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            continue;
        }

        const ranked = [...searchResults]
            .map((item) => ({ item, score: scoreSearchResult(item, titleCandidates) }))
            .sort((a, b) => b.score - a.score);

        const best = ranked[0];
        if (best && best.score >= 60) {
            await cacheSet(resolveCacheKey, best.item.id, 7 * 24 * 60 * 60).catch(() => undefined);
            await mappingService.saveMapping(anilistId, best.item.id, best.item.title || title).catch(() => undefined);
            return best.item.id;
        }
    }

    return null;
}

/**
 * Search manga (MangaKatana only) with caching
 */
export async function searchManga(query: string) {
    const normalizedQuery = query.toLowerCase().trim();
    const cacheKey = normalizedQuery;
    const now = Date.now();
    const redisKey = `${SEARCH_CACHE_KEY_PREFIX}${hashKey(normalizedQuery)}`;

    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < SEARCH_CACHE_TTL) {
        console.log(`Search cache hit for: "${query}"`);
        return cached.data;
    }

    const redisCached = await cacheGet<any[]>(redisKey).catch(() => null);
    if (redisCached && redisCached.length > 0) {
        console.log(`Search cache hit (redis) for: "${query}"`);
        searchCache.set(cacheKey, { data: redisCached, timestamp: now });
        return redisCached;
    }

    console.log(`Searching MangaKatana for: "${query}"`);
    const mkResults = await mangakatana.searchManga(query).catch(err => {
        console.error('MangaKatana Search Error:', err.message);
        return [];
    });

    // Prefix IDs to namespace them (optional now, but keeps consistency if we add others later)
    const results = mkResults.map(r => ({
        ...r,
        id: `mk:${r.id}`,
        source: 'mangakatana' as const
    }));

    // Cache successful results only so improved resolvers can recover from previous misses.
    if (results.length > 0) {
        searchCache.set(cacheKey, { data: results, timestamp: now });
        cacheSet(redisKey, results, Math.ceil(SEARCH_CACHE_TTL / 1000)).catch((error) => {
            console.warn(`[Cache] Redis write failed for search "${query}"`, error);
        });
    }
    console.log(`Cached ${results.length} results for: "${query}"`);

    return results;
}

/**
 * Get details
 */
export async function getMangaDetails(id: string) {
    // Check if ID is likely AniList (numeric) vs Scraper (string with letters/hyphens)
    // MK IDs usually "some-manga.12345" or "some-manga".
    // AniList ID is purely numeric "123456".
    const isAniListId = /^\d+$/.test(id);

    if (isAniListId) {
        console.log(`[getMangaDetails] Treating "${id}" as AniList ID`);
        const anilistData = await anilistService.getMangaById(parseInt(id, 10));
        if (!anilistData) throw new Error('AniList media not found');

        let scraperId: string | null = null;
        try {
            scraperId = await resolveScraperIdFromAniList(id, anilistData);
            if (scraperId) {
                console.log(`[getMangaDetails] Resolved scraperId ${scraperId} for AniList ${id}`);
            }
        } catch (e) {
            console.error('[getMangaDetails] Scraper resolution failed:', e);
        }

        return {
            ...anilistData,
            scraperId,
        };
    }

    // Strip prefix if present
    const realId = id.startsWith('mk:') ? id.replace('mk:', '') : id;
    const details = await mangakatana.getMangaDetails(realId);
    return { ...details, id: `mk:${details.id}` };
}

/**
 * Get chapter list
 */
export async function getChapterList(id: string) {
    let realId = id.startsWith('mk:') ? id.replace('mk:', '') : id;
    if (/^\d+$/.test(realId)) {
        const mapping = await mappingService.getMapping(realId).catch(() => null);
        if (mapping?.id) {
            realId = mapping.id.startsWith('mk:') ? mapping.id.replace('mk:', '') : mapping.id;
        }
    }
    if (realId.startsWith('http://') || realId.startsWith('https://') || realId.includes('/manga/')) {
        try {
            const maybeUrl = realId.startsWith('http') ? new URL(realId) : null;
            const path = maybeUrl ? maybeUrl.pathname : realId;
            const idx = path.indexOf('/manga/');
            if (idx !== -1) {
                realId = path.slice(idx + '/manga/'.length);
            }
            realId = realId.replace(/^\/+|\/+$/g, '').split('?')[0].split('#')[0].split('/')[0];
        } catch {
            realId = realId.replace(/^\/+|\/+$/g, '').split('?')[0].split('#')[0].split('/')[0];
        }
    }
    const now = Date.now();
    const redisKey = `${CHAPTER_LIST_CACHE_KEY_PREFIX}${realId}`;

    const cached = chapterListCache.get(realId);
    if (cached && (now - cached.timestamp) < CHAPTER_LIST_CACHE_TTL) {
        console.log(`[Cache] Chapter list hit: ${realId}`);
        return cached.data;
    }

    const redisCached = await cacheGet<any[]>(redisKey);
    if (redisCached && redisCached.length > 0) {
        console.log(`[Cache] Chapter list hit (redis): ${realId}`);
        chapterListCache.set(realId, { data: redisCached, timestamp: now });
        return redisCached;
    }

    const inFlight = chapterListInFlight.get(realId);
    if (inFlight) {
        console.log(`[Cache] Waiting for in-flight chapter list: ${realId}`);
        return inFlight;
    }

    const fetchPromise = (async () => {
        try {
            let chapters = await mangakatana.getChapterList(realId);

            // Retry once when source returns an empty list to reduce transient misses.
            if (!chapters || chapters.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 700));
                chapters = await mangakatana.getChapterList(realId);
            }

            const normalized = chapters.map(c => ({ ...c, id: `mk:${c.id}` }));

            if (normalized.length > 0) {
                chapterListCache.set(realId, { data: normalized, timestamp: Date.now() });
                cacheSet(redisKey, normalized, Math.ceil(CHAPTER_LIST_CACHE_TTL / 1000)).catch((error) => {
                    console.warn(`[Cache] Redis write failed for chapter list ${realId}`, error);
                });
            }

            return normalized;
        } finally {
            chapterListInFlight.delete(realId);
        }
    })();

    chapterListInFlight.set(realId, fetchPromise);
    return fetchPromise;
}

// In-memory cache for chapter pages (30 minute TTL)
const pagesCache = new Map<string, { data: any[], timestamp: number }>();
const PAGES_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const chapterListCache = new Map<string, { data: any[], timestamp: number }>();
const CHAPTER_LIST_CACHE_TTL = 20 * 60 * 1000; // 20 minutes
const chapterListInFlight = new Map<string, Promise<any[]>>();
const pagesInFlight = new Map<string, Promise<any[]>>();

/**
 * Get pages with caching
 */
export async function getChapterPages(url: string) {
    const now = Date.now();
    const redisKey = `${CHAPTER_PAGES_CACHE_KEY_PREFIX}${hashKey(url)}`;

    // Check cache first
    const cached = pagesCache.get(url);
    if (cached && (now - cached.timestamp) < PAGES_CACHE_TTL) {
        console.log(`[Cache] Chapter pages hit: ${url.slice(-30)}`);
        return cached.data;
    }

    const redisCached = await cacheGet<any[]>(redisKey);
    if (redisCached && redisCached.length > 0) {
        console.log(`[Cache] Chapter pages hit (redis): ${url.slice(-30)}`);
        pagesCache.set(url, { data: redisCached, timestamp: now });
        return redisCached;
    }

    const inFlight = pagesInFlight.get(url);
    if (inFlight) {
        console.log(`[Cache] Waiting for in-flight pages: ${url.slice(-30)}`);
        return inFlight;
    }
    const fetchPromise = (async () => {
        try {
            console.log(`[Fetch] Getting chapter pages: ${url.slice(-30)}`);
            let pages = await mangakatana.getChapterPages(url);

            // Retry once for transient scraper failures.
            if (!pages || pages.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
                pages = await mangakatana.getChapterPages(url);
            }

            // Cache successful results
            if (pages && pages.length > 0) {
                pagesCache.set(url, { data: pages, timestamp: Date.now() });
                cacheSet(redisKey, pages, Math.ceil(PAGES_CACHE_TTL / 1000)).catch((error) => {
                    console.warn(`[Cache] Redis write failed for chapter pages ${url.slice(-30)}`, error);
                });

                // Clean old entries if cache is too large
                if (pagesCache.size > 100) {
                    const cleanupNow = Date.now();
                    for (const [key, val] of pagesCache.entries()) {
                        if (cleanupNow - val.timestamp > PAGES_CACHE_TTL) {
                            pagesCache.delete(key);
                        }
                    }
                }
            }

            return pages;
        } finally {
            pagesInFlight.delete(url);
        }
    })();

    pagesInFlight.set(url, fetchPromise);
    return fetchPromise;
}

/**
 * Prefetch multiple chapters to warm the cache
 */
export async function prefetchChapters(urls: string[]) {
    console.log(`[Prefetch] Warming cache for ${urls.length} chapters`);
    // Process in background, don't await the results
    urls.forEach(async (url) => {
        try {
            // Check cache first to avoid unnecessary work
            const cached = pagesCache.get(url);
            const now = Date.now();
            if (!cached || (now - cached.timestamp) >= PAGES_CACHE_TTL) {
                await getChapterPages(url);
            }
        } catch (err) {
            console.error(`[Prefetch] Failed for ${url.slice(-30)}`, err);
        }
    });
    return { success: true, queued: urls.length };
}

// Simple in-memory cache for Hot Updates
let hotUpdatesCache: any[] | null = null;
let hotUpdatesCacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Spotlight cache (same TTL as hot updates)
let spotlightCache: any[] | null = null;
let spotlightCacheTime = 0;

export async function getHotUpdates() {
    const now = Date.now();
    if (hotUpdatesCache && (now - hotUpdatesCacheTime < CACHE_DURATION)) {
        console.log('Serving Hot Updates from cache');
        return hotUpdatesCache;
    }

    try {
        const updates = await mangakatana.getHotUpdates();
        const mappedUpdates = updates.map(u => ({ ...u, id: `mk:${u.id}` }));

        // Update cache
        if (mappedUpdates.length > 0) {
            hotUpdatesCache = mappedUpdates;
            hotUpdatesCacheTime = now;
        }

        return mappedUpdates;
    } catch (error) {
        console.error('Failed to update hot updates cache', error);
        // Return stale cache if available
        if (hotUpdatesCache) return hotUpdatesCache;
        return [];
    }
}

const MK_ITEMS_PER_PAGE = 20;
const APP_ITEMS_PER_PAGE = 24;

async function getPagedScraperManga(page: number, scraperFunc: (p: number) => Promise<{ results: any[], totalPages: number }>) {
    const startIndex = (page - 1) * APP_ITEMS_PER_PAGE;
    const endIndex = page * APP_ITEMS_PER_PAGE - 1;
    const startMkPage = Math.floor(startIndex / MK_ITEMS_PER_PAGE) + 1;
    const endMkPage = Math.floor(endIndex / MK_ITEMS_PER_PAGE) + 1;

    let allResults: any[] = [];
    let totalPages = 1;

    if (startMkPage === endMkPage) {
        const response = await scraperFunc(startMkPage);
        allResults = response.results;
        totalPages = response.totalPages || 1;
    } else {
        const [res1, res2] = await Promise.all([
            scraperFunc(startMkPage),
            scraperFunc(endMkPage)
        ]);
        allResults = [...res1.results, ...res2.results];
        totalPages = res1.totalPages || 1;
    }

    const startIdxInCombined = startIndex - ((startMkPage - 1) * MK_ITEMS_PER_PAGE);
    const slicedResults = allResults.slice(startIdxInCombined, startIdxInCombined + APP_ITEMS_PER_PAGE);
    const newTotalPages = Math.ceil((totalPages * MK_ITEMS_PER_PAGE) / APP_ITEMS_PER_PAGE);

    const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
    const mapped = slicedResults.map((item: any) => {
        const proxiedThumbnail = item.thumbnail && item.thumbnail.includes('mangakatana.com')
            ? `${API_BASE_URL}/image/proxy?url=${encodeURIComponent(item.thumbnail)}`
            : item.thumbnail;
            
        return {
            ...item,
            id: `mk:${item.id}`,
            thumbnail: proxiedThumbnail,
            coverImage: proxiedThumbnail
        };
    });
    
    return { data: mapped, totalPages: newTotalPages };
}

/**
 * Get latest manga updates (MangaKatana /latest)
 */
export async function getLatestManga(page: number = 1) {
    return getPagedScraperManga(page, mangakatana.getLatestManga);
}

/**
 * Get new manga (MangaKatana /new-manga)
 */
export async function getNewManga(page: number = 1) {
    return getPagedScraperManga(page, mangakatana.getNewManga);
}

/**
 * Get manga directory (MangaKatana /manga)
 */
export async function getMangaDirectory(page: number = 1) {
    return getPagedScraperManga(page, mangakatana.getMangaDirectory);
}

/**
 * Get Spotlight with enriched chapter info
 */
export async function getEnrichedSpotlight() {
    // Check cache first
    const now = Date.now();
    if (spotlightCache && (now - spotlightCacheTime < CACHE_DURATION)) {
        console.log('Serving Spotlight from cache');
        return spotlightCache;
    }

    try {
        // 1. Get Base Trending from AniList
        let topManga: any[] = [];
        try {
            const trending = await anilistService.getTrendingManga(1, 10);
            topManga = trending.media || [];
        } catch (e) {
            console.warn('AniList trending fetch failed, trying fallback...');
        }

        // FALLBACK: If AniList fails (empty array), use MangaKatana Hot Updates
        if (topManga.length === 0) {
            console.log('Using Hot Updates as Spotlight Fallback');
            const hotUpdates = await getHotUpdates();

            // Map Hot Updates to look like AniList Media objects
            const fallbackManga = hotUpdates.slice(0, 10).map((update: any) => ({
                id: update.id, // String ID (mk:...)
                title: {
                    english: update.title,
                    romaji: update.title,
                    native: update.title
                },
                description: `Latest chapter: ${update.chapter}. (Source: MangaKatana)`,
                coverImage: {
                    extraLarge: update.thumbnail,
                    large: update.thumbnail
                },
                format: 'MANGA',
                chapters: parseFloat(update.chapter) || 0,
                status: 'RELEASING',
                averageScore: 0,
                genres: ['Manga'],
                countryOfOrigin: 'JP'
            }));

            return fallbackManga;
        }

        // 2. Enrich with MangaKatana Chapters in BACKGROUND
        // We return the AniList data immediately so the UI doesn't block
        const limitedManga = topManga.slice(0, 8);

        // Start enrichment in background (fire and forget)
        enrichAndCache(limitedManga).catch(err => console.error('Background enrichment failed', err));

        return limitedManga;

    } catch (error) {
        console.error('Error fetching enriched spotlight:', error);
        return [];
    }
}

/**
 * Helper to enrich manga with chapter data and update cache
 */
async function enrichAndCache(mangaList: any[]) {
    console.log('Starting background spotlight enrichment...');
    const enriched = await Promise.all(mangaList.map(async (item: any) => {
        try {
            // Search by title
            const title = item.title?.english || item.title?.romaji || item.title?.native;
            if (!title) return item;

            // Use the EXPORTED searchManga to benefit from its cache
            const mkResults = await searchManga(title);

            // Find best match (simple check: first result)
            if (mkResults && mkResults.length > 0) {
                const match = mkResults[0];
                if (match.latestChapter) {
                    const numMatch = match.latestChapter.match(/(\d+[\.]?\d*)/);
                    if (numMatch) {
                        item.chapters = parseFloat(numMatch[1]);
                    }
                }
            }
        } catch (e) {
            // Ignore errors for individual items
        }
        return item;
    }));

    // Cache the results
    if (enriched.length > 0) {
        spotlightCache = enriched;
        spotlightCacheTime = Date.now();
        console.log(`[Cache] Updated spotlight cache with ${enriched.length} enriched items`);
    }
}

/**
 * Pre-warm the spotlight cache on server startup
 * This runs in the background so the server starts immediately
 */
export async function warmSpotlightCache() {
    console.log('[Cache] Pre-warming spotlight cache...');
    try {
        await getEnrichedSpotlight();
        console.log('[Cache] Spotlight cache warmed successfully');
    } catch (error) {
        console.error('[Cache] Failed to warm spotlight cache:', error);
    }
}

/**
 * Helper to enrich a list of scraper manga with AniList cover photos
 */
async function enrichWithAniListPhotos(mangaList: any[]) {
    console.log(`[MangaService] Enriching ${mangaList.length} items with AniList photos...`);
    
    // Process in parallel with a concurrency limit if needed, 
    // but here we just map and Promise.all to keep it simple as anilistService handles rate limiting.
    const enriched = await Promise.all(mangaList.map(async (item) => {
        try {
            // Check cache for this specific title mapping
            const cacheKey = `manga_photo_enrich:${item.title.toLowerCase().trim()}`;
            const cached = await cacheGet<string>(cacheKey);
            if (cached) {
                return { ...item, thumbnail: cached, coverImage: cached };
            }

            const searchResults = await anilistService.searchManga(item.title, 1, 1);
            if (searchResults.media && searchResults.media.length > 0) {
                const aniMedia = searchResults.media[0];
                const photo = aniMedia.coverImage?.extraLarge || aniMedia.coverImage?.large;
                if (photo) {
                    // Cache the found photo for 7 days
                    await cacheSet(cacheKey, photo, 7 * 24 * 60 * 60);
                    return { 
                        ...item, 
                        thumbnail: photo, 
                        coverImage: photo,
                        anilistId: aniMedia.id,
                        genres: aniMedia.genres
                    };
                }
            }
        } catch (e) {
            // Silently fail for individual items
        }

        // Fallback: If no AniList enrichment, proxy the original thumbnail to bypass hotlinking protection
        if (item.thumbnail && item.thumbnail.includes('mangakatana.com')) {
            const proxiedUrl = `http://localhost:3001/api/image/proxy?url=${encodeURIComponent(item.thumbnail)}`;
            return { ...item, thumbnail: proxiedUrl, coverImage: proxiedUrl };
        }

        return item;
    }));

    return enriched;
}
