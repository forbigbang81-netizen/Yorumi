import { Router } from 'express';
import { HiAnimeScraper } from './hianime.service';
import { anilistService } from '../anilist/anilist.service';
import { redis } from '../mapping/mapper';

const router = Router();
const scraper = new HiAnimeScraper();

router.get('/spotlight', async (req, res) => {
    try {
        const result = await scraper.getEnrichedSpotlight();
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch spotlight anime' });
    }
});

router.get('/latest-episodes', async (_req, res) => {
    try {
        const result = await scraper.getEnrichedLatestEpisodes();
        res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch latest episodes' });
    }
});

router.get('/az-list/:letter', async (req, res) => {
    try {
        const letter = req.params.letter;
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const data = await scraper.getAZList(letter, page);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch A-Z list' });
    }
});

// Get AniWatch Top 10 (Today/Week/Month)
router.get('/top10', async (req, res) => {
    try {
        const range = String(req.query.range || 'day').toLowerCase();
        if (!['day', 'week', 'month'].includes(range)) {
            res.status(400).json({ error: 'Invalid range. Use day, week, or month.' });
            return;
        }

        const data = await scraper.getEnrichedTopTen(range as 'day' | 'week' | 'month');
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch top 10 anime' });
    }
});


export default router;
