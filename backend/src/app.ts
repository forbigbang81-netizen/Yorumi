import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import scraperRoutes from './api/scraper/scraper.routes';
import mangaScraperRoutes from './api/scraper/mangascraper.routes';
import anilistRoutes from './api/anilist/anilist.routes';
import hianimeRoutes from './api/scraper/hianime.routes';
import logoRoutes from './api/logo/logo.routes';
import imageRoutes from './api/image/image.routes';
import userRoutes from './api/user/user.routes';
import { mappingService } from './api/mapping/mapping.service';
import { getAniListId } from './api/mapping/mapper';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/anilist', anilistRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/manga', mangaScraperRoutes);
app.use('/api/hianime', hianimeRoutes);
app.use('/api/logo', logoRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes);

app.get('/api/mapping/:id', async (req, res) => {
    const mapping = await mappingService.getMapping(req.params.id);
    if (mapping) {
        res.json(mapping);
    } else {
        res.status(404).json({ message: 'Mapping not found' });
    }
});

app.post('/api/mapping', async (req, res) => {
    const { anilistId, scraperId, title } = req.body;
    if (!anilistId || !scraperId) {
        return res.status(400).json({ message: 'Missing anilistId or scraperId' });
    }
    const success = await mappingService.saveMapping(anilistId, scraperId, title);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ message: 'Failed to save mapping' });
    }
});

app.delete('/api/mapping/:id', async (req, res) => {
    const success = await mappingService.deleteMapping(req.params.id);
    if (success) {
        res.json({ success: true, deleted: req.params.id });
    } else {
        res.status(500).json({ message: 'Failed to delete mapping' });
    }
});

app.post('/api/mapping/identify', async (req, res) => {
    const { slug, title } = req.body;
    if (!slug || !title) {
        return res.status(400).json({ message: 'Missing slug or title' });
    }
    const anilistId = await getAniListId(slug, title);
    if (anilistId) {
        res.json({ anilistId });
    } else {
        res.status(404).json({ message: 'AniList ID not found' });
    }
});

const avatarsDir = path.join(__dirname, '../avatars');
app.use('/avatars', express.static(avatarsDir));

const getFilesRecursively = (dir: string): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFilesRecursively(filePath));
        } else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) {
            results.push(path.relative(avatarsDir, filePath).replace(/\\/g, '/'));
        }
    });
    return results;
};

app.get('/api/avatars/random', (_req, res) => {
    try {
        const files = getFilesRecursively(avatarsDir);
        if (files.length === 0) {
            return res.status(404).json({ message: 'No avatars found' });
        }
        const randomFile = files[Math.floor(Math.random() * files.length)];
        res.json({ url: `/avatars/${randomFile}` });
    } catch (error) {
        console.error('Error getting random avatar:', error);
        res.status(500).json({ message: 'Failed to get random avatar' });
    }
});

app.get('/', (_req, res) => {
    res.send('Yorumi Backend is running');
});

export default app;
