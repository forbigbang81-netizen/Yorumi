import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import type { Anime, Episode } from '../types/anime';
import { animeService } from '../services/animeService';
import { useContinueWatching } from '../hooks/useContinueWatching';
import { storage } from '../utils/storage';
import { preloadLogos } from '../components/anime/AnimeLogoImage';
import { useAuth } from './AuthContext';
import { getDisplayImageUrl } from '../utils/image';

interface AnimeContextType {
    // State
    topAnime: Anime[];
    spotlightAnime: Anime[];
    trendingAnime: Anime[];
    popularSeason: Anime[];
    popularMonth: Anime[];
    topTenToday: Anime[];
    topTenWeek: Anime[];
    topTenMonth: Anime[];
    selectedAnime: Anime | null;
    showAnimeDetails: boolean;
    showWatchModal: boolean;
    episodes: Episode[];
    scraperSession: string | null;
    epLoading: boolean;
    episodesResolved: boolean;
    detailsLoading: boolean;
    loading: boolean;
    spotlightLoading: boolean;
    trendingLoading: boolean;
    popularSeasonLoading: boolean;
    popularMonthLoading: boolean;
    topTenLoading: boolean;
    currentPage: number;
    lastVisiblePage: number;
    error: string | null;
    episodeSearchQuery: string;

    // View All State
    viewAllAnime: Anime[];
    viewAllLoading: boolean;
    viewAllPagination: {
        last_visible_page: number;
        current_page: number;
        has_next_page: boolean;
    };
    viewMode: 'default' | 'trending' | 'seasonal' | 'continue_watching' | 'popular';

    // Actions
    setEpisodeSearchQuery: (query: string) => void;
    handleAnimeClick: (anime: Anime) => Promise<void>;
    startWatching: () => void;
    watchAnime: (anime: Anime) => void;
    closeDetails: () => void;
    closeWatch: () => void;
    closeAllModals: () => void;
    changePage: (page: number) => void;
    openViewAll: (type: 'trending' | 'seasonal' | 'continue_watching' | 'popular') => void;
    closeViewAll: () => void;
    changeViewAllPage: (page: number) => void;
    prefetchEpisodes: (anime: Anime) => void;
    prefetchPage: (page: number) => void;
    fetchHomeData: () => Promise<void>;

    // Continue Watching
    continueWatchingList: any[];
    saveProgress: (
        anime: Anime,
        episode: any,
        playback?: { positionSeconds?: number; durationSeconds?: number }
    ) => void;
    removeFromHistory: (malId: number | string) => void;

    // Episode Tracking
    watchedEpisodes: Set<number>;
    markEpisodeComplete: (episodeNumber: number) => void;
}

const AnimeContext = createContext<AnimeContextType | undefined>(undefined);

