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
        const scoreStream = (stream: StreamLink) => {
            const quality = parseInt(String(stream.quality || '0'), 10) || 0;
            const url = String(stream.url || '');
            const directUrl = String(stream.directUrl || '');
            const hasDirectUrl = Boolean(directUrl);
            const isHls = Boolean(stream.isHls) || url.includes('.m3u8') || directUrl.includes('.m3u8');
            const isIframeLike = /vidsrc|vidstream|megacloud|embed/i.test(url) && !hasDirectUrl && !isHls;
            return (isHls ? 1_000_000 : 0) + (hasDirectUrl ? 100_000 : 0) + (isIframeLike ? -10_000 : 0) + quality;
        };

        const qualityMap = new Map<string, StreamLink>();
        const sortedData = [...data].sort(
            (a: StreamLink, b: StreamLink) => scoreStream(b) - scoreStream(a)
        );

        sortedData.forEach((s: StreamLink) => {
            const mapped = getMappedQuality(s.quality);
            const audio = String(s.audio || 'sub').toLowerCase();
            const key = `${audio}:${mapped}`;
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
