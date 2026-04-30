import { Router } from 'express';
import { scraperService } from './scraper.service';
import axios from 'axios';
import { AnimeKaiScraper } from '../../scraper/animekai';
import { anilistService } from '../anilist/anilist.service';
import { redis } from '../mapping/mapper';

const router = Router();
const upstreamCookieJar = new Map<string, string>();
const animeKaiScraper = new AnimeKaiScraper();

// ── Resilient in-memory caches (stale-serve on failure) ────────────────────
let spotlightMemCache: { spotlight: any[] } | null = null;
let latestUpdatesMemCache: { latestEpisodes: any[] } | null = null;
const newReleasesMemCache = new Map<string, { data: any[]; pagination: any }>();
const SPOTLIGHT_REDIS_KEY = 'animekai:spotlight:enriched';
const LATEST_REDIS_KEY = 'animekai:latest-updates:enriched:v2';
const NEW_RELEASES_REDIS_PREFIX = 'animekai:new-releases:enriched:v2';
const CACHE_TTL_SECONDS = 300; // 5 min fresh window

const buildAnimeKaiFallbackItems = (items: any[]) => {
    const safeItems = Array.isArray(items) ? items.filter((item) => item?.title) : [];
    return safeItems.map((item) => ({
        ...item,
        id: Number(item?.id || 0) || 0,
        mal_id: Number(item?.mal_id || item?.id || 0) || 0,
        anilist: item?.anilist || null,
    }));
};

const enrichAnimeKaiItems = async (items: any[]) => {
    const safeItems = Array.isArray(items) ? items.filter((item) => item?.title) : [];
    const results = await Promise.allSettled(
        safeItems.map(async (item) => {
            const anilistMedia = await anilistService.findBestAnimeMatch({
                titles: [item.title, item.jname].filter(Boolean),
                episodes: Number(item.episodes || item.latestEpisode || item.sub || 0) || undefined,
                format: item.type,
                perPage: 5,
            });

            return {
                ...item,
                id: anilistMedia?.id || 0,
                mal_id: anilistMedia?.idMal || anilistMedia?.id || 0,
                anilist: anilistMedia || null,
            };
        })
    );

    return results
        .map((result, index) => result.status === 'fulfilled'
            ? result.value
            : {
                ...safeItems[index],
                id: 0,
                mal_id: 0,
                anilist: null,
            })
        .filter((item) => item?.title);
};

const enrichAnimeKaiItemsWithFallback = async (items: any[], timeoutMs = 5000) => {
    const rawItems = Array.isArray(items) ? items : [];
    return Promise.race([
        enrichAnimeKaiItems(rawItems),
        new Promise<any[]>((resolve) => setTimeout(() => resolve(buildAnimeKaiFallbackItems(rawItems)), timeoutMs)),
    ]);
};

const refreshSpotlightCache = async (): Promise<{ spotlight: any[] }> => {
    const rawItems = await animeKaiScraper.getSpotlightAnime();
    if (rawItems.length === 0) {
        throw new Error('AnimeKai spotlight returned no items');
    }

    const rawSpotlight = buildAnimeKaiFallbackItems(rawItems);
    const spotlight = await Promise.race([
        enrichAnimeKaiItems(rawItems),
        new Promise<any[]>((resolve) => setTimeout(() => resolve(rawSpotlight), 2500)),
    ]);
    const payload = { spotlight };

    if (spotlight.length > 0) {
        spotlightMemCache = payload;
        redis.set(SPOTLIGHT_REDIS_KEY, payload, { ex: CACHE_TTL_SECONDS }).catch(() => undefined);
    }

    return payload;
};

const getStaleSpotlight = async (): Promise<{ spotlight: any[] }> => {
    if (spotlightMemCache && spotlightMemCache.spotlight.length > 0) {
        return spotlightMemCache;
    }
    try {
        const redisHit = await redis.get<any>(SPOTLIGHT_REDIS_KEY);
        if (redisHit && Array.isArray(redisHit.spotlight) && redisHit.spotlight.length > 0) {
            spotlightMemCache = redisHit;
            return redisHit;
        }
    } catch { /* swallow */ }
    return { spotlight: [] };
};