export function AnimeProvider({ children }: { children: ReactNode }) {
    const { continueWatchingList, saveProgress, removeFromHistory } = useContinueWatching();
    const { user } = useAuth();

    // Cache reader (defined early so useState initializers can use it)
    const HOME_CACHE_PREFIX = 'yorumi_home_cache_v2';
    const readHomeCache = <T,>(key: string, ttlMs: number): T | null => {
        try {
            const raw = localStorage.getItem(`${HOME_CACHE_PREFIX}:${key}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as { timestamp: number; data: T };
            if (!parsed || typeof parsed.timestamp !== 'number') return null;
            if (Date.now() - parsed.timestamp > ttlMs) return null;
            return parsed.data;
        } catch {
            return null;
        }
    };

    // TTL constants for cache hydration
    const HOME_TTL_TOPTEN = 10 * 60 * 1000;
    const HOME_TTL_SPOTLIGHT = 12 * 60 * 60 * 1000;
    const HOME_TTL_TRENDING = 10 * 60 * 1000;
    const HOME_TTL_SEASON = 10 * 60 * 1000;
    const HOME_TTL_MONTH = 10 * 60 * 1000;

    // Synchronous cache hydration for instant first render
    const cachedTopTenInit = readHomeCache<{ day: Anime[]; week: Anime[]; month: Anime[] }>('top-ten', HOME_TTL_TOPTEN);
    const cachedSpotlightInit = readHomeCache<Anime[]>('spotlight', HOME_TTL_SPOTLIGHT);
    const cachedTrendingInit = readHomeCache<Anime[]>('trending', HOME_TTL_TRENDING);
    const cachedSeasonInit = readHomeCache<Anime[]>('popular-season', HOME_TTL_SEASON);
    const cachedMonthInit = readHomeCache<Anime[]>('popular-month', HOME_TTL_MONTH);

    // Data State — pre-filled from cache when available
    const [topAnime, setTopAnime] = useState<Anime[]>([]);
    const [spotlightAnime, setSpotlightAnime] = useState<Anime[]>(cachedSpotlightInit ?? []);
    const [trendingAnime, setTrendingAnime] = useState<Anime[]>(cachedTrendingInit ?? []);
    const [popularSeason, setPopularSeason] = useState<Anime[]>(cachedSeasonInit ?? []);
    const [popularMonth, setPopularMonth] = useState<Anime[]>(cachedMonthInit ?? []);
    const [topTenToday, setTopTenToday] = useState<Anime[]>(cachedTopTenInit?.day ?? []);
    const [topTenWeek, setTopTenWeek] = useState<Anime[]>(cachedTopTenInit?.week ?? []);
    const [topTenMonth, setTopTenMonth] = useState<Anime[]>(cachedTopTenInit?.month ?? []);
    const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
    const [watchedEpisodes, setWatchedEpisodes] = useState<Set<number>>(new Set());

    // UI State (Modals - Kept for compatibility but might not be used in page router mainly)
    const [showAnimeDetails, setShowAnimeDetails] = useState(false);
    const [showWatchModal, setShowWatchModal] = useState(false);

    // Loading States — false when cache provided data
    const [loading, setLoading] = useState(true);
    const [spotlightLoading, setSpotlightLoading] = useState(!cachedSpotlightInit?.length);
    const [trendingLoading, setTrendingLoading] = useState(!cachedTrendingInit?.length);
    const [popularSeasonLoading, setPopularSeasonLoading] = useState(!cachedSeasonInit?.length);
    const [popularMonthLoading, setPopularMonthLoading] = useState(!cachedMonthInit?.length);
    const [topTenLoading, setTopTenLoading] = useState(
        !(cachedTopTenInit?.day?.length && cachedTopTenInit?.week?.length && cachedTopTenInit?.month?.length)
    );
    const [error, setError] = useState<string | null>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [lastVisiblePage, setLastVisiblePage] = useState(1);

    // Episode State
    const [episodes, setEpisodes] = useState<Episode[]>([]);
    const [scraperSession, setScraperSession] = useState<string | null>(null);
    const [epLoading, setEpLoading] = useState(false);
    const [episodesResolved, setEpisodesResolved] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');

    // View All State
    const [viewMode, setViewMode] = useState<'default' | 'trending' | 'seasonal' | 'continue_watching' | 'popular'>('default');
    const [viewAllAnime, setViewAllAnime] = useState<Anime[]>([]);
    const [viewAllLoading, setViewAllLoading] = useState(false);
    const [viewAllPagination, setViewAllPagination] = useState({
        last_visible_page: 1,
        current_page: 1,
        has_next_page: false
    });

    const normalizeScraperId = (value: unknown): string => {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        return raw.startsWith('s:') ? raw.slice(2) : raw;
    };
    const isAnimePaheSession = (value: unknown) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizeScraperId(value));
    const getAnimeCacheKey = (target: Anime): string | null => {
        const mal = Number(target?.mal_id);
        if (Number.isFinite(mal) && mal > 0) return `mal:${mal}`;
        const aid = Number(target?.id);
        if (Number.isFinite(aid) && aid > 0) return `anilist:${aid}`;
        const sid = normalizeScraperId(target?.scraperId);
        if (sid && isAnimePaheSession(sid)) return `scraper:${sid}`;
        return null;
    };
    const normalizeEpisodeNumber = (value: unknown, fallbackIndex: number): string => {
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        const raw = String(value ?? '').trim();
        if (!raw) return String(fallbackIndex + 1);
        const direct = Number(raw);
        if (Number.isFinite(direct)) return String(direct);
        const match = raw.match(/(\d+(?:\.\d+)?)/);
        return match ? String(Number(match[1])) : String(fallbackIndex + 1);
    };
    const normalizeEpisodeSession = (value: unknown): string => {
        const raw = String(value ?? '').trim();
        if (!raw) return '';

        let decoded = raw;
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            // keep raw
        }
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            // already decoded
        }

        const pairMatch = decoded.match(/([^?#]+)\?ep=([^&#]+)/i);
        if (pairMatch?.[1] && pairMatch?.[2]) {
            const base = pairMatch[1].trim().replace(/\/+$/, '');
            const ep = pairMatch[2].trim();
            return `${base}?ep=${ep}`;
        }

        const stripped = decoded.split('#')[0].split('?')[0].trim();
        const noTrailingSlash = stripped.replace(/\/+$/, '');
        if (!noTrailingSlash) return raw;
        const lastSegment = noTrailingSlash.split('/').pop() || noTrailingSlash;
        return lastSegment.trim() || raw;
    };
    const normalizeEpisodesList = (input: unknown[]): Episode[] => {
        if (!Array.isArray(input)) return [];
        const seen = new Set<string>();
        const normalized: Episode[] = [];
        const parseSortableEpisodeNumber = (value: string): number => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
            const match = String(value).match(/(\d+(?:\.\d+)?)/);
            return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
        };

        input.forEach((item: any, index) => {
            const rawSession =
                item?.session ??
                item?.episodeId ??
                item?.id ??
                item?.ep_id ??
                item?.slug ??
                item?.url ??
                item?.link;
            const session = normalizeEpisodeSession(rawSession);
            if (!session || seen.has(session)) return;

            const episodeNumber = normalizeEpisodeNumber(
                item?.episodeNumber ?? item?.number ?? item?.episode ?? item?.ep,
                index
            );
            if (!episodeNumber) return;

            normalized.push({
                session,
                episodeNumber,
                title: typeof item?.title === 'string'
                    ? item.title
                    : (typeof item?.name === 'string' ? item.name : undefined),
                duration: typeof item?.duration === 'string'
                    ? item.duration
                    : (typeof item?.duration === 'number' ? String(item.duration) : undefined),
                snapshot: typeof item?.snapshot === 'string'
                    ? getDisplayImageUrl(item.snapshot)
                    : undefined,
            });
            seen.add(session);
        });

        return normalized.sort((a, b) => {
            const episodeDiff = parseSortableEpisodeNumber(a.episodeNumber) - parseSortableEpisodeNumber(b.episodeNumber);
            if (episodeDiff !== 0) return episodeDiff;
            return a.session.localeCompare(b.session);
        });
    };
    const writeHomeCache = (key: string, data: unknown) => {
        try {
            localStorage.setItem(
                `${HOME_CACHE_PREFIX}:${key}`,
                JSON.stringify({ timestamp: Date.now(), data })
            );
        } catch {
            // Ignore localStorage quota errors.
        }
    };

    // SessionStorage-backed episode cache (survives in-app navigation)
    const EPISODE_CACHE_PREFIX = 'yorumi_ep_cache';
    const readEpisodeSessionCache = (animeKey: string): { session: string; episodes: Episode[] } | null => {
        try {
            const raw = sessionStorage.getItem(`${EPISODE_CACHE_PREFIX}:${animeKey}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.session || !Array.isArray(parsed?.episodes) || parsed.episodes.length === 0) return null;
            // Expire after 30 minutes
            if (typeof parsed.timestamp === 'number' && Date.now() - parsed.timestamp > 30 * 60 * 1000) return null;
            return { session: parsed.session, episodes: parsed.episodes };
        } catch {
            return null;
        }
    };
    const writeEpisodeSessionCache = (animeKey: string, session: string, episodes: Episode[]) => {
        try {
            sessionStorage.setItem(
                `${EPISODE_CACHE_PREFIX}:${animeKey}`,
                JSON.stringify({ session, episodes, timestamp: Date.now() })
            );
        } catch {
            // Ignore sessionStorage quota errors
        }
    };

    const hydrateFastDetails = (fastData: any, fallbackAnime: Anime): Anime => {
        const hydratedAnime = (fastData?.data ? { ...fallbackAnime, ...fastData.data } : { ...fallbackAnime }) as Anime;
        const fastSession = String(fastData?.scraperSession || '').trim();
        if (fastSession) {
            hydratedAnime.scraperId = fastSession;
        }
        return hydratedAnime;
    };

    const applyHydratedEpisodes = (targetAnime: Anime, fastData: any) => {
        if (!Array.isArray(fastData?.episodes) || fastData.episodes.length === 0) return false;

        const normalizedFastEpisodes = normalizeEpisodesList(fastData.episodes);
        const expectedEpisodes = Number(targetAnime.episodes || 0);
        const nextEpisodes = (expectedEpisodes > 0 && normalizedFastEpisodes.length > expectedEpisodes)
            ? normalizedFastEpisodes.slice(0, expectedEpisodes)
            : normalizedFastEpisodes;

        if (nextEpisodes.length === 0) return false;

        setEpisodes(nextEpisodes);
        if (fastData?.scraperSession) {
            const session = String(fastData.scraperSession).trim();
            if (session) {
                setScraperSession(session);
                episodesCache.current.set(session, nextEpisodes);
                const resolvedKey = getAnimeCacheKey(targetAnime);
                if (resolvedKey) {
                    scraperSessionCache.current.set(resolvedKey, session);
                    writeEpisodeSessionCache(resolvedKey, session, nextEpisodes);
                }
            }
        }
        setEpLoading(false);
        setEpisodesResolved(true);
        return true;
    };

    // Caches
    const scraperSessionCache = useRef(new Map<string, string>());
    const episodesCache = useRef(new Map<string, Episode[]>());
    const episodePreloadInFlight = useRef(new Map<string, Promise<{ session: string | null; eps: Episode[] }>>());
    const detailsRequestIdRef = useRef(0);
    const USE_PERSISTED_MAPPING_CACHE = true;

    // --- Actions ---

    const fetchHomeData = async () => {
        const HOME_TTL = {
            spotlight: 12 * 60 * 60 * 1000,
            trending: 10 * 60 * 1000,
            popularSeason: 10 * 60 * 1000,
            popularMonth: 10 * 60 * 1000,
            topTen: 10 * 60 * 1000,
        };

        const applyFastHomeData = (fast: any): boolean => {
            let applied = false;
            if (Array.isArray(fast?.spotlightAnime) && fast.spotlightAnime.length > 0) {
                setSpotlightAnime(fast.spotlightAnime);
                setSpotlightLoading(false);
                writeHomeCache('spotlight', fast.spotlightAnime);
                preloadLogos(fast.spotlightAnime.map((a: Anime) => a.id || a.mal_id).filter(Boolean));
                applied = true;
            }
            if (Array.isArray(fast?.trendingAnime) && fast.trendingAnime.length > 0) {
                setTrendingAnime(fast.trendingAnime);
                setTrendingLoading(false);
                writeHomeCache('trending', fast.trendingAnime);
                applied = true;
            }
            if (Array.isArray(fast?.popularSeason) && fast.popularSeason.length > 0) {
                setPopularSeason(fast.popularSeason);
                setPopularSeasonLoading(false);
                writeHomeCache('popular-season', fast.popularSeason);
                applied = true;
            }
            if (Array.isArray(fast?.popularMonth) && fast.popularMonth.length > 0) {
                setPopularMonth(fast.popularMonth);
                setPopularMonthLoading(false);
                writeHomeCache('popular-month', fast.popularMonth);
                applied = true;
            }
            if (Array.isArray(fast?.topTenToday) && Array.isArray(fast?.topTenWeek) && Array.isArray(fast?.topTenMonth)) {
                setTopTenToday(fast.topTenToday);
                setTopTenWeek(fast.topTenWeek);
                setTopTenMonth(fast.topTenMonth);
                setTopTenLoading(false);
                writeHomeCache('top-ten', {
                    day: fast.topTenToday,
                    week: fast.topTenWeek,
                    month: fast.topTenMonth
                });
                applied = true;
            }
            if (Array.isArray(fast?.topAnime) && fast.topAnime.length > 0) {
                setTopAnime(fast.topAnime);
                setLastVisiblePage(fast.topAnimePagination?.last_visible_page || 1);
                setLoading(false);
                applied = true;
            }
            return applied;
        };

        // Instant hydrate from local cache first (never block initial render).
        const cachedSpotlight = readHomeCache<Anime[]>('spotlight', HOME_TTL.spotlight);
        if (cachedSpotlight?.length) {
            setSpotlightAnime(cachedSpotlight);
            setSpotlightLoading(false);
            preloadLogos(cachedSpotlight.map((a: Anime) => a.id || a.mal_id).filter(Boolean));
        }
        const cachedTrending = readHomeCache<Anime[]>('trending', HOME_TTL.trending);
        if (cachedTrending?.length) {
            setTrendingAnime(cachedTrending);
            setTrendingLoading(false);
        }
        const cachedSeason = readHomeCache<Anime[]>('popular-season', HOME_TTL.popularSeason);
        if (cachedSeason?.length) {
            setPopularSeason(cachedSeason);
            setPopularSeasonLoading(false);
        }
        const cachedMonth = readHomeCache<Anime[]>('popular-month', HOME_TTL.popularMonth);
        if (cachedMonth?.length) {
            setPopularMonth(cachedMonth);
            setPopularMonthLoading(false);
        }
        const cachedTopTen = readHomeCache<{ day: Anime[]; week: Anime[]; month: Anime[] }>('top-ten', HOME_TTL.topTen);
        if (cachedTopTen?.day?.length && cachedTopTen?.week?.length && cachedTopTen?.month?.length) {
            setTopTenToday(cachedTopTen.day);
            setTopTenWeek(cachedTopTen.week);
            setTopTenMonth(cachedTopTen.month);
            setTopTenLoading(false);
        }

        // Try fast bundle with a short budget; don't stall fallback path.
        const fastBundlePromise = animeService.getHomeFastData()
            .then((fast) => applyFastHomeData(fast))
            .catch((error) => {
                console.warn('[AnimeContext] Fast home bundle unavailable, using fallback fetches', error);
                return false;
            });
        const fastResolvedQuickly = await Promise.race<boolean>([
            fastBundlePromise,
            new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 300)),
        ]);
        if (fastResolvedQuickly) {
            return;
        }

        const fetchSpotlight = async () => {
            if (spotlightAnime.length > 0) {
                setSpotlightLoading(false);
                return;
            }

            const cached = readHomeCache<Anime[]>('spotlight', HOME_TTL.spotlight);
            if (cached && cached.length > 0) {
                setSpotlightAnime(cached);
                setSpotlightLoading(false);
                preloadLogos(cached.map((a: Anime) => a.id || a.mal_id).filter(Boolean));
            } else {
                setSpotlightLoading(true);
            }

            try {
                const { data } = await animeService.getSpotlightAnime();
                if (data && data.length > 0) {
                    setSpotlightAnime(data);
                    writeHomeCache('spotlight', data);
                    preloadLogos(data.map((a: Anime) => a.id || a.mal_id).filter(Boolean));
                }
            } catch (e) {
                console.error('Failed to fetch AniWatch spotlight', e);
            } finally {
                setSpotlightLoading(false);
            }
        };

        const fetchTrending = async () => {
            if (trendingAnime.length > 0) return;
            const cached = readHomeCache<Anime[]>('trending', HOME_TTL.trending);
            if (cached && cached.length > 0) {
                setTrendingAnime(cached);
                setTrendingLoading(false);
                preloadLogos(cached.map((a: Anime) => a.id || a.mal_id).filter(Boolean));
            } else {
                setTrendingLoading(true);
            }
            try {
                const tData = await animeService.getTrendingAnime(1, 10);
                if (tData?.data) {
                    setTrendingAnime(tData.data);
                    writeHomeCache('trending', tData.data);
                    preloadLogos(tData.data.map((a: Anime) => a.id || a.mal_id).filter(Boolean));
                }
            } catch (e) { console.error(e); }
            finally { setTrendingLoading(false); }
        };

        const fetchPopular = async () => {
            if (popularSeason.length > 0) return;
            const cached = readHomeCache<Anime[]>('popular-season', HOME_TTL.popularSeason);
            if (cached && cached.length > 0) {
                setPopularSeason(cached);
                setPopularSeasonLoading(false);
            } else {
                setPopularSeasonLoading(true);
            }
            try {
                const pData = await animeService.getPopularThisSeason(1, 10);
                if (pData?.data) {
                    setPopularSeason(pData.data);
                    writeHomeCache('popular-season', pData.data);
                }
            } catch (e) { console.error(e); }
            finally { setPopularSeasonLoading(false); }
        };

        const fetchPopularMonth = async () => {
            if (popularMonth.length > 0) return;
            const cached = readHomeCache<Anime[]>('popular-month', HOME_TTL.popularMonth);
            if (cached && cached.length > 0) {
                setPopularMonth(cached);
                setPopularMonthLoading(false);
            } else {
                setPopularMonthLoading(true);
            }
            try {
                const pData = await animeService.getPopularThisMonth(1, 10);
                if (pData?.data) {
                    setPopularMonth(pData.data);
                    writeHomeCache('popular-month', pData.data);
                }
            } catch (e) { console.error(e); }
            finally { setPopularMonthLoading(false); }
        };

        const fetchTopTen = async () => {
            if (topTenToday.length >= 10 && topTenWeek.length >= 10 && topTenMonth.length >= 10) return;
            const cached = readHomeCache<{ day: Anime[]; week: Anime[]; month: Anime[] }>('top-ten', HOME_TTL.topTen);
            if (cached && cached.day?.length && cached.week?.length && cached.month?.length) {
                setTopTenToday(cached.day);
                setTopTenWeek(cached.week);
                setTopTenMonth(cached.month);
                setTopTenLoading(false);
            } else {
                setTopTenLoading(true);
            }
            try {
                const [day, week, month] = await Promise.all([
                    animeService.getAniwatchTopTen('day'),
                    animeService.getAniwatchTopTen('week'),
                    animeService.getAniwatchTopTen('month')
                ]);
                if (day?.data) setTopTenToday(day.data);
                if (week?.data) setTopTenWeek(week.data);
                if (month?.data) setTopTenMonth(month.data);
                if (day?.data && week?.data && month?.data) {
                    writeHomeCache('top-ten', { day: day.data, week: week.data, month: month.data });
                }
            } catch (e) { console.error(e); }
            finally { setTopTenLoading(false); }
        };

        await Promise.all([
            fetchSpotlight(),
            fetchTrending(),
            fetchPopular(),
            fetchPopularMonth(),
            fetchTopTen()
        ]);
    };

    // --- Pagination Effect ---
    // Re-fetch Top Anime when page changes
    useEffect(() => {
        const fetchPageData = async () => {
            const cached = animeService.peekTopAnime(currentPage);
            if (cached?.data?.length) {
                setTopAnime(cached.data);
                setLastVisiblePage(cached.pagination?.last_visible_page || 1);
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                // Skip if we already have data (prevents redundant fetches on provider re-mounts)
                if (topAnime.length > 0 && currentPage === 1) {
                    setLoading(false);
                    return;
                }
                const data = await animeService.getTopAnime(currentPage);
                if (data?.data) {
                    setTopAnime(data.data);
                    setLastVisiblePage(data.pagination?.last_visible_page || 1);
                }
            } catch (err) {
                console.error("Failed to fetch top anime page", currentPage, err);
                setError('Failed to fetch anime.');
            } finally {
                setLoading(false);
            }
        };

        fetchPageData();
    }, [currentPage]);

    // --- Helpers ---

    const resolveAndCacheEpisodes = async (anime: Anime): Promise<{ session: string | null, eps: Episode[] }> => {
        let session: string | null = null;
        let sessionFromCache = false;
        const cacheKey = getAnimeCacheKey(anime);
        const mappingKey =
            (() => {
                const mal = Number(anime?.mal_id);
                if (Number.isFinite(mal) && mal > 0) return mal;
                const aid = Number(anime?.id);
                return Number.isFinite(aid) && aid > 0 ? aid : null;
            })();
        // Strict normalize for exact-ish comparisons.
        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Loose normalize for cross-source title variants (e.g. with/without "Season 3", "Part 1").
        const normalizeLoose = (str: string) => normalize(
            str
                .replace(/\bseason\s*\d+\b/gi, ' ')
                .replace(/\bpart\s*\d+\b/gi, ' ')
                .replace(/\b\d+(st|nd|rd|th)\s*season\b/gi, ' ')
                .replace(/\bshimet?s?u\s*kaiyuu\b/gi, ' ')
                .replace(/\bculling\s*game(s)?\b/gi, 'cullinggame')
        );

        // Helper to extract season number
        const getSeason = (title: string) => {
            const match = title.match(/season\s*(\d+)|(\d+)(st|nd|rd|th)\s*season/i);
            return match ? parseInt(match[1] || match[2]) : 1;
        };

        // Helper to score closeness
        const getScore = (candidate: any, target: Anime) => {
            let score = 0;
            const canTitle = candidate.title || '';
            const tgtTitle = target.title || '';

            // 1. Text Similarity (strict + loose variant checks)
            const canNorm = normalize(canTitle);
            const tgtNorm = normalize(tgtTitle);
            const canLoose = normalizeLoose(canTitle);
            const tgtLoose = normalizeLoose(tgtTitle);
            if (
                canNorm.includes(tgtNorm) || tgtNorm.includes(canNorm) ||
                canLoose.includes(tgtLoose) || tgtLoose.includes(canLoose)
            ) {
                score += 10;
            }

            // 2. Season Matching
            const targetSeason = getSeason(tgtTitle) || (target.season ? 1 : 1); // Default to 1 if not specified
            const candidateSeason = getSeason(canTitle);

            // Explicit Season Mismatch is a huge penalty
            if (candidateSeason === targetSeason) {
                score += 50; // Strong match for correct season
            } else {
                // Mismatch case
                if (targetSeason > 1 && candidateSeason === 1 && !canTitle.toLowerCase().includes('season')) {
                    // Target is Season 2+, candidate looks like implicit Season 1
                    // Check for subtitle/year rescue
                    let isYearMatch = false;
                    if (candidate.year && target.year) {
                        const yearDiff = Math.abs(parseInt(candidate.year) - target.year);
                        if (yearDiff <= 1) isYearMatch = true;
                    }

                    if (isYearMatch) {
                        score += 30; // Rescue! It's likely the correct season with a subtitle
                    } else {
                        score -= 50; // Penalty
                    }
                } else if (candidateSeason !== targetSeason) {
                    // Explicit mismatch (e.g. Season 2 vs Season 3)
                    score -= 50;
                }
            }

            // 3. Year Matching
            if (candidate.year && target.year) {
                const yearDiff = Math.abs(parseInt(candidate.year) - target.year);
                if (yearDiff <= 1) score += 5;
                else if (yearDiff > 2) score -= 10; // Large gap implies different series/remake
            }

            // 4. Type Matching
            if (candidate.type && target.type) {
                if (candidate.type.toLowerCase() === target.type.toLowerCase()) score += 3;
            }

            // 5. Episode-count proximity (helps avoid cross-title false mappings)
            const targetEpisodes = Number(target.episodes || 0);
            const candidateEpisodes = Number(candidate.episodes || 0);
            if (targetEpisodes > 0 && candidateEpisodes > 0) {
                const diff = Math.abs(candidateEpisodes - targetEpisodes);
                if (diff === 0) score += 30;
                else if (diff <= 1) score += 20;
                else if (diff <= 3) score += 8;
                else score -= 25;
            }

            return score;
        };

        const isStrictCandidate = (candidate: any, target: Anime) => {
            const canTitle = String(candidate?.title || '').trim();
            const tgtTitle = String(target?.title_english || target?.title_romaji || target?.title || '').trim();
            if (!canTitle || !tgtTitle) return false;

            const canNorm = normalize(canTitle);
            const tgtNorm = normalize(tgtTitle);
            const canLoose = normalizeLoose(canTitle);
            const tgtLoose = normalizeLoose(tgtTitle);
            const titleMatch =
                canNorm.includes(tgtNorm) ||
                tgtNorm.includes(canNorm) ||
                canLoose.includes(tgtLoose) ||
                tgtLoose.includes(canLoose);
            if (!titleMatch) return false;

            const targetSeason = getSeason(tgtTitle);
            const candidateSeason = getSeason(canTitle);
            const seasonMatch =
                targetSeason <= 1 ||
                candidateSeason <= 1 ||
                candidateSeason === targetSeason;
            if (!seasonMatch) return false;

            const targetEpisodes = Number(target?.episodes || 0);
            const candidateEpisodes = Number(candidate?.episodes || candidate?.sub || 0);
            if (targetEpisodes > 0 && candidateEpisodes > 0 && Math.abs(candidateEpisodes - targetEpisodes) > 3) {
                return false;
            }

            return true;
        };

        const buildScraperQueries = (target: Anime): string[] => {
            const queries = new Set<string>();
            const add = (value: unknown) => {
                const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
                if (raw) queries.add(raw);
            };
            const addSeasonAliases = (value: unknown) => {
                const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
                if (!raw) return;
                add(raw);

                const seasonMatch = raw.match(/\bseason\s*(\d+)\b/i) || raw.match(/\b(\d+)(st|nd|rd|th)\s*season\b/i);
                if (seasonMatch?.[1]) {
                    const seasonNumber = Number(seasonMatch[1]);
                    const ordinal =
                        seasonNumber % 100 >= 11 && seasonNumber % 100 <= 13
                            ? `${seasonNumber}th`
                            : `${seasonNumber}${(['th', 'st', 'nd', 'rd'][seasonNumber % 10] || 'th')}`;
                    add(raw.replace(/\bseason\s*\d+\b/ig, `${ordinal} Season`));
                    add(raw.replace(/\b\d+(st|nd|rd|th)\s*season\b/ig, `Season ${seasonNumber}`));
                }

                add(raw.replace(/:\s*[^:]+$/, '').trim());
                add(raw.replace(/\bpart\s*\d+\b/ig, '').replace(/\s+/g, ' ').trim());
            };

            addSeasonAliases(target.title);
            addSeasonAliases(target.title_english);
            addSeasonAliases(target.title_romaji);
            addSeasonAliases(target.title_japanese);
            (target.synonyms || []).slice(0, 6).forEach(addSeasonAliases);

            return Array.from(queries).slice(0, 8);
        };

        const resolveSessionBySearch = async (): Promise<string | null> => {
            const queryList = buildScraperQueries(anime);

            try {
                const results = await Promise.all(
                    queryList.map(q => animeService.searchScraper(q).then(res => res || []).catch(() => []))
                );

                const allCandidates = Array.from(new Map(
                    results.flat().map((c: any) => [c.session, c])
                ).values());

                if (allCandidates.length === 0) return null;

                const strictCandidates = allCandidates.filter((candidate) => isStrictCandidate(candidate, anime));
                const hasStrictMatches = strictCandidates.length > 0;
                const candidatePool = hasStrictMatches ? strictCandidates : allCandidates;

                const targetEpisodes = Number(anime.episodes || 0);
                const ranked = candidatePool
                    .map((candidate) => ({
                        candidate,
                        score: getScore(candidate, anime),
                        diff: (targetEpisodes > 0 && Number(candidate?.episodes || 0) > 0)
                            ? Math.abs(Number(candidate.episodes) - targetEpisodes)
                            : Number.MAX_SAFE_INTEGER,
                    }))
                    .sort((a, b) => {
                        if (b.score !== a.score) return b.score - a.score;
                        return a.diff - b.diff;
                    });

                // Strict pool should not be rejected by legacy score penalties.
                const best = hasStrictMatches
                    ? ranked[0]
                    : (
                        ranked.find((entry) => {
                            if (entry.score <= 0) return false;
                            if (targetEpisodes <= 0) return true;
                            const cEps = Number(entry.candidate?.episodes || 0);
                            if (cEps <= 0) return true;
                            return cEps <= targetEpisodes + 1;
                        }) || ranked.find((entry) => entry.score > 0)
                    );

                if (best?.candidate) {
                    if (cacheKey) scraperSessionCache.current.set(cacheKey, best.candidate.session);
                    if (USE_PERSISTED_MAPPING_CACHE && mappingKey !== null) {
                        animeService.saveAnimeMapping(mappingKey, best.candidate.session).catch(console.error);
                    }
                    return best.candidate.session;
                }
            } catch (e) {
                console.error("Error resolving scraper session", e);
            }
            return null;
        };

        // Fast path: when scraperId is already known, avoid extra mapping/search calls.
        if (anime.scraperId && isAnimePaheSession(anime.scraperId)) {
            session = normalizeScraperId(anime.scraperId);
            if (cacheKey) {
                scraperSessionCache.current.set(cacheKey, session);
            }
            sessionFromCache = true;
        }

        if (!session && cacheKey && scraperSessionCache.current.has(cacheKey)) {
            const cachedSession = scraperSessionCache.current.get(cacheKey)!;
            session = cachedSession;
            sessionFromCache = true;
        } else if (!session) {
            // 0. Try to get from Firebase Mapping Cache
            if (USE_PERSISTED_MAPPING_CACHE && mappingKey !== null) {
                try {
                    const cachedSession = await animeService.getAnimeMapping(mappingKey);
                    if (cachedSession) {
                        session = cachedSession;
                        sessionFromCache = true;
                        if (cacheKey) scraperSessionCache.current.set(cacheKey, cachedSession);
                    }
                } catch (e) {
                    console.warn("[AnimeContext] Failed to check mapping cache", e);
                }
            }

        }

        if (!session) {
            session = await resolveSessionBySearch();
        }

        if (session) {
            if (episodesCache.current.has(session)) {
                return { session, eps: episodesCache.current.get(session)! };
            } else {
                try {
                    const epData = await animeService.getEpisodes(session);
                    const rawEpisodes = epData?.episodes || epData?.ep_details || (Array.isArray(epData) ? epData : []);
                    const normalizedEpisodes = normalizeEpisodesList(rawEpisodes);
                    const expectedEpisodes = Number(anime.episodes || 0);
                    const newEpisodes = (expectedEpisodes > 0 && normalizedEpisodes.length > expectedEpisodes)
                        ? normalizedEpisodes.slice(0, expectedEpisodes)
                        : normalizedEpisodes;

                    // Cached/older mappings can occasionally resolve to a valid session with no episode payload.
                    // Re-resolve once via search before giving up, so users don't need a manual page reload.
                    if (newEpisodes.length === 0 && sessionFromCache) {
                        if (anime.scraperId && String(anime.scraperId).trim() === session) {
                            delete (anime as Partial<Anime>).scraperId;
                        }
                        if (cacheKey) scraperSessionCache.current.delete(cacheKey);
                        if (USE_PERSISTED_MAPPING_CACHE && mappingKey !== null) {
                            animeService.clearAnimeMapping(mappingKey).catch(() => undefined);
                        }
                        const remappedSession = await resolveSessionBySearch();
                        if (remappedSession && remappedSession !== session) {
                            const remappedData = await animeService.getEpisodes(remappedSession);
                            const remappedRawEpisodes = remappedData?.episodes || remappedData?.ep_details || (Array.isArray(remappedData) ? remappedData : []);
                            const remappedNormalizedEpisodes = normalizeEpisodesList(remappedRawEpisodes);
                            const remappedEpisodes = (expectedEpisodes > 0 && remappedNormalizedEpisodes.length > expectedEpisodes)
                                ? remappedNormalizedEpisodes.slice(0, expectedEpisodes)
                                : remappedNormalizedEpisodes;
                            if (remappedEpisodes.length > 0) {
                                episodesCache.current.set(remappedSession, remappedEpisodes);
                                return { session: remappedSession, eps: remappedEpisodes };
                            }
                        }
                        return { session: null, eps: [] };
                    }

                    // Enrich with metadata titles if available
                    if (newEpisodes.length > 0) {
                        // 1. Try AniList Metadata first (Fast, already in memory)
                        if (anime.episodeMetadata?.length) {
                            const metaList = anime.episodeMetadata;
                            newEpisodes.forEach((ep: Episode) => {
                                if (!ep.title || ep.title === 'Untitled' || !ep.title.trim()) {
                                    const epNum = parseFloat(ep.episodeNumber);
                                    if (!isNaN(epNum)) {
                                        // Strategy A: Regex match "Episode X"
                                        let meta = metaList.find(m => {
                                            const match = m.title?.match(/Episode\s+(\d+)/i);
                                            return match && parseFloat(match[1]) === epNum;
                                        });

                                        // Strategy B: Array Index Fallback (assuming metadata is compliant and ordered)
                                        // AniList streamingEpisodes are usually ordered 1..N
                                        if (!meta && metaList[epNum - 1]) {
                                            meta = metaList[epNum - 1];
                                        }

                                        if (meta && meta.title) {
                                            // Clean up "Episode X - Title" format
                                            const cleanMatch = meta.title.match(/Episode\s+\d+\s*[-:]?\s*(.*)/i);
                                            if (cleanMatch && cleanMatch[1] && cleanMatch[1].trim()) {
                                                ep.title = cleanMatch[1].trim();
                                            } else {
                                                // Use full title if no prefix found or prefix is everything
                                                ep.title = meta.title;
                                            }
                                        }
                                    }
                                }
                            });
                        }


                    }

                    if (newEpisodes.length > 0) {
                        episodesCache.current.set(session, newEpisodes);
                        // Persist to sessionStorage for instant back-navigation
                        if (cacheKey) writeEpisodeSessionCache(cacheKey, session, newEpisodes);
                        return { session, eps: newEpisodes };
                    }
                } catch (e) {
                    if (cacheKey) scraperSessionCache.current.delete(cacheKey);
                }
            }
        }
        return { session, eps: [] };
    };

    const preloadEpisodes = async (
        anime: Anime,
        options?: { resetState?: boolean; requestId?: number; isStale?: () => boolean }
    ) => {
        const isStale = options?.isStale || (() => false);
        const cacheKey = getAnimeCacheKey(anime);
        if (cacheKey && scraperSessionCache.current.has(cacheKey)) {
            const session = scraperSessionCache.current.get(cacheKey)!;
            if (episodesCache.current.has(session)) {
                if (isStale()) return;
                setEpisodes(episodesCache.current.get(session)!);
                setScraperSession(session);
                setEpLoading(false);
                setEpisodesResolved(true);
                return;
            }
        }

        // Fallback: check sessionStorage for episodes cached during this browser session
        if (cacheKey) {
            const sessionCached = readEpisodeSessionCache(cacheKey);
            if (sessionCached) {
                if (isStale()) return;
                scraperSessionCache.current.set(cacheKey, sessionCached.session);
                episodesCache.current.set(sessionCached.session, sessionCached.episodes);
                setEpisodes(sessionCached.episodes);
                setScraperSession(sessionCached.session);
                setEpLoading(false);
                setEpisodesResolved(true);
                return;
            }
        }

        const inFlightKey = cacheKey || `temp:${String(anime.scraperId || anime.id || anime.mal_id || anime.title || '')}`;
        if (episodePreloadInFlight.current.has(inFlightKey)) {
            const { session, eps } = await episodePreloadInFlight.current.get(inFlightKey)!;
            if (isStale()) return;
            if (session) setScraperSession(session);
            if (eps.length > 0) setEpisodes(eps);
            setEpLoading(false);
            setEpisodesResolved(true);
            return;
        }

        if (isStale()) return;
        setEpLoading(true);
        setEpisodesResolved(false);
        if (options?.resetState !== false) {
            setEpisodes([]);
            setScraperSession(null);
        }

        try {
            const task = resolveAndCacheEpisodes(anime)
                .finally(() => {
                    episodePreloadInFlight.current.delete(inFlightKey);
                });
            episodePreloadInFlight.current.set(inFlightKey, task);
            const { session, eps } = await task;
            if (isStale()) return;
            if (session) setScraperSession(session);
            if (eps.length > 0) setEpisodes(eps);
        } catch (e) {
            console.error('Failed to preload episodes', e);
        } finally {
            if (isStale()) return;
            setEpLoading(false);
            setEpisodesResolved(true);
        }
    };



    // --- Episode Tracking ---
    const getCanonicalAnimeHistoryId = (anime: Anime | null) => {
        if (!anime) return '';
        const malId = String(anime.mal_id || '').trim();
        const anilistId = String(anime.id || '').trim();
        return malId || anilistId;
    };

    const normalizeEpisodeHistoryForAnime = (anime: Anime | null) => {
        if (!anime) return;

        const canonicalId = getCanonicalAnimeHistoryId(anime);
        const malId = String(anime.mal_id || '').trim();
        const anilistId = String(anime.id || '').trim();
        const aliasIds = Array.from(new Set([malId, anilistId].filter(Boolean)));

        if (!canonicalId || aliasIds.length <= 1) return;

        const history = storage.getEpisodeHistory();
        const mergedEpisodes = Array.from(new Set(
            aliasIds.flatMap((id) => (history[id] || []).map((episode) => Number(episode)).filter((episode) => Number.isFinite(episode) && episode > 0))
        )).sort((a, b) => a - b);

        const hadAliasData = aliasIds.some((id) => id !== canonicalId && Array.isArray(history[id]) && history[id].length > 0);
        if (!hadAliasData) return;

        const nextHistory = { ...history, [canonicalId]: mergedEpisodes };
        aliasIds.forEach((id) => {
            if (id !== canonicalId) {
                delete nextHistory[id];
            }
        });

        storage.setEpisodeHistory(nextHistory);
    };

    const refreshWatchedEpisodes = () => {
        if (!selectedAnime) {
            setWatchedEpisodes(new Set());
            return;
        }

        const canonicalId = getCanonicalAnimeHistoryId(selectedAnime);
        const history = canonicalId ? storage.getWatchedEpisodes(canonicalId) : [];
        setWatchedEpisodes(new Set(history));
    };

    useEffect(() => {
        normalizeEpisodeHistoryForAnime(selectedAnime);
        refreshWatchedEpisodes();
    }, [selectedAnime, user?.uid]);

    useEffect(() => {
        const handleStorageUpdated = () => refreshWatchedEpisodes();
        window.addEventListener('yorumi-storage-updated', handleStorageUpdated);
        return () => window.removeEventListener('yorumi-storage-updated', handleStorageUpdated);
    }, [selectedAnime, user?.uid]);

    const markEpisodeComplete = (episodeNumber: number) => {
        if (!selectedAnime) return;
        const canonicalId = getCanonicalAnimeHistoryId(selectedAnime);
        if (canonicalId) {
            storage.markEpisodeAsWatched(canonicalId, episodeNumber);
        }

        setWatchedEpisodes(prev => new Set(prev).add(episodeNumber));
    };

    // --- Actions ---

    const handleAnimeClick = async (anime: Anime) => {
        const requestId = ++detailsRequestIdRef.current;
        const isStaleRequest = () => requestId !== detailsRequestIdRef.current;
        let currentAnime = anime;

        let detailsId: string | number | undefined = anime.id || anime.mal_id;
        if (anime.scraperId && isAnimePaheSession(anime.scraperId) && (!detailsId || detailsId === 0)) {
            const normalizedScraperId = normalizeScraperId(anime.scraperId);
            if (normalizedScraperId) {
                detailsId = `s:${normalizedScraperId}`;
            }
        }

        const cachedDetails = detailsId ? animeService.peekAnimeDetailsCache(detailsId) : null;
        const cachedFast = detailsId ? animeService.peekAnimeDetailsFastCache(detailsId) : null;
        const hydratedAnime = hydrateFastDetails(cachedFast, (cachedDetails?.data || anime) as Anime);

        if (hydratedAnime.images || cachedDetails?.data || cachedFast?.data) {
            setSelectedAnime(hydratedAnime);
        } else {
            setSelectedAnime(null);
        }

        if (!applyHydratedEpisodes(hydratedAnime, cachedFast)) {
            setEpisodes([]);
            setScraperSession(null);
            setEpLoading(true);
            setEpisodesResolved(false);
        }

        setWatchedEpisodes(new Set());
        setError(null);
        setDetailsLoading(!(cachedDetails?.data || cachedFast?.data || anime.images));

        if (anime.scraperId && isAnimePaheSession(anime.scraperId)) {
            preloadEpisodes(anime, { resetState: false, requestId, isStale: isStaleRequest }).catch(() => undefined);
        }

        try {
            detailsId = anime.id || anime.mal_id;
            if (anime.scraperId && isAnimePaheSession(anime.scraperId) && (!detailsId || detailsId === 0)) {
                const normalizedScraperId = normalizeScraperId(anime.scraperId);
                if (!normalizedScraperId) throw new Error('Could not identify scraper ID');
                detailsId = `s:${normalizedScraperId}`;
            }
            if (!detailsId) throw new Error('Could not identify anime ID');

            const fastPromise = animeService.getAnimeDetailsFast(detailsId).catch(() => null);
            const cachedFastResult = cachedFast
                ? Promise.resolve(cachedFast)
                : Promise.race<any>([
                    fastPromise,
                    new Promise((resolve) => window.setTimeout(() => resolve(null), 80)),
                ]);

            const initialFastResult = await cachedFastResult;
            let episodesApplied = false;
            if (initialFastResult && !isStaleRequest()) {
                currentAnime = hydrateFastDetails(initialFastResult, currentAnime);
                setSelectedAnime(currentAnime);
                episodesApplied = applyHydratedEpisodes(currentAnime, initialFastResult);
            }

            const detailsData = await animeService.getAnimeDetails(detailsId);
            if (isStaleRequest()) return;

            if (detailsData?.data) {
                currentAnime = detailsData.data;
                if (detailsId && String(detailsId).startsWith('s:')) {
                    if ((detailsData.data as any).scraperId) currentAnime.scraperId = (detailsData.data as any).scraperId;
                }
                setSelectedAnime(currentAnime);
            } else {
                let found = false;
                if (anime.title) {
                    try {
                        const search = await animeService.searchAnime(anime.title, 1);
                        if (search?.data && search.data.length > 0) {
                            currentAnime = search.data[0];
                            setSelectedAnime(currentAnime);
                            found = true;
                        }
                    } catch (e) {
                        console.error('Fallback search failed', e);
                    }
                }
                if (!found && !anime.images) {
                    throw new Error('Anime not found');
                }
            }

            if (isStaleRequest()) return;
            setDetailsLoading(false);

            if (!episodesApplied && !isStaleRequest()) {
                preloadEpisodes(currentAnime, { resetState: false, requestId, isStale: isStaleRequest }).catch(() => undefined);
            }

            fastPromise.then((fast) => {
                if (!fast || isStaleRequest()) return;
                currentAnime = hydrateFastDetails(fast, currentAnime);
                setSelectedAnime(currentAnime);
                applyHydratedEpisodes(currentAnime, fast);
            }).catch(() => undefined);
        } catch (err) {
            if (isStaleRequest()) return;
            console.error('Failed to fetch details', err);
            setError('Failed to load anime details');
            setDetailsLoading(false);
            if (!anime.images) {
                setEpLoading(false);
                setEpisodesResolved(true);
            } else {
                preloadEpisodes(currentAnime, { resetState: false, requestId, isStale: isStaleRequest }).catch(() => undefined);
            }
        }
    };

    const startWatching = () => {
        setShowAnimeDetails(false);
        setShowWatchModal(true);
        if (episodes.length === 0 && !epLoading && !scraperSession && selectedAnime) {
            preloadEpisodes(selectedAnime);
        }
    };

    const watchAnime = (anime: Anime) => {
        setSelectedAnime(anime);
        setShowAnimeDetails(false);
        setShowWatchModal(true);
        preloadEpisodes(anime);
    };

    const closeDetails = () => {
        setShowAnimeDetails(false);
        // Clean up or navigate back if needed?
        // With Router, the user uses browser back. 
        // This might act as a "clear selection"
        setSelectedAnime(null);
    };

    const closeWatch = () => {
        setShowWatchModal(false);
        // Return to details? 
        setShowAnimeDetails(true);
    };

    const closeAllModals = () => {
        setShowWatchModal(false);
        setShowAnimeDetails(false);
        setSelectedAnime(null);
        setEpisodes([]);
    };

    const changePage = (page: number) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const prefetchEpisodes = (anime: Anime) => {
        if (anime.scraperId && isAnimePaheSession(anime.scraperId)) {
            resolveAndCacheEpisodes(anime).catch(console.error);
            return;
        }

        const detailsId = anime.id || anime.mal_id;
        if (detailsId) {
            animeService.getAnimeDetailsFast(detailsId).catch(() => undefined);
        }
    };

    const prefetchPage = (page: number) => {
        if (page <= lastVisiblePage) {
            animeService.getTopAnime(page);
        }
    };

    // View All Logic
    const fetchViewAll = async (type: 'trending' | 'seasonal' | 'continue_watching' | 'popular', page: number) => {
        if (type === 'continue_watching') return;

        setViewAllLoading(true);
        try {
            let data;
            if (type === 'trending') data = await animeService.getTrendingAnime(page, 18);
            else if (type === 'seasonal') data = await animeService.getPopularThisSeason(page, 18);
            else if (type === 'popular') data = await animeService.getTopAnime(page); // Re-use getTopAnime for "View All" pagination

            if (data?.data) {
                setViewAllAnime(data.data);
                if (data.pagination) setViewAllPagination(data.pagination);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setViewAllLoading(false);
        }
    };

    const openViewAll = (type: any) => {
        setViewMode(type);
        // If continue_watching, data is already local, no fetch needed
        if (type !== 'continue_watching') {
            fetchViewAll(type, 1);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const closeViewAll = () => {
        setViewMode('default');
        setViewAllAnime([]);
    };

    const changeViewAllPage = (page: number) => {
        fetchViewAll(viewMode as any, page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <AnimeContext.Provider value={{
            topAnime, spotlightAnime, trendingAnime, popularSeason, popularMonth, topTenToday, topTenWeek, topTenMonth, selectedAnime,
            showAnimeDetails, showWatchModal, episodes, scraperSession, epLoading, episodesResolved,
            detailsLoading, loading, spotlightLoading, trendingLoading, popularSeasonLoading, popularMonthLoading, topTenLoading, currentPage, lastVisiblePage,
            error, episodeSearchQuery, viewAllAnime, viewAllLoading, viewAllPagination,
            viewMode, setEpisodeSearchQuery, handleAnimeClick, startWatching,
            watchAnime, closeDetails, closeWatch, closeAllModals, changePage,
            openViewAll, closeViewAll, changeViewAllPage, prefetchEpisodes, prefetchPage,
            continueWatchingList, saveProgress, removeFromHistory, fetchHomeData,
            watchedEpisodes, markEpisodeComplete
        }}>
            {children}
        </AnimeContext.Provider>
    );
}

export const useAnime = () => {
    const context = useContext(AnimeContext);
    if (context === undefined) {
        throw new Error('useAnime must be used within an AnimeProvider');
    }
    return context;
};

