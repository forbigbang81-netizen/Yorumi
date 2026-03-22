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
        const epSession = req.query.ep_session as string;

        if (!epSession || !animeSession) {
            return res.status(400).json({ error: 'anime_session and ep_session are required' });
        }
        const result = await scraperService.getStreams(animeSession, epSession);
        const hostBase = getPublicBase(req);
        const normalized = Array.isArray(result)
            ? result.map((item: any) => {
                if (!item?.url || typeof item.url !== 'string') return item;
                if (item.url.includes('/api/scraper/proxy?')) {
                    item.url = item.url.replace(/^https?:\/\/[^/]+/i, hostBase);
                }
                return item;
            })
            : result;
        res.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800');
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

    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const target = new URL(targetUrl);
        const cookieKey = target.origin;
        const storedCookie = upstreamCookieJar.get(cookieKey) || '';
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
                        ...(storedCookie ? { Cookie: storedCookie } : {}),
                    },
                    timeout: 15000,
                });

                const setCookie = response.headers?.['set-cookie'];
                if (Array.isArray(setCookie) && setCookie.length > 0) {
                    const merged = mergeCookieHeader(storedCookie, setCookie);
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

        res.set('Content-Type', normalizedContentType);
        res.set('Access-Control-Allow-Origin', '*');

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
        const nextReferer = `${urlObj.origin}/`;

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
                        return `URI="${getPublicBase(req)}/api/scraper/proxy?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(nextReferer)}"`;
                    });
                }

                if (trimmed.startsWith('#')) return line;

                const absolute = trimmed.startsWith('http')
                    ? trimmed
                    : (trimmed.startsWith('/') ? `${urlObj.origin}${trimmed}` : `${basePath}${trimmed}`);

                return `${getPublicBase(req)}/api/scraper/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(nextReferer)}`;
            })
            .join('\n');

        return res.send(rewritten);
    } catch (error: any) {
        console.error('Scraper proxy error:', targetUrl, error?.message || error);
        return res.status(error?.response?.status || 500).send('Proxy error');
    }
});

export default router;
