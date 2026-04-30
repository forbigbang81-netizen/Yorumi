import { Router } from 'express';

const router = Router();
const MAL_LIST_PAGE_SIZE = 300;
const MAL_LIST_MAX_ITEMS = 3000;

router.get('/mal/:username', async (req, res) => {
    const username = String(req.params.username || '').trim();
    if (!username) {
        res.status(400).json({ error: 'Missing MAL username' });
        return;
    }

    const allEntries: unknown[] = [];

    try {
        for (let offset = 0; offset < MAL_LIST_MAX_ITEMS; offset += MAL_LIST_PAGE_SIZE) {
            const url = `https://myanimelist.net/animelist/${encodeURIComponent(username)}/load.json?status=7&offset=${offset}`;
            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            if (!response.ok) {
                res.status(response.status === 404 ? 404 : 502).json({
                    error: 'Could not load that MAL list. Make sure it is public.'
                });
                return;
            }

            const page = await response.json();
            if (!Array.isArray(page) || page.length === 0) break;

            allEntries.push(...page);
            if (page.length < MAL_LIST_PAGE_SIZE) break;
        }

        res.json({ data: allEntries });
    } catch (error) {
        console.error('Failed to import MAL list:', error);
        res.status(502).json({ error: 'Could not load that MAL list.' });
    }
});

export default router;
