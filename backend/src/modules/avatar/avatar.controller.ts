import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/api-response';
import { avatarService } from './avatar.service';

export const avatarController = {
    getRandomAvatar(_req: Request, res: Response) {
        return sendSuccess(res, avatarService.getRandomAvatar());
    },
};
