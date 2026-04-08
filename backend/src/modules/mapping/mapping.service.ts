import { getAniListId } from '../../api/mapping/mapper';
import { AppError } from '../../core/errors/app-error';
import { mappingRepository } from './mapping.repository';

export const mappingModuleService = {
    async getMapping(anilistId: string) {
        const mapping = await mappingRepository.getByAniListId(anilistId);
        if (!mapping) {
            throw new AppError('Mapping not found', 404);
        }

        return mapping;
    },

    async saveMapping(input: { anilistId?: string; scraperId?: string; title?: string }) {
        if (!input.anilistId || !input.scraperId) {
            throw new AppError('Missing anilistId or scraperId', 400);
        }

        const success = await mappingRepository.save(input.anilistId, input.scraperId, input.title);
        if (!success) {
            throw new AppError('Failed to save mapping', 500);
        }

        return { saved: true };
    },

    async deleteMapping(anilistId: string) {
        const success = await mappingRepository.remove(anilistId);
        if (!success) {
            throw new AppError('Failed to delete mapping', 500);
        }

        return { deleted: anilistId };
    },

    async identify(body: { slug?: string; title?: string }) {
        if (!body.slug || !body.title) {
            throw new AppError('Missing slug or title', 400);
        }

        const anilistId = await getAniListId(body.slug, body.title);
        if (!anilistId) {
            throw new AppError('AniList ID not found', 404);
        }

        return { anilistId };
    },
};
