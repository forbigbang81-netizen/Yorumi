import { useState, useRef, useCallback } from 'react';

import type { Episode } from '../types/anime';
import type { StreamLink } from '../types/stream';
import { getStreamData, getMappedQuality } from '../utils/streamUtils';

export function useStreams(scraperSession: string | null) {
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
    const [streams, setStreams] = useState<StreamLink[]>([]);
    const [selectedStreamIndex, setSelectedStreamIndex] = useState<number>(0);
    const [isAutoQuality, setIsAutoQuality] = useState(true);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [streamLoading, setStreamLoading] = useState(false);
    const streamCache = useRef(new Map<string, Promise<StreamLink[]>>());

    const currentStream = streams[selectedStreamIndex] || null;



    const ensureStreamData = useCallback((episode: Episode): Promise<StreamLink[]> => {
        if (!scraperSession) return Promise.resolve([]);
        if (!streamCache.current.has(episode.session)) {
            const promise = getStreamData(episode, scraperSession)
                .catch(e => {
                    console.error('Failed to load stream', e);
                    streamCache.current.delete(episode.session);
                    return [];
                });
            streamCache.current.set(episode.session, promise);
        }
        return streamCache.current.get(episode.session)!;
    }, [scraperSession]);

    const prefetchStream = useCallback((episode: Episode) => {
        if (scraperSession) ensureStreamData(episode);
    }, [scraperSession, ensureStreamData]);

    const loadStream = useCallback(async (episode: Episode) => {
        setCurrentEpisode(episode);
        setStreamLoading(true);
        setStreams([]);

        try {
            const streamData = await ensureStreamData(episode);
            if (streamData.length > 0) {
                setStreams(streamData);
                setSelectedStreamIndex(0);
                setIsAutoQuality(true);
            }
        } catch (e) {
            console.error('Failed to load stream', e);
        } finally {
            setStreamLoading(false);
        }
    }, [ensureStreamData]);

    const handleQualityChange = useCallback((index: number) => {
        setSelectedStreamIndex(index);
        setIsAutoQuality(false);
        setShowQualityMenu(false);
    }, []);

    const setAutoQuality = useCallback(() => {
        setSelectedStreamIndex(0);
        setIsAutoQuality(true);
        setShowQualityMenu(false);
    }, []);

    // Clear all stream state when switching anime
    const clearStreams = useCallback(() => {
        setCurrentEpisode(null);
        setStreams([]);
        setSelectedStreamIndex(0);
        setStreamLoading(false);
        streamCache.current.clear();
    }, []);

    return {
        // State
        currentEpisode,
        streams,
        selectedStreamIndex,
        isAutoQuality,
        showQualityMenu,
        currentStream,
        streamLoading,

        // Actions
        loadStream,
        prefetchStream,
        handleQualityChange,
        setAutoQuality,
        setShowQualityMenu,
        getMappedQuality,
        clearStreams,
    };
}
