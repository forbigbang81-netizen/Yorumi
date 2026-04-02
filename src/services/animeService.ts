// API Service for Anime operations - Using AniList
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import axios from "axios";
import type { Anime } from "../types/anime";
import { db } from "./firebase";
import { API_BASE } from "../config/api";
import { getDisplayImageUrl } from "../utils/image";

const apiClient = axios.create({
    baseURL: API_BASE,
    timeout: 12000,
});

const API_ORIGIN = API_BASE.replace(/\/+$/, '').replace(/\/api$/i, '');
const normalizeProxyUrl = (url?: string) => {
    if (!url || typeof url !== 'string') return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/api/')) return `${API_ORIGIN}${url}`;
    return url;
};

// Helper to map AniList response to our Anime interface format
const mapAnilistToAnime = (item: any) => {
    // Debug metadata availability - Silenced to reduce console noise
    /*
    if (!item.streamingEpisodes || item.streamingEpisodes.length === 0) {
        console.warn('[AnimeService] No streaming episodes found for:', item.title?.english || item.id, item);
    } else {
        console.log('[AnimeService] Found streaming episodes for:', item.title?.english, item.streamingEpisodes.length);
    }
    */

    return {
        mal_id: item.idMal || item.id,
        id: item.id,
        title: item.title?.english || item.title?.romaji || item.title?.native || 'Unknown',
        title_japanese: item.title?.native,
        title_english: item.title?.english,
        title_romaji: item.title?.romaji,
        synonyms: item.synonyms || [],
        images: {
            jpg: {
                image_url: item.coverImage?.large || '',
                large_image_url: item.coverImage?.extraLarge || item.coverImage?.large || ''
            }
        },
        synopsis: item.description?.replace(/<[^>]*>/g, '') || '', // Strip HTML tags
        type: item.format,
        episodes: item.episodes,
        score: item.averageScore ? item.averageScore / 10 : 0,
        status: item.status,
        duration: item.duration ? `${item.duration} min` : undefined,
        rating: item.isAdult ? 'R+ - Mild Nudity' : undefined,
        genres: item.genres?.map((g: string) => ({ name: g, mal_id: 0 })) || [],
        studios: item.studios?.nodes?.map((s: any) => ({ name: s.name, mal_id: 0 })) || [],
        year: item.seasonYear || item.startDate?.year,
        season: item.season?.toLowerCase(),
        aired: {
            from: item.startDate ? `${item.startDate.year}-${item.startDate.month}-${item.startDate.day}` : undefined,
            to: item.endDate ? `${item.endDate.year}-${item.endDate.month}-${item.endDate.day}` : undefined,
            string: item.startDate?.year ? `${item.season || ''} ${item.startDate.year}`.trim() : undefined
        },
        anilist_banner_image: item.bannerImage,
        anilist_cover_image: item.coverImage?.extraLarge || item.coverImage?.large,
        countryOfOrigin: item.countryOfOrigin,
        nextAiringEpisode: item.nextAiringEpisode ? {
            episode: item.nextAiringEpisode.episode,
            timeUntilAiring: item.nextAiringEpisode.timeUntilAiring ?? (item.nextAiringEpisode.airingAt ? item.nextAiringEpisode.airingAt - Math.floor(Date.now() / 1000) : 0)
        } : undefined,
        // For ongoing anime, latest episode = next airing episode - 1
        latestEpisode: item.nextAiringEpisode ? item.nextAiringEpisode.episode - 1 : undefined,
        characters: item.characters, // Pass through the characters object directly as logic is handled in component or matches structure
        trailer: item.trailer ? {
            id: item.trailer.id,
            site: item.trailer.site,
            thumbnail: item.trailer.thumbnail
        } : undefined,
        episodeMetadata: item.streamingEpisodes?.map((e: any) => ({
            title: e.title,
            thumbnail: e.thumbnail,
            url: e.url,
            site: e.site
        })) || [],
        relations: item.relations // Map relations
    };
};

