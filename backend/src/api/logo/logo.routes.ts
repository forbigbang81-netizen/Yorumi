import { Router } from 'express';
import { getAnimeLogo, batchGetAnimeLogos } from './fanart.service';
import { anilistService } from '../anilist/anilist.service';

const router = Router();

/**
 * GET /api/logo/resolve?title=...&year=...&episodes=...&format=...
 * Resolve an anime title to AniList, then fetch the Fanart.tv logo.
 */
router.get('/resolve', async (req, res) => {
    try {
        const title = String(req.query.title || '').replace(/\s+/g, ' ').trim();

        if (!title) {
            return res.status(400).json({
                error: 'Query parameter title is required',
                logo: null,
                source: 'fallback',
                cached: false
            });
        }

        const year = Number(req.query.year || 0) || undefined;
        const episodes = Number(req.query.episodes || 0) || undefined;
        const format = String(req.query.format || '').trim() || undefined;
        const match = await anilistService.findBestAnimeMatch({
            titles: [title],
            year,
            episodes,
            format,
            perPage: 5
        });
        const anilistId = Number(match?.id || 0);

        if (!anilistId) {
            return res.json({
                anilistId: null,
                logo: null,
                source: 'fallback',
                cached: false
            });
        }

        const result = await getAnimeLogo(anilistId);
        res.json({ ...result, anilistId });
    } catch (error) {
        console.error('[Logo API] Resolve error:', error);
        res.status(500).json({
            error: 'Failed to resolve logo',
            logo: null,
            source: 'fallback',
            cached: false
        });
    }
});

/**
 * GET /api/logo/:anilistId
 * Fetch anime logo by AniList ID
 */
router.get('/:anilistId', async (req, res) => {
    try {
        const anilistId = parseInt(req.params.anilistId);

        if (isNaN(anilistId)) {
            return res.status(400).json({
                error: 'Invalid AniList ID',
                logo: null,
                source: 'fallback'
            });
        }

        const result = await getAnimeLogo(anilistId);

        res.json(result);
    } catch (error) {
        console.error('[Logo API] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch logo',
            logo: null,
            source: 'fallback',
            cached: false
        });
    }
});

/**
 * POST /api/logo/batch
 * Fetch multiple anime logos in one request
 * Body: { anilistIds: number[] }
 */
router.post('/batch', async (req, res) => {
    try {
        const { anilistIds } = req.body;

        if (!Array.isArray(anilistIds) || anilistIds.length === 0) {
            return res.status(400).json({
                error: 'Invalid request: anilistIds must be a non-empty array'
            });
        }

        // Limit to 20 IDs per request to prevent abuse
        const ids = anilistIds.slice(0, 20).map(id => parseInt(id)).filter(id => !isNaN(id));

        const results = await batchGetAnimeLogos(ids);

        // Convert Map to object for JSON response
        const response: Record<number, { logo: string | null; source: 'fanart' | 'fallback'; cached: boolean }> = {};
        results.forEach((value, key) => {
            response[key] = value;
        });

        res.json(response);
    } catch (error) {
        console.error('[Logo API] Batch error:', error);
        res.status(500).json({
            error: 'Failed to fetch logos'
        });
    }
});

export default router;

