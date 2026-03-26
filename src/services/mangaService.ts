// API Service for Manga operations - Using AniList
import type { Manga } from '../types/manga';
import axios from 'axios';
import { API_BASE } from '../config/api';
const apiClient = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
});
const chapterListCache = new Map<string, { data: any; timestamp: number }>();
const chapterPagesCache = new Map<string, { data: any; timestamp: number }>();
const chapterListInFlight = new Map<string, Promise<any>>();
const chapterPagesInFlight = new Map<string, Promise<any>>();
const CHAPTER_LIST_CACHE_TTL = 20 * 60 * 1000;
const CHAPTER_PAGES_CACHE_TTL = 30 * 60 * 1000;

interface AniListManga {
    id: number;
    title?: {
        english?: string;
        romaji?: string;
        native?: string;
    };
    coverImage?: {
        large?: string;
        extraLarge?: string;
    };
    description?: string;
    format?: string;
    chapters?: number;
    volumes?: number;
    averageScore?: number;
    status?: string;
    genres?: string[];
    startDate?: { year?: number; month?: number; day?: number };
    endDate?: { year?: number; month?: number; day?: number };
    countryOfOrigin?: string;
    synonyms?: string[];
    characters?: any;
    relations?: any;
}

const mapAnilistToManga = (item: AniListManga) => ({
    mal_id: item.id, // Use AniList ID as primary for routing to match backend expectation
    id: item.id,
    title: item.title?.english || item.title?.romaji || item.title?.native || 'Unknown',
    title_english: item.title?.english,
    title_romaji: item.title?.romaji,
    title_native: item.title?.native,
    title_japanese: item.title?.native,
    images: {
        jpg: {
            image_url: item.coverImage?.large || '',
            large_image_url: item.coverImage?.extraLarge || item.coverImage?.large || ''
        }
    },
    synopsis: item.description?.replace(/<[^>]*>/g, '') || '',
    type: item.format,
    chapters: item.chapters,
    volumes: item.volumes,
    score: item.averageScore ? item.averageScore / 10 : 0,
    status: item.status,
    genres: item.genres?.map((g: string) => ({ name: g, mal_id: 0 })) || [],
    authors: [],
    published: {
        from: item.startDate ? `${item.startDate.year}-${item.startDate.month}-${item.startDate.day}` : undefined,
        to: item.endDate ? `${item.endDate.year}-${item.endDate.month}-${item.endDate.day}` : undefined,
        string: item.startDate?.year ? `${item.startDate.year}` : undefined
    },
    countryOfOrigin: item.countryOfOrigin,
    synonyms: item.synonyms || [],
    characters: item.characters,
    relations: item.relations
});

const mapScraperToManga = (scraperData: ScraperManga) => ({
    mal_id: scraperData.id,
    id: scraperData.id,
    title: scraperData.title || 'Unknown',
    title_english: scraperData.altNames?.[0] || scraperData.title,
    title_romaji: scraperData.title,
    title_native: scraperData.altNames?.[scraperData.altNames?.length - 1],
    title_japanese: scraperData.altNames?.[scraperData.altNames?.length - 1],
    images: {
        jpg: {
            image_url: scraperData.coverImage || '',
            large_image_url: scraperData.coverImage || ''
        }
    },
    synopsis: scraperData.synopsis || 'No synopsis available from source.',
    type: 'Manga',
    chapters: Array.isArray(scraperData.chapters) ? scraperData.chapters.length : 0,
    volumes: 0,
    score: 0,
    status: scraperData.status || 'Unknown',
    genres: scraperData.genres?.map((g: string) => ({ name: g, mal_id: 0 })) || [],
    authors: scraperData.author ? [{ name: scraperData.author, role: 'Story & Art', mal_id: 0 }] : [],
    published: { from: '', to: '', string: '' },
    countryOfOrigin: 'JP'
});

interface ScraperManga {
    id: string;
    title: string;
    thumbnail?: string;
    coverImage?: string;
    url: string;
    latestChapter?: string;
    status?: string;
    genres?: string[];
    author?: string;
    source?: string;
    altNames?: string[];
    synopsis?: string;
    chapters?: any[];
}

