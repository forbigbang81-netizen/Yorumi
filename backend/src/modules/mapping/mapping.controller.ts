import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/api-response';
import { mappingModuleService } from './mapping.service';

export const mappingController = {
    async getMapping(req: Request, res: Response) {
        const data = await mappingModuleService.getMapping(req.params.id);
        return sendSuccess(res, data);
    },

    async saveMapping(req: Request, res: Response) {
        const data = await mappingModuleService.saveMapping(req.body);
        return sendSuccess(res, data);
    },

    async deleteMapping(req: Request, res: Response) {
        const data = await mappingModuleService.deleteMapping(req.params.id);
        return sendSuccess(res, data);
    },

    async identify(req: Request, res: Response) {
        const data = await mappingModuleService.identify(req.body);
        return sendSuccess(res, data);
    },
};
