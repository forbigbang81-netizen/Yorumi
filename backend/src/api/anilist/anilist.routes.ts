import { Router } from 'express';
import { anilistService } from './anilist.service';
import { HiAnimeScraper } from '../scraper/hianime.service';
import { AnimePaheScraper } from '../../scraper/animepahe';
import { redis } from '../mapping/mapper';
import { mappingService } from '../mapping/mapping.service';
import { scraperService } from '../scraper/scraper.service';

const router = Router();
const HOME_FAST_CACHE_KEY = 'anilist:home:fast:v1';
const HOME_FAST_TTL_SECONDS = 120;
let homeFastMemoryCache: { data: any; timestamp: number } | null = null;
let homeFastRefreshPromise: Promise<any> | null = null;
const isAnimePaheSession = (value: unknown) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const normalizeTitleToken = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const getSeasonNumber = (title: string) => {
    const match = String(title || '').match(/\bseason\s*(\d+)\b/i) || String(title || '').match(/\b(\d+)(st|nd|rd|th)\s*season\b/i);
    return match ? parseInt(match[1], 10) : 1;
};
const buildScraperQueries = (details: any): string[] => {
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

    addSeasonAliases(details?.title?.english);
    addSeasonAliases(details?.title?.romaji);
    addSeasonAliases(details?.title?.native);
    (Array.isArray(details?.synonyms) ? details.synonyms : []).slice(0, 6).forEach(addSeasonAliases);

    return Array.from(queries).slice(0, 8);
};
const rankCandidate = (title: string, candidate: any) => {
    const source = normalizeTitleToken(title);
    const target = normalizeTitleToken(String(candidate?.title || ''));
    if (!source || !target) return 0;
    let score = 0;
    if (source === target) score += 100;
    else if (source.includes(target) || target.includes(source)) score += 70;

    const sourceSeason = getSeasonNumber(title);
    const candidateSeason = getSeasonNumber(String(candidate?.title || ''));
    if (sourceSeason === candidateSeason) score += 30;
    else if (sourceSeason > 1 && candidateSeason > 1) score -= 40;

    return score;
};
const rankAgainstAnime = (details: any, candidate: any) => {
    const titles = buildScraperQueries(details);
    const titleScore = titles.reduce((best, title) => Math.max(best, rankCandidate(title, candidate)), 0);
    let score = titleScore;

    const expectedEpisodes = Number(details?.episodes || 0);
    const candidateEpisodes = Number(candidate?.episodes || 0);
    if (expectedEpisodes > 0 && candidateEpisodes > 0) {
        const diff = Math.abs(candidateEpisodes - expectedEpisodes);
        if (diff === 0) score += 40;
        else if (diff <= 1) score += 25;
        else if (diff <= 3) score += 10;
        else score -= 35;
    }

    const animeYear = Number(details?.seasonYear || 0);
    const candidateYear = Number(candidate?.year || 0);
    if (animeYear > 0 && candidateYear > 0) {
        const diff = Math.abs(candidateYear - animeYear);
        if (diff === 0) score += 10;
        else if (diff > 1) score -= 10;
    }

    return score;
};
const findRankedScraperCandidates = async (details: any) => {
    const titles = buildScraperQueries(details);
    const resultSets = await Promise.all(
        titles.map((title) => scraperService.search(title).catch(() => []))
    );
    const candidateMap = new Map<string, any>();

    resultSets.forEach((found) => {
        if (!Array.isArray(found)) return;
        found.forEach((candidate) => {
            if (candidate?.session && !candidateMap.has(String(candidate.session))) {
                candidateMap.set(String(candidate.session), candidate);
            }
        });
    });

    return [...candidateMap.values()]
        .map((candidate) => ({
            candidate,
            score: rankAgainstAnime(details, candidate),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
};

const getFreshHomeFastFromMemory = () => {
    if (!homeFastMemoryCache) return null;
    if (Date.now() - homeFastMemoryCache.timestamp > HOME_FAST_TTL_SECONDS * 1000) return null;
    return homeFastMemoryCache.data;
};

const buildHomeFastPayload = async () => {
    const scraper = new HiAnimeScraper();
    const [spotlight, trending, seasonal, monthly, topAnime, topDay, topWeek, topMonth] = await Promise.all([
        scraper.getEnrichedSpotlight(),
        anilistService.getTrendingAnime(1, 10),
        anilistService.getPopularThisSeason(1, 10),
        anilistService.getPopularThisMonth(1, 10),
        anilistService.getTopAnime(1, 18),
        scraper.getEnrichedTopTen('day'),
        scraper.getEnrichedTopTen('week'),
        scraper.getEnrichedTopTen('month'),
    ]);

    return {
        spotlight: spotlight?.spotlight || [],
        trending,
        seasonal,
        monthly,
        topAnime,
        topTen: {
            day: topDay?.top10 || [],
            week: topWeek?.top10 || [],
            month: topMonth?.top10 || [],
        },
        generatedAt: Date.now(),
    };
};

const refreshHomeFastCache = async () => {
    if (homeFastRefreshPromise) return homeFastRefreshPromise;
    homeFastRefreshPromise = (async () => {
        try {
            const payload = await buildHomeFastPayload();
            homeFastMemoryCache = { data: payload, timestamp: Date.now() };
            await redis.set(HOME_FAST_CACHE_KEY, payload, { ex: HOME_FAST_TTL_SECONDS });
            return payload;
        } finally {
            homeFastRefreshPromise = null;
        }
    })();
    return homeFastRefreshPromise;
};

router.get('/home-fast', async (_req, res) => {
    try {
        const memoryHit = getFreshHomeFastFromMemory();
        if (memoryHit) {
            res.json(memoryHit);
            return;
        }

        const redisHit = await redis.get<any>(HOME_FAST_CACHE_KEY).catch(() => null);
        if (redisHit) {
            homeFastMemoryCache = { data: redisHit, timestamp: Date.now() };
            res.json(redisHit);
            refreshHomeFastCache().catch(() => undefined);
            return;
        }

        const fresh = await refreshHomeFastCache();
        res.json(fresh);
    } catch (error) {
        console.error('Error in home-fast route:', error);
        res.status(500).json({ error: 'Failed to fetch home bundle' });
    }
});

// Get top/popular anime
router.get('/top', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;
        const format = req.query.format as string | undefined;

        const data = await anilistService.getTopAnime(page, perPage, format);
        res.json(data);
    } catch (error: any) {
        console.error('Error in top anime route:', error.message);
        if (error.response) {
            res.status(error.response.status).json({ error: error.response.data });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Alias for /top for "Most Popular" page
router.get('/popular', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;
        const data = await anilistService.getTopAnime(page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch popular anime' });
    }
});

// Get anime by format (MOVIE, TV, OVA, ONA, SPECIAL)
router.get('/format/:format', async (req, res) => {
    try {
        const { format } = req.params;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getTopAnime(page, perPage, format.toUpperCase());
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch anime by format' });
    }
});

// Get spotlight anime (top 10)
router.get('/spotlight', async (_req, res) => {
    try {
        const spotlight = await anilistService.getSpotlightAnime(10);
        res.json({ spotlight });
    } catch (error) {
        console.error('Error in spotlight anime route:', error);
        res.status(500).json({ error: 'Failed to fetch spotlight anime' });
    }
});

// Get top/popular manga (by SCORE)
router.get('/top/manga', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getTopManga(page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in top manga route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all-time popular manga (by POPULARITY)
router.get('/popular/manga', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getPopularManga(page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in popular manga route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get popular manhwa
router.get('/top/manhwa', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getPopularManhwa(page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in top manhwa route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get one-shot manga
router.get('/top/one-shot', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getOneShotManga(page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in top one-shot route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Get trending anime
router.get('/trending', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 50;

        const data = await anilistService.getTrendingAnime(page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trending anime' });
    }
});

// Get trending manga
router.get('/trending/manga', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 10;

        const data = await anilistService.getTrendingManga(page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trending manga' });
    }
});

// Get popular this season
router.get('/popular-this-season', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 50;

        const data = await anilistService.getPopularThisSeason(page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch popular this season' });
    }
});

// Get popular this month
router.get('/popular-this-month', async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 50;

        const data = await anilistService.getPopularThisMonth(page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch popular this month' });
    }
});

// A-Z List for Manga
router.get('/manga/az-list/:letter', async (req, res) => {
    try {
        const { letter } = req.params;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 18;

        const data = await anilistService.getMangaAZList(letter, page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Manga A-Z list' });
    }
});

// A-Z List for Anime
router.get('/anime/az-list/:letter', async (req, res) => {
    try {
        const { letter } = req.params;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 18;

        const data = await anilistService.getAnimeAZList(letter, page, perPage);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Anime A-Z list' });
    }
});

// Search anime
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q as string;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        if (!query) {
            res.status(400).json({ error: 'Query parameter "q" is required' });
            return;
        }

        const data = await anilistService.searchAnime(query, page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in search route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search manga
router.get('/search/manga', async (req, res) => {
    try {
        const query = req.query.q as string;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        if (!query) {
            res.status(400).json({ error: 'Query parameter "q" is required' });
            return;
        }

        const data = await anilistService.searchManga(query, page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in search manga route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/anime/:id/fast', async (req, res) => {
    try {
        const { id } = req.params;
        if (id.startsWith('s:')) {
            res.set('Cache-Control', 'no-store');
        }

        // Fast path: serve composed response from Redis (skip for scraper IDs)
        const composedCacheKey = `fast-composed:v2:${id}`;
        if (!id.startsWith('s:')) {
            try {
                const composedCached = await redis.get<any>(composedCacheKey).catch(() => null);
                if (composedCached && Array.isArray(composedCached.episodes) && composedCached.episodes.length > 0) {
                    res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
                    res.json(composedCached);
                    return;
                }
            } catch { /* fall through */ }
        }

        let animeDetails: any = null;
        let resolvedSession: string | null = null;
        let rankedCandidates: Array<{ candidate: any; score: number }> = [];

        if (id.startsWith('s:')) {
            resolvedSession = id.substring(2).trim() || null;
            if (!isAnimePaheSession(resolvedSession)) {
                res.status(400).json({ error: 'Only AnimePahe scraper sessions are supported' });
                return;
            }
            const scraperDetails = resolvedSession
                ? await new AnimePaheScraper().getAnimeInfo(resolvedSession)
                : null;

            if (scraperDetails?.title) {
                const searchRes = await anilistService.searchAnime(scraperDetails.title, 1, 1);
                const anilistMatch = searchRes?.media?.[0];
                if (anilistMatch?.id) {
                    const full = await anilistService.getAnimeById(anilistMatch.id);
                    if (full) {
                        animeDetails = {
                            ...full,
                            id,
                            mal_id: full.id,
                            scraperId: resolvedSession,
                        };
                    }
                }
            }

            if (!animeDetails && scraperDetails) {
                animeDetails = {
                    id,
                    title: { romaji: scraperDetails.title, english: scraperDetails.title },
                    coverImage: { large: scraperDetails.poster },
                    description: scraperDetails.description,
                    status: scraperDetails.status,
                    episodes: scraperDetails.episodes || null,
                    format: scraperDetails.type || 'TV',
                    genres: [],
                    averageScore: 0,
                    scraperId: resolvedSession,
                };
            }
        } else {
            const numericId = parseInt(id, 10);
            if (Number.isNaN(numericId)) {
                res.status(400).json({ error: 'Invalid ID' });
                return;
            }

            animeDetails = await anilistService.getAnimeById(numericId);
            if (!animeDetails) {
                res.status(404).json({ error: 'Anime not found' });
                return;
            }

            const mapped = await mappingService.getMapping(String(numericId)).catch(() => null);
            if (mapped?.id) {
                resolvedSession = String(mapped.id).trim();
            }

            if (!resolvedSession) {
                rankedCandidates = await findRankedScraperCandidates(animeDetails);
                const best = rankedCandidates[0]?.candidate;
                if (best?.session) {
                    resolvedSession = String(best.session);
                    await mappingService.saveMapping(String(numericId), resolvedSession, String(best.title || animeDetails?.title?.english || animeDetails?.title?.romaji || '')).catch(() => undefined);
                }
            }
        }

        let episodes: any[] = [];
        if (resolvedSession) {
            const ep = await scraperService.getEpisodes(resolvedSession).catch(() => ({ episodes: [] }));
            episodes = Array.isArray(ep?.episodes) ? ep.episodes : [];
        }

        if (episodes.length === 0 && animeDetails && !id.startsWith('s:')) {
            const numericId = parseInt(id, 10);
            if (!Number.isNaN(numericId)) {
                if (rankedCandidates.length === 0) {
                    rankedCandidates = await findRankedScraperCandidates(animeDetails);
                }
                const fallbackCandidate = rankedCandidates.find(
                    ({ candidate }) => String(candidate?.session || '') !== String(resolvedSession || '')
                )?.candidate;
                if (fallbackCandidate?.session) {
                    resolvedSession = String(fallbackCandidate.session);
                    await mappingService.saveMapping(
                        String(numericId),
                        resolvedSession,
                        String(fallbackCandidate.title || animeDetails?.title?.english || animeDetails?.title?.romaji || '')
                    ).catch(() => undefined);

                    const retry = await scraperService.getEpisodes(resolvedSession).catch(() => ({ episodes: [] }));
                    episodes = Array.isArray(retry?.episodes) ? retry.episodes : [];
                }
            }
        }

        const result = {
            anime: animeDetails,
            scraperSession: resolvedSession,
            episodes,
        };

        // Cache composed response in Redis for 3 minutes
        if (!id.startsWith('s:') && episodes.length > 0) {
            redis.set(composedCacheKey, result, { ex: 180 }).catch(() => undefined);
        }

        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json(result);
    } catch (error) {
        console.error('Error in anime fast route:', error);
        res.status(500).json({ error: 'Failed to fetch fast anime details' });
    }
});

// Get anime details
router.get('/anime/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (id.startsWith('s:')) {
            res.set('Cache-Control', 'no-store');
        }

        // Hybrid Logic for Scraper IDs (e.g. s:one-piece-100)
        if (id.startsWith('s:')) {
            const scraperId = id.substring(2);
            if (!isAnimePaheSession(scraperId)) {
                return res.status(400).json({ error: 'Only AnimePahe scraper sessions are supported' });
            }
            const scraperDetails = await new AnimePaheScraper().getAnimeInfo(scraperId);
            if (!scraperDetails) {
                return res.status(404).json({ error: 'Anime not found on scraper' });
            }

            // 2. Search AniList by Title
            const title = scraperDetails.title;
            const searchRes = await anilistService.searchAnime(title);
            const anilistMatch = searchRes?.media?.[0];

            if (anilistMatch) {
                // 3. Get full AniList details
                const anilistDetails = await anilistService.getAnimeById(anilistMatch.id);
                if (anilistDetails) {
                    // 4. Return merged result (AniList metadata + Scraper ID hint)
                    return res.json({
                        ...anilistDetails,
                        id: id, // Maintain s: prefix
                        mal_id: anilistDetails.id, // Keep AniList/MAL ID ref as mal_id
                        scraperId: scraperId
                    });
                }
            }

            // Fallback: Return mapped scraper data
            return res.json({
                id: id,
                title: { romaji: scraperDetails.title, english: scraperDetails.title },
                coverImage: { large: scraperDetails.poster },
                description: scraperDetails.description,
                status: scraperDetails.status,
                episodes: scraperDetails.episodes || null,
                format: scraperDetails.type || 'TV',
                genres: [],
                averageScore: 0,
                scraperId: scraperId
            });
        }

        const numericId = parseInt(id);
        if (isNaN(numericId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const data = await anilistService.getAnimeById(numericId);
        // Or getAnimeById was calling getMediaDetails? 
        // anilistService.getAnimeById uses generic fetch.
        // Let's stick to getMediaDetails which I added.
        if (!data) {
            res.status(404).json({ error: 'Anime not found' });
            return;
        }
        res.json(data);
    } catch (error: any) {
        console.error('Error in anime by ID route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get manga by ID
router.get('/manga/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const data = await anilistService.getMangaById(id);
        if (!data) {
            res.status(404).json({ error: 'Manga not found' });
            return;
        }
        res.json(data);
    } catch (error) {
        console.error('Error in manga by ID route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Batch covers (keep for compatibility)
router.post('/batch-covers', async (req, res) => {
    try {
        const { malIds } = req.body;

        if (!malIds || !Array.isArray(malIds)) {
            res.status(400).json({ error: 'Invalid malIds provided' });
            return;
        }

        const data = await anilistService.getCoverImages(malIds);
        res.json(data);
    } catch (error) {
        console.error('Error in batch-covers route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Legacy POST search (keep for compatibility with spotlight resolution)
router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            res.status(400).json({ error: 'Query is required' });
            return;
        }

        const data = await anilistService.searchAnime(query, 1, 5);
        res.json(data.media || []);
    } catch (error) {
        console.error('Error in search route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get airing schedule for a time range
router.get('/schedule', async (req, res) => {
    try {
        // Default to current day (start of day to end of day in UTC)
        const now = Math.floor(Date.now() / 1000);
        const startOfDay = now - (now % 86400); // Start of current UTC day

        const start = req.query.start ? parseInt(req.query.start as string) : startOfDay;
        const end = req.query.end ? parseInt(req.query.end as string) : startOfDay + 86400;

        const data = await anilistService.getAiringSchedule(start, end);
        res.json(data);
    } catch (error) {
        console.error('Error in schedule route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get list of genres
router.get('/genres', (req, res) => {
    try {
        const genres = anilistService.getGenres();
        res.json(genres);
    } catch (error) {
        console.error('Error in genres route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get anime by genre
router.get('/genre/:name', async (req, res) => {
    try {
        const genre = req.params.name;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getAnimeByGenre(genre, page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in genre route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get manga by genre
router.get('/manga/genre/:name', async (req, res) => {
    try {
        const genre = req.params.name;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const perPage = req.query.limit ? parseInt(req.query.limit as string) : 24;

        const data = await anilistService.getMangaByGenre(genre, page, perPage);
        res.json(data);
    } catch (error) {
        console.error('Error in manga genre route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get random anime
router.get('/random', async (req, res) => {
    try {
        const data = await anilistService.getRandomAnime();
        res.json(data);
    } catch (error) {
        console.error('Error in random anime route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get random manga
router.get('/random-manga', async (req, res) => {
    try {
        const data = await anilistService.getRandomManga();
        res.json(data);
    } catch (error) {
        console.error('Error in random manga route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;