/** Read stale data from memory → Redis → empty. Never throws. */
const getStaleLatestUpdates = async (): Promise<{ latestEpisodes: any[] }> => {
    if (latestUpdatesMemCache && latestUpdatesMemCache.latestEpisodes.length > 0) {
        return latestUpdatesMemCache;
    }
    try {
        const redisHit = await redis.get<any>(LATEST_REDIS_KEY);
        if (redisHit && Array.isArray(redisHit.latestEpisodes) && redisHit.latestEpisodes.length > 0) {
            latestUpdatesMemCache = redisHit;
            return redisHit;
        }
    } catch { /* swallow */ }
    return { latestEpisodes: [] };
};

const refreshLatestUpdatesCache = async (): Promise<{ latestEpisodes: any[] }> => {
    const rawItems = await animeKaiScraper.getLatestUpdates();
    const latestEpisodes = await enrichAnimeKaiItemsWithFallback(rawItems, 4500);
    const payload = { latestEpisodes };

    if (latestEpisodes.length > 0) {
        latestUpdatesMemCache = payload;
        redis.set(LATEST_REDIS_KEY, payload, { ex: CACHE_TTL_SECONDS }).catch(() => undefined);
    }

    return payload;
};

const getStaleNewReleases = async (key: string): Promise<{ data: any[]; pagination: any } | null> => {
    const mem = newReleasesMemCache.get(key);
    if (mem && mem.data.length > 0) return mem;
    try {
        const redisHit = await redis.get<any>(`${NEW_RELEASES_REDIS_PREFIX}:${key}`);
        if (redisHit && Array.isArray(redisHit.data) && redisHit.data.length > 0) {
            newReleasesMemCache.set(key, redisHit);
            return redisHit;
        }
    } catch { /* swallow */ }
    return null;
};

const mergeCookieHeader = (existing: string, setCookie: string[]) => {
    const jar = new Map<string, string>();
    existing
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((pair) => {
            const eq = pair.indexOf('=');
            if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
        });

    setCookie.forEach((entry) => {
        const first = String(entry || '').split(';')[0].trim();
        const eq = first.indexOf('=');
        if (eq > 0) jar.set(first.slice(0, eq), first.slice(eq + 1));
    });

    return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
};

const getPublicBase = (req: any) => {
    const xfProtoRaw = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const proto = xfProtoRaw === 'https' || xfProtoRaw === 'http'
        ? xfProtoRaw
        : (req.protocol === 'https' ? 'https' : 'http');
    return `${proto}://${req.get('host')}`;
};

