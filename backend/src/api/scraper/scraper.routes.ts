import { Router } from 'express';
import { scraperService } from './scraper.service';
import axios from 'axios';

const router = Router();
const upstreamCookieJar = new Map<string, string>();

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

router.get('/episodes', async (req, res) => {
    try {
        const session = req.query.session as string;
        if (!session) {
            return res.status(400).json({ error: 'Query parameter session is required' });
        }
        // Support hybrid s: IDs (strip prefix)
        const realSession = session.startsWith('s:') ? session.substring(2) : session;
        const result = await scraperService.getEpisodes(realSession);
        res.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/streams', async (req, res) => {
    try {
        const animeSession = req.query.anime_session as string;
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

        const rewritten = body
            .split('\n')
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return line;

                if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
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

                return `${getPublicBase(req)}/api/scraper/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(nextReferer)}${nextCookie ? `&cookie=${encodeURIComponent(nextCookie)}` : ''}`;
            })
            .join('\n');

        return res.send(rewritten);
    } catch (error: any) {
        console.error('Scraper proxy error:', targetUrl, error?.message || error);
        return res.status(error?.response?.status || 500).send('Proxy error');
    }
});

export default router;
