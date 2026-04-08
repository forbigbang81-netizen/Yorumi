import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { avatarController } from './avatar.controller';

const router = Router();

router.get('/random', asyncHandler(avatarController.getRandomAvatar));

export default router;
