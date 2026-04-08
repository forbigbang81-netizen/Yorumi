import 'dotenv/config';
import app from './app';
import { HiAnimeScraper } from './api/scraper/hianime.service';
import { warmSpotlightCache } from './api/scraper/manga.service';
import { warmupAnimeDatabase } from './api/logo/fanart.service';
import { startScraperWarmer } from './api/scraper/scraper-warmer';
import { logger } from './core/logger';

const port = process.env.PORT || 3001;
const shouldRunStandaloneServer = !process.env.VERCEL;

if (shouldRunStandaloneServer) {
    const startServer = async () => {
        logger.info('Starting Yorumi backend server');

        const hianimeScraper = new HiAnimeScraper();

        try {
            logger.info('Warming anime spotlight cache');
            await Promise.race([
                hianimeScraper.getEnrichedSpotlight(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Cache warming timeout')), 10000)
                )
            ]);
            logger.info('Spotlight cache warmed successfully');
        } catch (error) {
            logger.warn('Spotlight cache warming failed or timed out', error);
            logger.warn('Server will continue, cache will be populated on first request');
        }

        try {
            await warmSpotlightCache();
            await warmupAnimeDatabase();
        } catch (error) {
            logger.warn('Secondary cache warming failed', error);
        }

        app.listen(port, () => {
            logger.info(`Server is running on http://localhost:${port}`);
        });

        startScraperWarmer();

        setInterval(() => {
            logger.info('Running scheduled spotlight refresh');
            hianimeScraper.getEnrichedSpotlight()
                .catch((error) => logger.error('Scheduled spotlight refresh failed', error));
        }, 12 * 60 * 60 * 1000);
    };

    startServer();
}

export default app;
