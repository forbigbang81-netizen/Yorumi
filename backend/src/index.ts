import 'dotenv/config';
import app from './app';
import { HiAnimeScraper } from './api/scraper/hianime.service';
import { warmSpotlightCache } from './api/scraper/manga.service';
import { warmupAnimeDatabase } from './api/logo/fanart.service';
import { startScraperWarmer } from './api/scraper/scraper-warmer';

const port = process.env.PORT || 3001;
const shouldRunStandaloneServer = !process.env.VERCEL;

if (shouldRunStandaloneServer) {
    const startServer = async () => {
        console.log('Starting Yorumi Backend Server...');

        const hianimeScraper = new HiAnimeScraper();

        try {
            console.log('Warming anime spotlight cache...');
            await Promise.race([
                hianimeScraper.getEnrichedSpotlight(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Cache warming timeout')), 10000)
                )
            ]);
            console.log('Spotlight cache warmed successfully');
        } catch (error) {
            console.warn('Spotlight cache warming failed or timed out:', error);
            console.warn('Server will continue, cache will be populated on first request');
        }

        try {
            await warmSpotlightCache();
            await warmupAnimeDatabase();
        } catch (error) {
            console.warn('Other cache warming failed:', error);
        }

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });

        startScraperWarmer();

        setInterval(() => {
            console.log('Running scheduled spotlight refresh...');
            hianimeScraper.getEnrichedSpotlight()
                .catch(err => console.error('Scheduled spotlight refresh failed:', err));
        }, 12 * 60 * 60 * 1000);
    };

    startServer();
}

export default app;
