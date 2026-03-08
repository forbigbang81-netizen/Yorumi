import { Router } from 'express';
import { scraperService } from './scraper.service';

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
        res.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800');
        res.json(result);
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

export default router;
