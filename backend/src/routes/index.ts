import { Router } from 'express';
import anilistRoutes from '../api/anilist/anilist.routes';
import imageRoutes from '../api/image/image.routes';
import logoRoutes from '../api/logo/logo.routes';
import legacyHianimeRoutes from '../api/scraper/hianime.routes';
import legacyMangaRoutes from '../api/scraper/mangascraper.routes';
import legacyScraperRoutes from '../api/scraper/scraper.routes';
import userRoutes from '../api/user/user.routes';
import avatarRoutes from '../modules/avatar/avatar.routes';
import mappingRoutes from '../modules/mapping/mapping.routes';

const router = Router();

router.use('/anilist', anilistRoutes);
router.use('/scraper', legacyScraperRoutes);
router.use('/manga', legacyMangaRoutes);
router.use('/hianime', legacyHianimeRoutes);
router.use('/logo', logoRoutes);
router.use('/image', imageRoutes);
router.use('/user', userRoutes);
router.use('/mapping', mappingRoutes);
router.use('/avatars', avatarRoutes);

export default router;