export const mangaService = {
    // Fetch top manga from AniList (sorted by SCORE)
    async getTopManga(page: number = 1) {
        const res = await fetch(`${API_BASE}/anilist/top/manga?page=${page}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Fetch trending manga from AniList (sorted by TRENDING)
    async getTrendingManga(page: number = 1) {
        const res = await fetch(`${API_BASE}/anilist/trending/manga?page=${page}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Fetch all-time popular manga from AniList (sorted by POPULARITY)
    async getPopularManga(page: number = 1) {
        const res = await fetch(`${API_BASE}/anilist/popular/manga?page=${page}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Fetch popular manhwa from AniList
    async getPopularManhwa(page: number = 1) {
        const res = await fetch(`${API_BASE}/anilist/top/manhwa?page=${page}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Search manga via AniList
    async searchManga(query: string, page: number = 1, limit: number = 18) {
        const res = await fetch(`${API_BASE}/anilist/search/manga?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Get A-Z List for Manga via Backend (AniList)
    async getAZList(letter: string, page: number = 1) {
        const res = await fetch(`${API_BASE}/anilist/manga/az-list/${encodeURIComponent(letter)}?page=${page}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    async getOneShotManga(page: number = 1) {
        const res = await fetch(`${API_BASE}/anilist/top/one-shot?page=${page}`);
        const data = await res.json();
        return {
            data: data.media?.map(mapAnilistToManga) || [],
            pagination: {
                last_visible_page: data.pageInfo?.lastPage || 1,
                current_page: data.pageInfo?.currentPage || 1,
                has_next_page: data.pageInfo?.hasNextPage || false
            }
        };
    },

    // Get manga details by ID
    async getMangaDetails(id: number | string) {
        try {
            const res = await fetch(`${API_BASE}/anilist/manga/${id}`);
            if (!res.ok) throw new Error('Failed to fetch details');
            const data = await res.json();
            return { data: mapAnilistToManga(data) };
        } catch (e) {
            console.error('getMangaDetails failed:', e);
            return { data: null };
        }
    },

    // Get manga chapters from MangaKatana scraper
    async getChapters(mangaId: string) {
        const now = Date.now();
        const cached = chapterListCache.get(mangaId);
        if (cached && now - cached.timestamp < CHAPTER_LIST_CACHE_TTL) {
            return cached.data;
        }

        if (chapterListInFlight.has(mangaId)) {
            return chapterListInFlight.get(mangaId)!;
        }

        const request = apiClient
            .get(`/manga/chapters/${encodeURIComponent(mangaId)}`)
            .then(({ data }) => {
                if (data?.chapters && Array.isArray(data.chapters)) {
                    chapterListCache.set(mangaId, { data, timestamp: Date.now() });
                }
                return data;
            })
            .finally(() => {
                chapterListInFlight.delete(mangaId);
            });

        chapterListInFlight.set(mangaId, request);
        return request;
    },

    // Get chapter pages from MangaKatana scraper
    async getChapterPages(chapterUrl: string) {
        const now = Date.now();
        const cached = chapterPagesCache.get(chapterUrl);
        if (cached && now - cached.timestamp < CHAPTER_PAGES_CACHE_TTL) {
            return cached.data;
        }

        if (chapterPagesInFlight.has(chapterUrl)) {
            return chapterPagesInFlight.get(chapterUrl)!;
        }

        const fetchOnce = async () => {
            const { data } = await apiClient.get('/manga/pages', {
                params: { url: chapterUrl },
            });
            if (data?.pages && Array.isArray(data.pages)) {
                chapterPagesCache.set(chapterUrl, { data, timestamp: Date.now() });
            }
            return data;
        };

        const request = (async () => {
            try {
                return await fetchOnce();
            } catch {
                // Retry once to handle transient scraper/network failures.
                return fetchOnce();
            } finally {
                chapterPagesInFlight.delete(chapterUrl);
            }
        })();

        chapterPagesInFlight.set(chapterUrl, request);
        return request;
    },

    // Search manga on MangaKatana scraper with local pagination
    async searchMangaScraper(query: string, page: number = 1, limit: number = 18) {
        const res = await fetch(`${API_BASE}/manga/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data?.data || []);
        
        const safeLimit = Math.max(1, limit);
        const total = items.length;
        const lastPage = Math.max(1, Math.ceil(total / safeLimit));
        const currentPage = Math.min(Math.max(page, 1), lastPage);
        const start = (currentPage - 1) * safeLimit;
        
        const pageItems = items.slice(start, start + safeLimit).map((item: ScraperManga) => ({
            mal_id: item.id,
            id: item.id,
            title: item.title || 'Unknown',
            title_english: item.title,
            title_romaji: item.title,
            images: {
                jpg: {
                    image_url: item.thumbnail || item.coverImage || '',
                    large_image_url: item.thumbnail || item.coverImage || ''
                }
            },
            synopsis: '',
            type: 'Manga',
            chapters: 0,
            volumes: 0,
            score: 0,
            status: 'Unknown',
            genres: [],
            authors: [],
            published: { string: '' },
            countryOfOrigin: 'JP',
            latestChapter: item.latestChapter,
            source: item.source || 'mangakatana'
        }));

        return {
            data: pageItems,
            pagination: {
                last_visible_page: lastPage,
                current_page: currentPage,
                has_next_page: currentPage < lastPage
            }
        };
    },

    async getLatestMangaScraper(page: number = 1) {
        const res = await fetch(`${API_BASE}/manga/latest?page=${page}`);
        const data = await res.json();
        const items = data.data || [];
        const totalPages = data.pagination?.total_pages || (page + (items.length === 20 ? 1 : 0));
        return {
            data: items.map((item: ScraperManga) => ({ ...mapScraperToManga(item), latestChapter: item.latestChapter, id: item.id })),
            pagination: {
                last_visible_page: totalPages,
                current_page: page,
                has_next_page: page < totalPages
            }
        };
    },

    async getNewMangaScraper(page: number = 1) {
        const res = await fetch(`${API_BASE}/manga/new-manga?page=${page}`);
        const data = await res.json();
        const items = data.data || [];
        const totalPages = data.pagination?.total_pages || (page + (items.length === 20 ? 1 : 0));
        return {
            data: items.map((item: ScraperManga) => ({ ...mapScraperToManga(item), latestChapter: item.latestChapter, id: item.id })),
            pagination: {
                last_visible_page: totalPages,
                current_page: page,
                has_next_page: page < totalPages
            }
        };
    },

    async getMangaDirectory(page: number = 1) {
        const res = await fetch(`${API_BASE}/manga/directory?page=${page}`);
        const data = await res.json();
        const items = data.data || [];
        const totalPages = data.pagination?.total_pages || (page + (items.length === 20 ? 1 : 0));
        return {
            data: items.map((item: ScraperManga) => ({ ...mapScraperToManga(item), latestChapter: item.latestChapter, id: item.id })),
            pagination: {
                last_visible_page: totalPages,
                current_page: page,
                has_next_page: page < totalPages
            }
        };
    },

    async getHotUpdates() {
        const response = await fetch(`${API_BASE}/manga/hot-updates`);
        if (!response.ok) throw new Error('Failed to fetch hot updates');
        const data = await response.json();
        return data.data;
    },

    async prefetchChapters(urls: string[]) {
        try {
            await apiClient.post('/manga/prefetch', { urls });
        } catch (err) {
            console.error('Prefetch failed', err);
        }
    },

    async getEnrichedSpotlight() {
        const res = await fetch(`${API_BASE}/manga/spotlight`);
        const data = await res.json();
        return {
            data: data.data?.map(mapAnilistToManga) || []
        };
    },

    // Get scraper details (fallback for string IDs)
    // Get scraper details (fallback for string IDs)
    async getScraperMangaDetails(id: string) {
        try {
            const res = await fetch(`${API_BASE}/manga/details/${encodeURIComponent(id)}`);
            if (!res.ok) return null;
            const json = await res.json();
            const scraperData = json.data;

            if (!scraperData) return null;

            // 1. Attempt to resolve to AniList for rich metadata - DISABLED to prevent mismatches
            /*
            try {
                // Remove some common scraper noise from title if needed, or just use as is
                const searchRes = await this.searchManga(scraperData.title);
                const bestMatch = searchRes.data?.[0];

                if (bestMatch) {
                    const enrichedManga = { ...bestMatch };
                    if (scraperData.id) {
                        enrichedManga.scraper_id = scraperData.id;
                    }
                    return enrichedManga;
                }
            } catch (err) {
                console.warn('Failed to resolve scraper manga to AniList:', err);
            }
            */

            // 2. Fallback: Return mapped scraper data
            return mapScraperToManga(scraperData as any) as Manga;
        } catch (error) {
            console.error('getScraperMangaDetails failed:', error);
            return null;
        }
    },

    // Unified details endpoint (supports AniList numeric IDs and scraper IDs)
    async getUnifiedMangaDetails(id: string | number) {
        const res = await fetch(`${API_BASE}/manga/details/${encodeURIComponent(String(id))}`);
        if (!res.ok) throw new Error(`Failed to fetch unified manga details (${res.status})`);
        const json = await res.json();
        const data = json.data;
        if (!data) return null;

        // AniList-shaped payload
        if (data.title && typeof data.title === 'object') {
            return mapAnilistToManga(data);
        }

        // Scraper-shaped payload
        if (typeof data.title === 'string') {
            return mapScraperToManga(data);
        }

        return null;
    },

    // Get random manga (Client-side pool for speed)
    async getRandomManga() {
        // If queue is empty or running low, trigger a refill if not already happening
        if (randomMangaQueue.length === 0) {
            if (!refillPromise) {
                refillPromise = (async () => {
                    try {
                        const res = await fetch(`${API_BASE}/anilist/random-manga`);
                        if (!res.ok) throw new Error('Failed to fetch random manga batch');
                        const batch = await res.json();

                        // Shuffle the batch
                        for (let i = batch.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [batch[i], batch[j]] = [batch[j], batch[i]];
                        }

                        randomMangaQueue.push(...batch);
                    } catch (error) {
                        console.error('Error replenishing random manga queue:', error);
                        // Fallback if fetch fails
                        randomMangaQueue.push({ id: Math.floor(Math.random() * 50000) + 1 });
                    } finally {
                        refillPromise = null;
                    }
                })();
            }

            // Wait for the refill to complete
            await refillPromise;
        }

        return randomMangaQueue.pop() || { id: 1 };
    }
};

// Queue to store random manga IDs locally
const randomMangaQueue: { id: number }[] = [];
// Singleton promise to prevent parallel refill requests (race condition fix)
let refillPromise: Promise<void> | null = null;