// Helper to map Scraper response to our Anime interface format
const mapScraperToAnime = (item: any) => {
    const score = typeof item.score === 'number' ? item.score : parseFloat(item.score || '0');
    const year = typeof item.year === 'number' ? item.year : parseInt(item.year || '', 10);
    const episodes = typeof item.episodes === 'number' ? item.episodes : parseInt(item.episodes || '', 10);
    const image = getDisplayImageUrl(item.poster || item.image || '');
    return {
        mal_id: 0,
        id: 0,
        scraperId: item.session || item.id,
        title: item.title || 'Unknown',
        title_english: item.title,
        title_romaji: item.title,
        images: {
            jpg: {
                image_url: image,
                large_image_url: image
            }
        },
        synopsis: '',
        type: item.type || 'TV',
        episodes: Number.isFinite(episodes) ? episodes : null,
        score: Number.isFinite(score) ? score : 0,
        status: item.status || 'Unknown',
        genres: [],
        studios: [],
        year: Number.isFinite(year) ? year : undefined,
        aired: {
            string: Number.isFinite(year) ? String(year) : ''
        }
    };
};

const mapTopTenItemToAnime = (item: any, index: number): Anime => {
    const anime = mapAnilistToAnime(item.anilist || {}) as Anime;
    if (item.poster) {
        const posterUrl = getDisplayImageUrl(item.poster);
        anime.images.jpg.image_url = posterUrl;
        anime.images.jpg.large_image_url = posterUrl;
        anime.anilist_cover_image = posterUrl;
    }
    if (!item.anilist || !item.anilist.id) {
        const fallbackId = parseInt(item.dataId || '', 10) || 0;
        anime.id = fallbackId || anime.id || 0;
        anime.mal_id = fallbackId || anime.mal_id || 0;
        anime.title = item.title || anime.title;
        anime.score = anime.score || 0;
        anime.type = anime.type || 'TV';
        anime.episodes = anime.episodes ?? (item.sub || null);
    }
    if (!anime.mal_id) {
        anime.mal_id = (parseInt(item.dataId || '', 10) || 0) || (index + 1);
    }
    if (item.sub && !anime.latestEpisode) {
        anime.latestEpisode = item.sub;
    }
    if (item.scraperId) {
        anime.scraperId = item.scraperId;
    }
    return anime;
};

const hasAvailableEpisodes = (anime: Anime) => {
    const latestEpisode = Number(anime.latestEpisode || 0);
    const totalEpisodes = Number(anime.episodes || 0);
    return latestEpisode > 0 || totalEpisodes > 0;
};

const isReleasedTrendingAnime = (anime: Anime) => {
    const status = String(anime.status || '').toUpperCase();
    if (status === 'NOT_YET_RELEASED') return false;
    return hasAvailableEpisodes(anime);
};

// Simple in-memory cache
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DETAIL_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for anime details + episodes
const streamCache = new Map<string, { data: any, timestamp: number }>();
const STREAM_CACHE_TTL = 20 * 60 * 1000; // 20 minutes
const mappingCache = new Map<string, string>();
const scraperSearchCache = new Map<string, { data: any[]; timestamp: number }>();
const SCRAPER_SEARCH_TTL = 5 * 60 * 1000;
const PERSISTED_CACHE_PREFIX = 'yorumi_api_cache_v3';
const PERSISTED_STREAM_CACHE_PREFIX = 'yorumi_stream_cache_v1';

