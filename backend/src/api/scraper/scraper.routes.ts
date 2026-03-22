import { Router } from 'express';
import { scraperService } from './scraper.service';
import axios from 'axios';

const router = Router();

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
        const hostBase = `${req.protocol}://${req.get('host')}`;
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
    const referer = (req.query.referer as string) || 'https://megacloud.blog/';

    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                Referer: referer,
                Origin: new URL(referer).origin,
                Accept: '*/*',
            },
            timeout: 15000,
        });

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
                        return `URI="${req.protocol}://${req.get('host')}/api/scraper/proxy?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(referer)}"`;
                    });
                }

                if (trimmed.startsWith('#')) return line;

                const absolute = trimmed.startsWith('http')
                    ? trimmed
                    : (trimmed.startsWith('/') ? `${urlObj.origin}${trimmed}` : `${basePath}${trimmed}`);

                return `${req.protocol}://${req.get('host')}/api/scraper/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(referer)}`;
            })
            .join('\n');

        return res.send(rewritten);
    } catch (error: any) {
        console.error('Scraper proxy error:', targetUrl, error?.message || error);
        return res.status(error?.response?.status || 500).send('Proxy error');
    }
});

export default router;
