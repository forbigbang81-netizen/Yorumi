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
        // Prefer HLS sources first to keep playback path aligned with near-anime.
        const preferred = data.some((s: StreamLink) => s.isHls)
            ? data.filter((s: StreamLink) => s.isHls)
            : data;

        const qualityMap = new Map<string, StreamLink>();
        const sortedData = [...preferred].sort(
            (a: StreamLink, b: StreamLink) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0)
        );

        sortedData.forEach((s: StreamLink) => {
            const mapped = getMappedQuality(s.quality);
            const audio = String(s.audio || 'sub').toLowerCase();
            const provider = String(s.provider || 'unknown').toLowerCase();
            const key = `${audio}:${provider}:${mapped}`;
            if (!qualityMap.has(key)) {
                qualityMap.set(key, s);
            }
        });

        const mappedStreams = Array.from(qualityMap.values());
        // Safety fallback: if parsing/mapping deduped everything out, keep at least one playable source.
        return mappedStreams.length > 0 ? mappedStreams : [sortedData[0]];
    }
    return [];
};
