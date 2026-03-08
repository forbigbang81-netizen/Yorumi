import type { StreamLink } from '../types/stream';
import type { Episode } from '../types/anime';
import { animeService } from '../services/animeService';

/**
 * Maps numerical quality to standard quality labels
 */
export const getMappedQuality = (q: string): string => {
    const res = parseInt(q);
    if (res >= 1000) return '1080P';
    if (res >= 600) return '720P';
    return '360P';
};

/**
 * Fetches stream data for an episode and maps qualities
 */
export const getStreamData = async (
    episode: Episode,
    scraperSession: string
): Promise<StreamLink[]> => {
    const data = await animeService.getStreams(scraperSession, episode.session);

    if (data && data.length > 0) {
        const qualityMap = new Map<string, StreamLink>();
        const sortedData = [...data].sort(
            (a: StreamLink, b: StreamLink) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0)
        );

        sortedData.forEach((s: StreamLink) => {
            const mapped = getMappedQuality(s.quality);
            // Filter out 360P as requested
            if (mapped === '360P') return;

            if (!qualityMap.has(mapped)) {
                qualityMap.set(mapped, s);
            }
        });

        return Array.from(qualityMap.values());
    }
    return [];
};