const sanitizeCookie = (raw: string) => String(raw || '').replace(/[\r\n]/g, '').trim();
const normalizeEpisodeSession = (animeSessionRaw: string, raw: string) => {
    const source = String(raw || '').trim();
    if (!source) return source;
    const animeSession = String(animeSessionRaw || '').trim().replace(/\/+$/, '');

    // Handle legacy forms like "...-20401?ep=162349" or full URLs containing ?ep=
    const tryDecode = (value: string) => {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    };

    const decoded = tryDecode(tryDecode(source));
    if (decoded.includes('$token=')) {
        return decoded;
    }

    const pairMatch = decoded.match(/([^?#]+)\?ep=([^&#]+)/i);
    if (pairMatch?.[1] && pairMatch?.[2]) {
        const base = pairMatch[1].trim().replace(/\/+$/, '');
        const ep = pairMatch[2].trim();
        return `${base}?ep=${ep}`;
    }
    const epOnlyMatch = decoded.match(/[?&]?ep=([^&#]+)/i);
    if (epOnlyMatch?.[1] && animeSession) {
        return `${animeSession}?ep=${epOnlyMatch[1].trim()}`;
    }

    const stripped = decoded.split('#')[0].split('?')[0].trim();
    const withoutTrailingSlash = stripped.replace(/\/+$/, '');
    if (!withoutTrailingSlash) return source;
    const lastSegment = withoutTrailingSlash.split('/').pop() || withoutTrailingSlash;
    return lastSegment.trim() || source;
};

router.get('/search', async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }
        const result = await scraperService.search(query);
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Latest Updates (homepage section) — never 500s ─────────────────────────
router.get('/animekai/spotlight', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    try {
        if (spotlightMemCache && spotlightMemCache.spotlight.length > 0) {
            res.json(spotlightMemCache);
            refreshSpotlightCache().catch((error) => {
                console.error('AnimeKai spotlight background refresh failed:', error?.message || error);
            });
            return;
        }

        const redisHit = await redis.get<any>(SPOTLIGHT_REDIS_KEY).catch(() => null);
        if (redisHit && Array.isArray(redisHit.spotlight) && redisHit.spotlight.length > 0) {
            spotlightMemCache = redisHit;
            res.json(redisHit);
            refreshSpotlightCache().catch((error) => {
                console.error('AnimeKai spotlight background refresh failed:', error?.message || error);
            });
            return;
        }

        const payload = await refreshSpotlightCache();
        res.json(payload);
    } catch (error: any) {
        console.error('AnimeKai spotlight scrape failed, serving stale:', error?.message || error);
        const stale = await getStaleSpotlight();
        if (!Array.isArray(stale.spotlight) || stale.spotlight.length === 0) {
            res.set('Cache-Control', 'no-store');
            res.status(503).json({ error: 'AnimeKai spotlight temporarily unavailable' });
            return;
        }
        res.json(stale);
    }
});

router.get('/search/animepahe', async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }
        const result = await scraperService.searchAnimePahe(query);
        res.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/search/animekai', async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }
        const result = await scraperService.searchAnimeKai(query);
        res.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/animekai/latest-updates', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    try {
        if (latestUpdatesMemCache && latestUpdatesMemCache.latestEpisodes.length > 0) {
            res.json(latestUpdatesMemCache);
            refreshLatestUpdatesCache().catch((error) => {
                console.error('AnimeKai latest-updates background refresh failed:', error?.message || error);
            });
            return;
        }

        const redisHit = await redis.get<any>(LATEST_REDIS_KEY).catch(() => null);
        if (redisHit && Array.isArray(redisHit.latestEpisodes) && redisHit.latestEpisodes.length > 0) {
            latestUpdatesMemCache = redisHit;
            res.json(redisHit);
            refreshLatestUpdatesCache().catch((error) => {
                console.error('AnimeKai latest-updates background refresh failed:', error?.message || error);
            });
            return;
        }

        const payload = await refreshLatestUpdatesCache();
        res.json(payload);
    } catch (error: any) {
        console.error('AnimeKai latest-updates scrape failed, serving stale:', error?.message || error);
        const stale = await getStaleLatestUpdates();
        res.json(stale);
    }
});

// ── Recently Updated / View All (paginated) — never 500s ──────────────────
router.get('/recently-updated', async (req, res) => {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 18;
    const cacheKey = `${page}:${limit}`;

    res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    try {
        const result = await animeKaiScraper.getNewReleases(page, limit);
        const listItems = await enrichAnimeKaiItemsWithFallback(result.data, 6000);
        const payload = { data: listItems, pagination: result.pagination };

        if (listItems.length > 0) {
            newReleasesMemCache.set(cacheKey, payload);
            redis.set(`${NEW_RELEASES_REDIS_PREFIX}:${cacheKey}`, payload, { ex: CACHE_TTL_SECONDS }).catch(() => undefined);
        }

        res.json(payload);
    } catch (error: any) {
        console.error(`AnimeKai new-releases (page=${page}) scrape failed, serving stale:`, error?.message || error);
        const stale = await getStaleNewReleases(cacheKey);
        res.json(stale || {
            data: [],
            pagination: { current_page: page, last_visible_page: page, has_next_page: false },
        });
    }
});

// ── New Releases (explicit endpoint, same resilience) ──────────────────────
router.get('/animekai/new-releases', async (req, res) => {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 18;
    const cacheKey = `${page}:${limit}`;

    res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    try {
        const result = await animeKaiScraper.getNewReleases(page, limit);
        const listItems = await enrichAnimeKaiItemsWithFallback(result.data, 6000);
        const payload = { data: listItems, pagination: result.pagination };

        if (listItems.length > 0) {
            newReleasesMemCache.set(cacheKey, payload);
            redis.set(`${NEW_RELEASES_REDIS_PREFIX}:${cacheKey}`, payload, { ex: CACHE_TTL_SECONDS }).catch(() => undefined);
        }

        res.json(payload);
    } catch (error: any) {
        console.error(`AnimeKai new-releases (page=${page}) scrape failed, serving stale:`, error?.message || error);
        const stale = await getStaleNewReleases(cacheKey);
        res.json(stale || {
            data: [],
            pagination: { current_page: page, last_visible_page: page, has_next_page: false },
        });
    }
});

router.get('/animekai/az-list/:letter', async (req, res) => {
    try {
        const letter = String(req.params.letter || 'All');
        const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
        const result = await animeKaiScraper.getAZList(letter, page);
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/animekai/genres', async (_req, res) => {
    try {
        const genres = await animeKaiScraper.getGenres();
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800');
        res.json({ genres });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/animekai/genre/:name', async (req, res) => {
    try {
        const genre = String(req.params.name || '').trim();
        const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;
        const result = await animeKaiScraper.getGenreAnime(genre, page, limit);
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/animekai/top-trending', async (req, res) => {
    try {
        const requestedRange = String(req.query.range || 'now').toLowerCase();
        const range = ['now', 'day', 'week', 'month'].includes(requestedRange)
            ? requestedRange as 'now' | 'day' | 'week' | 'month'
            : 'now';
        const rawTop10 = await animeKaiScraper.getTopTrending(range);
        const top10 = await enrichAnimeKaiItemsWithFallback(rawTop10, 5000);
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json({ top10 });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/episodes', async (req, res) => {
    try {
        const session = req.query.session as string;
        if (!session) {
            return res.status(400).json({ error: 'Query parameter session is required' });
        }
        // Support hybrid s: IDs (strip prefix)
        const realSession = session.startsWith('s:') ? session.substring(2) : session;
        const result = await Promise.race([
            scraperService.getEpisodes(realSession),
            new Promise((resolve) => setTimeout(() => resolve({ episodes: [], lastPage: 1 }), 30_000)),
        ]);
        res.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/streams', async (req, res) => {
    try {
        const animeSessionRaw = req.query.anime_session as string;
        const animeSession = animeSessionRaw?.startsWith('s:') ? animeSessionRaw.substring(2) : animeSessionRaw;
        const epSessionRaw = req.query.ep_session as string;
        const epSession = normalizeEpisodeSession(animeSession, epSessionRaw);

        if (!epSession || !animeSession) {
            return res.status(400).json({ error: 'anime_session and ep_session are required' });
        }
        const result = await scraperService.getStreams(animeSession, epSession);
        const hostBase = getPublicBase(req);
        const normalized = Array.isArray(result)
            ? result.map((item: any) => {
                if (!item?.url || typeof item.url !== 'string') return item;
                if (item.url.includes('/api/scraper/proxy?')) {
                    if (item.url.startsWith('/api/')) {
                        item.url = hostBase + item.url;
                    } else {
                        item.url = item.url.replace(/^https?:\/\/[^/]+/i, hostBase);
                    }
                }
                return item;
            })
            : result;
        if (Array.isArray(normalized) && normalized.length === 0) {
            // Do not cache empty stream payloads in browser/proxies.
            res.set('Cache-Control', 'no-store');
        } else {
            res.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800');
        }
        res.json(normalized);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/prefetch/streams', async (req, res) => {
    try {
        const animeSession = req.body?.anime_session as string | undefined;
        const epSessions = req.body?.ep_sessions as string[] | undefined;

        if (!animeSession || !Array.isArray(epSessions) || epSessions.length === 0) {
            return res.status(400).json({ error: 'anime_session and ep_sessions[] are required' });
        }

        const result = await scraperService.prefetchStreams(animeSession, epSessions);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Generic HLS proxy for stream sources (rewrites nested playlists and keys)
router.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    const requestedReferer = (req.query.referer as string) || '';
    const requestedCookie = sanitizeCookie((req.query.cookie as string) || '');

    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const target = new URL(targetUrl);
        const cookieKey = target.origin;
        const storedCookie = sanitizeCookie(upstreamCookieJar.get(cookieKey) || '');
        const refererCandidates = [
            requestedReferer,
            `${target.origin}/`,
            'https://megacloud.blog/',
        ].filter(Boolean);

        let response: any = null;
        let lastError: any = null;

        for (const referer of refererCandidates) {
            try {
                response = await axios.get(targetUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        Referer: referer,
                        Origin: new URL(referer).origin,
                        Accept: '*/*',
                        ...(req.headers.range ? { Range: req.headers.range } : {}),
                        ...((requestedCookie || storedCookie) ? { Cookie: requestedCookie || storedCookie } : {}),
                    },
                    timeout: 15000,
                });

                const setCookie = response.headers?.['set-cookie'];
                if (Array.isArray(setCookie) && setCookie.length > 0) {
                    const seedCookie = requestedCookie || storedCookie;
                    const merged = mergeCookieHeader(seedCookie, setCookie);
                    if (merged) upstreamCookieJar.set(cookieKey, merged);
                }
                break;
            } catch (error: any) {
                lastError = error;
                // Retry 403/401 with next referer candidate.
                if (![401, 403].includes(error?.response?.status)) break;
            }
        }

        if (!response) throw lastError;

        const contentType = response.headers['content-type'] || '';
        const lowerUrl = targetUrl.toLowerCase();

        const isSubtitle = lowerUrl.includes('.vtt') || lowerUrl.includes('.srt');
        const normalizedContentType = isSubtitle
            ? (lowerUrl.includes('.vtt') ? 'text/vtt; charset=utf-8' : 'text/plain; charset=utf-8')
            : contentType;

        res.status(response.status);
        res.set('Content-Type', normalizedContentType);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
        
        if (response.headers['content-range']) res.set('Content-Range', response.headers['content-range']);
        if (response.headers['accept-ranges']) res.set('Accept-Ranges', response.headers['accept-ranges']);
        if (response.headers['content-length']) res.set('Content-Length', response.headers['content-length']);

        const isM3u8 =
            contentType.includes('mpegurl') ||
            contentType.includes('m3u8') ||
            targetUrl.includes('.m3u8');

        if (isSubtitle) {
            const text = Buffer.from(response.data).toString('utf-8');
            return res.send(text);
        }

        if (!isM3u8) {
            return res.send(response.data);
        }

        const body = Buffer.from(response.data).toString('utf-8');
        const urlObj = new URL(targetUrl);
        const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        // Preserve the original upstream referer across nested HLS playlists.
        // Some hosts reject variant/segment requests when referer is replaced with the CDN origin.
        const nextReferer = requestedReferer || `${urlObj.origin}/`;
        const nextCookie = sanitizeCookie(upstreamCookieJar.get(cookieKey) || requestedCookie);

        // Only sub-playlist (.m3u8) and encryption key URIs need to be proxied for CORS.
        // Raw media segment lines (.ts, .aac, .mp4, etc.) are served directly from the upstream
        // CDN so that Vercel is not burdened with streaming gigabytes of video through its
        // serverless functions — which is the primary driver of Fluid Active CPU exhaustion.
        const isMediaSegment = (line: string) => {
            const lower = line.toLowerCase().split('?')[0];
            return (
                lower.endsWith('.ts') ||
                lower.endsWith('.aac') ||
                lower.endsWith('.mp4') ||
                lower.endsWith('.m4s') ||
                lower.endsWith('.cmaf') ||
                lower.endsWith('.fmp4')
            );
        };

        const rewritten = body
            .split('\n')
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return line;

                if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
                    // Rewrite URI= attributes (encryption keys, etc.) through proxy for CORS.
                    return line.replace(/URI=["']([^"']+)["']/g, (_m, uri) => {
                        const absoluteUri = uri.startsWith('http')
                            ? uri
                            : (uri.startsWith('/') ? `${urlObj.origin}${uri}` : `${basePath}${uri}`);
                        return `URI="${getPublicBase(req)}/api/scraper/proxy?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(nextReferer)}${nextCookie ? `&cookie=${encodeURIComponent(nextCookie)}` : ''}"`;
                    });
                }

                if (trimmed.startsWith('#')) return line;

                const absolute = trimmed.startsWith('http')
                    ? trimmed
                    : (trimmed.startsWith('/') ? `${urlObj.origin}${trimmed}` : `${basePath}${trimmed}`);

                // Sub-playlist (.m3u8) lines must pass through the proxy for CORS.
                // Media segments (.ts etc.) are served directly from the upstream CDN.
                if (!isMediaSegment(trimmed) && (trimmed.toLowerCase().includes('.m3u8') || !trimmed.toLowerCase().split('?')[0].includes('.'))) {
                    return `${getPublicBase(req)}/api/scraper/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(nextReferer)}${nextCookie ? `&cookie=${encodeURIComponent(nextCookie)}` : ''}`;
                }

                // Direct absolute URL for media segments — browser fetches from CDN, not Vercel.
                return absolute;
            })
            .join('\n');

        return res.send(rewritten);
    } catch (error: any) {
        console.error('Scraper proxy error:', targetUrl, error?.message || error);
        return res.status(error?.response?.status || 500).send('Proxy error');
    }
});

export default router;