const readPersistedCache = (key: string, ttl: number) => {
    try {
        const raw = localStorage.getItem(`${PERSISTED_CACHE_PREFIX}:${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { data: any; timestamp: number };
        if (!parsed || typeof parsed.timestamp !== 'number') return null;
        if (Date.now() - parsed.timestamp > ttl) {
            localStorage.removeItem(`${PERSISTED_CACHE_PREFIX}:${key}`);
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
};

const writePersistedCache = (key: string, data: any, timestamp: number) => {
    try {
        localStorage.setItem(
            `${PERSISTED_CACHE_PREFIX}:${key}`,
            JSON.stringify({ data, timestamp })
        );
    } catch {
        // Ignore quota/storage errors.
    }
};

const getCached = (key: string, customTtl?: number) => {
    if (cache.has(key)) {
        const entry = cache.get(key)!;
        const ttl = customTtl ?? CACHE_TTL;
        if (Date.now() - entry.timestamp < ttl) {
            return entry.data;
        }
        cache.delete(key);
    }
    const persisted = readPersistedCache(key, customTtl ?? CACHE_TTL);
    if (persisted) {
        cache.set(key, { data: persisted, timestamp: Date.now() });
        return persisted;
    }
    return null;
};

const setCache = (key: string, data: any, _customTtl?: number) => {
    const timestamp = Date.now();
    cache.set(key, { data, timestamp });
    writePersistedCache(key, data, timestamp);
};

const clearCacheEntry = (key: string) => {
    cache.delete(key);
    try {
        localStorage.removeItem(`${PERSISTED_CACHE_PREFIX}:${key}`);
    } catch {
        // Ignore storage errors.
    }
};

const getCachedStream = (key: string) => {
    if (streamCache.has(key)) {
        const entry = streamCache.get(key)!;
        if (Date.now() - entry.timestamp < STREAM_CACHE_TTL) {
            return entry.data;
        }
        streamCache.delete(key);
    }
    try {
        const raw = sessionStorage.getItem(`${PERSISTED_STREAM_CACHE_PREFIX}:${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { data: any; timestamp: number };
        if (!parsed || typeof parsed.timestamp !== 'number') return null;
        if (Date.now() - parsed.timestamp >= STREAM_CACHE_TTL) {
            sessionStorage.removeItem(`${PERSISTED_STREAM_CACHE_PREFIX}:${key}`);
            return null;
        }
        streamCache.set(key, { data: parsed.data, timestamp: parsed.timestamp });
        return parsed.data;
    } catch {
        return null;
    }
    return null;
};

const setCachedStream = (key: string, data: any) => {
    const timestamp = Date.now();
    streamCache.set(key, { data, timestamp });
    try {
        sessionStorage.setItem(
            `${PERSISTED_STREAM_CACHE_PREFIX}:${key}`,
            JSON.stringify({ data, timestamp })
        );
    } catch {
        // Ignore storage quota issues.
    }
};

const clearCachedStream = (key: string) => {
    streamCache.delete(key);
    try {
        sessionStorage.removeItem(`${PERSISTED_STREAM_CACHE_PREFIX}:${key}`);
    } catch {
        // Ignore storage errors.
    }
};

const getAnimeDetailsCacheKey = (id: number | string) => `anime-details:v2:${id}`;
const getAnimeDetailsFastCacheKey = (id: number | string) => `anime-details-fast:v4:${id}`;

// Track in-flight requests to prevent duplicates
const inFlightRequests = new Map<string, Promise<any>>();
export const animeService = {
    peekAnimeDetailsCache(id: number | string) {
        return getCached(getAnimeDetailsCacheKey(id), DETAIL_CACHE_TTL);
    },

    peekAnimeDetailsFastCache(id: number | string) {
        return getCached(getAnimeDetailsFastCacheKey(id), DETAIL_CACHE_TTL);
    },

    async getHomeFastData() {
        const cacheKey = 'home-fast-data-v1';
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;

        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/anilist/home-fast`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch fast home data: ${res.statusText}`);
                }
                const payload = await res.json();

                const spotlightAnime = Array.isArray(payload?.spotlight)
                    ? payload.spotlight.map((item: any) => {
                        const anime = mapAnilistToAnime(item.anilist || {}) as Anime;
                        if (item.banner) anime.anilist_banner_image = item.banner;
                        if (item.poster) {
                            const posterUrl = getDisplayImageUrl(item.poster);
                            anime.images.jpg.image_url = posterUrl;
                            anime.images.jpg.large_image_url = posterUrl;
                            anime.anilist_cover_image = posterUrl;
                        }
                        if (item.scraperId) anime.scraperId = item.scraperId;
                        return anime;
                    })
                    : [];

                const result = {
                    spotlightAnime,
                    trendingAnime: (payload?.trending?.media?.map(mapAnilistToAnime) || []).filter(isReleasedTrendingAnime),
                    popularSeason: payload?.seasonal?.media?.map(mapAnilistToAnime) || [],
                    popularMonth: payload?.monthly?.media?.map(mapAnilistToAnime) || [],
                    topAnime: payload?.topAnime?.media?.map(mapAnilistToAnime) || [],
                    topAnimePagination: {
                        last_visible_page: payload?.topAnime?.pageInfo?.lastPage || 1,
                        current_page: payload?.topAnime?.pageInfo?.currentPage || 1,
                        has_next_page: payload?.topAnime?.pageInfo?.hasNextPage || false,
                    },
                    topTenToday: Array.isArray(payload?.topTen?.day) ? payload.topTen.day.map(mapTopTenItemToAnime) : [],
                    topTenWeek: Array.isArray(payload?.topTen?.week) ? payload.topTen.week.map(mapTopTenItemToAnime) : [],
                    topTenMonth: Array.isArray(payload?.topTen?.month) ? payload.topTen.month.map(mapTopTenItemToAnime) : [],
                };

                setCache(cacheKey, result, DETAIL_CACHE_TTL);
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    peekTopAnime(page: number = 1, format?: string) {
        const cacheKey = `top-anime-${page}-${format ?? 'all'}`;
        return getCached(cacheKey);
    },

    prefetchTopAnimeFormats() {
        const formats: Array<string | undefined> = [undefined, 'MOVIE', 'TV', 'OVA', 'ONA', 'SPECIAL'];
        Promise.allSettled(formats.map((format) => this.getTopAnime(1, format))).catch(() => undefined);
    },

    // Fetch top anime from AniList (Deduplicated)
    async getTopAnime(page: number = 1, format?: string) {
        const cacheKey = `top-anime-${page}-${format ?? 'all'}`;
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;

        // Check for in-flight request
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const formatParam = format ? `&format=${encodeURIComponent(format)}` : '';
                const res = await fetch(`${API_BASE}/anilist/top?page=${page}&limit=18${formatParam}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch top anime: ${res.statusText}`);
                }
                const data = await res.json();
                const result = {
                    data: (data.media?.map(mapAnilistToAnime) || []).filter(isReleasedTrendingAnime),
                    pagination: {
                        last_visible_page: data.pageInfo?.lastPage || 1,
                        current_page: data.pageInfo?.currentPage || 1,
                        has_next_page: data.pageInfo?.hasNextPage || false
                    }
                };

                if (result.data.length > 0) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    // Search anime via AniList
    async searchAnime(query: string, page: number = 1, limit: number = 18) {
        const res = await fetch(`${API_BASE}/anilist/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToAnime) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Search anime on scraper (AnimePahe)
    async searchAnimeScraper(query: string, page: number = 1, limit: number = 18) {
        const normalizedQuery = query.trim().toLowerCase();
        const cacheKey = `scraper-search:${normalizedQuery}`;

        let items = getCached(cacheKey) as any[] | null;
        if (!items) {
            const mem = scraperSearchCache.get(cacheKey);
            if (mem && Date.now() - mem.timestamp < SCRAPER_SEARCH_TTL) {
                items = mem.data;
            }
        }

        if (!items) {
            if (inFlightRequests.has(cacheKey)) {
                items = await inFlightRequests.get(cacheKey);
            } else {
                const fetchPromise = (async () => {
                    const { data } = await apiClient.get('/scraper/search', {
                        params: { q: query },
                    });
                    return Array.isArray(data) ? data : (data?.data || []);
                })()
                    .finally(() => {
                        inFlightRequests.delete(cacheKey);
                    });
                inFlightRequests.set(cacheKey, fetchPromise);
                items = await fetchPromise;
            }

            const fetchedItems = items ?? [];
            items = fetchedItems;
            setCache(cacheKey, fetchedItems);
            scraperSearchCache.set(cacheKey, { data: fetchedItems, timestamp: Date.now() });
        }

        const resolvedItems = items ?? [];
        const safeLimit = Math.max(1, limit);
        const total = resolvedItems.length;
        const lastPage = Math.max(1, Math.ceil(total / safeLimit));
        const currentPage = Math.min(Math.max(page, 1), lastPage);
        const start = (currentPage - 1) * safeLimit;
        const pageItems = resolvedItems.slice(start, start + safeLimit).map(mapScraperToAnime);
        return {
            data: pageItems,
            pagination: {
                last_visible_page: lastPage,
                current_page: currentPage,
                has_next_page: currentPage < lastPage
            }
        };
    },

    // Get A-Z List from HiAnime Scraper
    async getAZList(letter: string, page: number = 1) {
        const res = await fetch(`${API_BASE}/hianime/az-list/${encodeURIComponent(letter)}?page=${page}`);
        const data = await res.json();

        return {
            data: data.data?.map((item: any) => ({
                mal_id: 0,
                id: 0,
                scraperId: item.id,
                title: item.title,
                images: {
                    jpg: {
                        image_url: item.poster,
                        large_image_url: item.poster
                    }
                },
                type: item.type,
                type_display: item.type,
                score: 0,
                status: 'Unknown',
                episodes: null,
                duration: null,
                rating: null,
                genres: [],
                synopsis: '',
                season: null,
                year: null,
                aired: { string: '' },
                studios: [],
                members: 0,
                rank: 0,
                popularity: 0,
                favorites: 0,
                source: 'Scraper',
                is_scraped: true
            })) || [],
            pagination: data.pagination
        };
    },

    // Get anime details from AniList
    async getAnimeDetails(id: number | string) {
        const cacheKey = getAnimeDetailsCacheKey(id);
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/anilist/anime/${id}`);
                const data = await res.json();
                if (!data || data.error) return { data: null };
                const result = { data: mapAnilistToAnime(data) };
                if (result.data) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    async getAnimeDetailsFast(id: number | string) {
        const cacheKey = getAnimeDetailsFastCacheKey(id);
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) {
            const cachedEpisodes = Array.isArray((cached as any)?.episodes) ? (cached as any).episodes : [];
            const cachedSession = String((cached as any)?.scraperSession || '').trim();
            if (cachedEpisodes.length > 0 || cachedSession) {
                return cached;
            }
        }
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/anilist/anime/${id}/fast`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch fast anime details: ${res.statusText}`);
                }
                const payload = await res.json();
                const mappedAnime = payload?.anime ? (mapAnilistToAnime(payload.anime) as Anime) : null;
                if (mappedAnime && payload?.scraperSession) {
                    mappedAnime.scraperId = String(payload.scraperSession);
                }
                const result = {
                    data: mappedAnime,
                    episodes: Array.isArray(payload?.episodes) ? payload.episodes : [],
                    scraperSession: payload?.scraperSession ? String(payload.scraperSession) : null,
                };
                if (result.episodes.length > 0 || result.scraperSession) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    // Identify AniList ID from Scraper Slug/Title
    async identifyAnime(slug: string, title: string) {
        const res = await fetch(`${API_BASE}/mapping/identify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, title })
        });
        if (!res.ok) return null;
        return res.json();
    },

    // Search anime on scraper (HiAnime)
    async searchScraper(title: string) {
        const { data } = await apiClient.get('/scraper/search', {
            params: { q: title },
        });
        return data;
    },

    // Get popular this season from AniList (Deduplicated)
    async getPopularThisSeason(page: number = 1, limit: number = 10) {
        const cacheKey = `popular-season-${page}-${limit}`;
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;

        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/anilist/popular-this-season?page=${page}&limit=${limit}`);
                if (!res.ok) {
                    console.warn(`Failed to fetch popular season: ${res.statusText}`);
                    return { data: [], pagination: null };
                }
                const data = await res.json();
                const result = {
                    data: data.media?.map(mapAnilistToAnime) || [],
                    pagination: {
                        last_visible_page: data.pageInfo?.lastPage || 1,
                        current_page: data.pageInfo?.currentPage || 1,
                        has_next_page: data.pageInfo?.hasNextPage || false
                    }
                };

                if (result.data.length > 0) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },


    // Get episodes from scraper. Backend/Redis is the primary cache layer.
    async getEpisodes(session: string) {
        const cacheKey = `episodes:v4:${session}`;
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const CACHE_COLLECTION = "anime_episodes_v4";
        const docRef = doc(db, CACHE_COLLECTION, session);

        const readFirebaseEpisodes = async (timeoutMs: number): Promise<{ episodes: any[] } | null> => {
            try {
                const docSnap = await Promise.race([
                    getDoc(docRef),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
                ]);
                if (!docSnap || !docSnap.exists()) return null;
                const local = docSnap.data();
                if (!Array.isArray(local?.episodes) || local.episodes.length === 0) return null;
                return { episodes: local.episodes };
            } catch (error) {
                console.warn("[AnimeService] Firebase read error:", error);
                return null;
            }
        };

        const fetchFromBackend = async () => {
            const { data } = await apiClient.get('/scraper/episodes', {
                params: { session },
            });

            if (data?.episodes && Array.isArray(data.episodes) && data.episodes.length > 0) {
                setCache(cacheKey, data, DETAIL_CACHE_TTL);
                // Persist cache asynchronously; don't block the UI.
                setDoc(docRef, {
                    episodes: data.episodes,
                    lastUpdated: Date.now()
                }).catch((error) => {
                    console.warn("[AnimeService] Firebase write error:", error);
                });
            }

            return data;
        };

        const fetchPromise = (async () => {
            const backendPromise = fetchFromBackend();
            try {
                // Fast path: if Firebase has episodes cached, render immediately.
                // Keep backend request running in background to refresh cache.
                const quickFirebase = await readFirebaseEpisodes(350);
                if (quickFirebase) {
                    setCache(cacheKey, quickFirebase, DETAIL_CACHE_TTL);
                    backendPromise.catch(() => undefined);
                    return quickFirebase;
                }

                return await backendPromise;
            } catch (primaryError) {
                // Fallback to Firebase cache if backend request fails.
                const fallback = await readFirebaseEpisodes(1200);
                if (fallback) {
                    setCache(cacheKey, fallback, DETAIL_CACHE_TTL);
                    return fallback;
                }

                throw primaryError;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    // Get mapping from AniList ID to Scraper Session
    async getAnimeMapping(malId: string | number) {
        const key = String(malId);
        const cached = mappingCache.get(key);
        if (cached) return cached;

        const docRef = doc(db, "anime_mappings", key);
        try {
            const docSnap = await Promise.race([
                getDoc(docRef),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
            ]);
            if (!docSnap) return null;
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.session) {
                    mappingCache.set(key, data.session);
                    return data.session;
                }
            }
        } catch (error) {
            console.warn("[AnimeService] Error fetching mapping:", error);
        }
        return null;
    },

    // Save mapping
    async saveAnimeMapping(malId: string | number, session: string) {
        if (!session) return;
        const key = String(malId);
        mappingCache.set(key, session);
        const docRef = doc(db, "anime_mappings", key);
        try {
            await setDoc(docRef, {
                session,
                lastUpdated: Date.now()
            });
            console.log(`[AnimeService] Saved mapping: ${malId} -> ${session}`);
        } catch (error) {
            console.warn("[AnimeService] Error saving mapping:", error);
        }
    },

    async clearAnimeMapping(malId: string | number) {
        const key = String(malId);
        mappingCache.delete(key);
        const docRef = doc(db, "anime_mappings", key);
        try {
            await deleteDoc(docRef);
        } catch {
            // no-op
        }
    },

    invalidateAnimeDetailsFast(id: number | string) {
        clearCacheEntry(`anime-details-fast:v4:${id}`);
    },

    // Get stream links from scraper
    async getStreams(animeSession: string, episodeSession: string) {
        const cacheKey = `streams:${animeSession}:${episodeSession}`;
        const cached = getCachedStream(cacheKey);
        if (cached) return cached;

        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const { data } = await apiClient.get('/scraper/streams', {
                    params: {
                        anime_session: animeSession,
                        ep_session: episodeSession,
                    },
                });
                const normalized = Array.isArray(data)
                    ? data.map((item: any) => ({
                        ...item,
                        url: normalizeProxyUrl(item?.url),
                        subtitles: Array.isArray(item?.subtitles)
                            ? item.subtitles.map((sub: any) => ({
                                ...sub,
                                url: normalizeProxyUrl(sub?.url),
                            }))
                            : item?.subtitles,
                    }))
                    : data;
                if (Array.isArray(normalized) && normalized.length > 0) {
                    setCachedStream(cacheKey, normalized);
                }
                return normalized;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    invalidateStreamCache(animeSession: string, episodeSession?: string) {
        if (!animeSession) return;

        if (episodeSession) {
            clearCachedStream(`streams:${animeSession}:${episodeSession}`);
            inFlightRequests.delete(`streams:${animeSession}:${episodeSession}`);
            return;
        }

        const prefix = `streams:${animeSession}:`;
        Array.from(streamCache.keys())
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => clearCachedStream(key));
        Array.from(inFlightRequests.keys())
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => inFlightRequests.delete(key));
        try {
            for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith(`${PERSISTED_STREAM_CACHE_PREFIX}:${prefix}`)) {
                    sessionStorage.removeItem(key);
                }
            }
        } catch {
            // Ignore storage errors.
        }
    },

    // Get popular this month from AniList (Deduplicated)
    async getPopularThisMonth(page: number = 1, limit: number = 10) {
        const cacheKey = `popular-month-${page}-${limit}`;
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;

        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/anilist/popular-this-month?page=${page}&limit=${limit}`);
                if (!res.ok) {
                    console.warn(`Failed to fetch popular this month: ${res.statusText}`);
                    return { data: [], pagination: null };
                }
                const data = await res.json();
                const result = {
                    data: data.media?.map(mapAnilistToAnime) || [],
                    pagination: {
                        last_visible_page: data.pageInfo?.lastPage || 1,
                        current_page: data.pageInfo?.currentPage || 1,
                        has_next_page: data.pageInfo?.hasNextPage || false
                    }
                };

                if (result.data.length > 0) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    // Get AniWatch Top 10 (Today/Week/Month)
    async getAniwatchTopTen(range: 'day' | 'week' | 'month') {
        const cacheKey = `aniwatch-top10-${range}`;
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;

        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/hianime/top10?range=${range}`);
                if (!res.ok) {
                    console.warn(`Failed to fetch AniWatch top10 (${range}): ${res.statusText}`);
                    return { data: [] };
                }
                const payload = await res.json();
                const top10 = payload.top10 || [];
                const data = top10.map(mapTopTenItemToAnime);

                const result = { data };
                if (data.length > 0) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },


    async prefetchStreams(animeSession: string, episodeSessions: string[]) {
        const sessions = [...new Set(episodeSessions.filter(Boolean))];
        if (!animeSession || sessions.length === 0) return;

        await fetch(`${API_BASE}/scraper/prefetch/streams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                anime_session: animeSession,
                ep_sessions: sessions,
            }),
        }).catch(() => undefined);
    },

    // Get spotlight (AniWatch/HiAnime scraper, enriched with AniList data)
    async getSpotlightAnime() {
        try {
            const res = await fetch(`${API_BASE}/hianime/spotlight`);
            if (!res.ok) throw new Error('Failed to fetch AniWatch spotlight');
            const { spotlight } = await res.json();

            // Map to Anime interface
            const data = (spotlight || []).map((item: any) => {
                // Base metadata from AniList
                const anime = mapAnilistToAnime(item.anilist || {});

                // Override images with AniWatch/HiAnime high-res versions
                if (item.banner) {
                    anime.anilist_banner_image = item.banner;
                }
                if (item.poster) {
                    const posterUrl = getDisplayImageUrl(item.poster);
                    anime.images.jpg.image_url = posterUrl;
                    anime.images.jpg.large_image_url = posterUrl;
                    anime.anilist_cover_image = posterUrl;
                }
                return anime;
            });
            return { data };
        } catch (error) {
            console.error('Error in getSpotlightAnime:', error);
            // Fallback to trending
            return this.getTrendingAnime();
        }
    },

    // Search AniList (returns raw AniList data for spotlight resolution)
    async searchAnilist(query: string) {
        const res = await fetch(`${API_BASE}/anilist/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        return res.json();
    },

    // Get trending anime from AniList (Deduplicated)
    async getTrendingAnime(page: number = 1, limit: number = 10) {
        const cacheKey = `trending-${page}-${limit}`;
        const cached = getCached(cacheKey, DETAIL_CACHE_TTL);
        if (cached) return cached;

        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const res = await fetch(`${API_BASE}/anilist/trending?page=${page}&limit=${limit}`);
                if (!res.ok) {
                    console.warn(`Failed to fetch trending: ${res.statusText}`);
                    return { data: [], pagination: null };
                }

                const data = await res.json();
                const result = {
                    data: data.media?.map(mapAnilistToAnime) || [],
                    pagination: {
                        last_visible_page: data.pageInfo?.lastPage || 1,
                        current_page: data.pageInfo?.currentPage || 1,
                        has_next_page: data.pageInfo?.hasNextPage || false
                    }
                };

                if (result.data.length > 0) {
                    setCache(cacheKey, result, DETAIL_CACHE_TTL);
                }
                return result;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    },

    // Get airing schedule for a time range
    async getAiringSchedule(start: number, end: number) {
        const res = await fetch(`${API_BASE}/anilist/schedule?start=${start}&end=${end}`);
        if (!res.ok) throw new Error('Failed to fetch schedule');
        return res.json();
    },

    // Get list of genres
    async getGenres() {
        const res = await fetch(`${API_BASE}/anilist/genres`);
        if (!res.ok) throw new Error('Failed to fetch genres');
        return res.json();
    },

    // Get random anime (Client-side pool for speed)
    async getRandomAnime() {
        // If queue is empty or running low, trigger a refill if not already happening
        if (randomAnimeQueue.length === 0) {
            if (!refillPromise) {
                refillPromise = (async () => {
                    try {
                        const res = await fetch(`${API_BASE}/anilist/random`);
                        if (!res.ok) throw new Error('Failed to fetch random anime batch');
                        const batch = await res.json();

                        // Shuffle the batch
                        for (let i = batch.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [batch[i], batch[j]] = [batch[j], batch[i]];
                        }

                        randomAnimeQueue.push(...batch);
                    } catch (error) {
                        console.error('Error replenishing random queue:', error);
                        // Fallback if fetch fails
                        randomAnimeQueue.push({ id: Math.floor(Math.random() * 50000) + 1 });
                    } finally {
                        refillPromise = null;
                    }
                })();
            }

            // Wait for the refill to complete
            await refillPromise;
        }

        return randomAnimeQueue.pop() || { id: 1 };
    },

};

// Queue to store random anime IDs locally
const randomAnimeQueue: { id: number }[] = [];
// Singleton promise to prevent parallel refill requests (race condition fix)
let refillPromise: Promise<void> | null = null;

