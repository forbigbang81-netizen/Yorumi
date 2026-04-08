import { mappingService } from '../../api/mapping/mapping.service';

export const mappingRepository = {
    getByAniListId: (anilistId: string) => mappingService.getMapping(anilistId),
    save: (anilistId: string, scraperId: string, title?: string) => mappingService.saveMapping(anilistId, scraperId, title),
    remove: (anilistId: string) => mappingService.deleteMapping(anilistId),
};
