import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

import type { Episode } from '../types/anime';
import type { StreamLink } from '../types/stream';
import { animeService } from '../services/animeService';
import { getStreamData, getMappedQuality } from '../utils/streamUtils';

export function useStreams(scraperSession: string | null) {
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
    const [allStreams, setAllStreams] = useState<StreamLink[]>([]);
    const [streams, setStreams] = useState<StreamLink[]>([]);
    const [selectedStreamIndex, setSelectedStreamIndex] = useState<number>(0);
    const [isAutoQuality, setIsAutoQuality] = useState(true);
    const [selectedAudio, setSelectedAudio] = useState<'sub' | 'dub'>('sub');
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [streamLoading, setStreamLoading] = useState(false);
    const streamCache = useRef(new Map<string, Promise<StreamLink[]>>());
    const activeLoadRequestRef = useRef(0);

    const currentStream = streams[selectedStreamIndex] || null;

    const normalizeAudio = (value: string) => {
        const lower = String(value || '').trim().toLowerCase();
        if (!lower) return 'sub';
        if (/(^|\b)(dub|eng|english)(\b|$)/.test(lower)) return 'dub';
        return 'sub';
    };
    const scoreStream = useCallback((stream: StreamLink) => {
        const quality = parseInt(String(stream.quality || '0'), 10) || 0;
        const url = String(stream.url || '');
        const directUrl = String(stream.directUrl || '');
        const hasDirectUrl = Boolean(directUrl);
        const isHls = Boolean(stream.isHls) || url.includes('.m3u8') || directUrl.includes('.m3u8');
        const isIframeLike = /vidsrc|vidstream|megacloud|embed/i.test(url) && !hasDirectUrl && !isHls;

        return (isHls ? 1_000_000 : 0)
            + (hasDirectUrl ? 100_000 : 0)
            + (isIframeLike ? -10_000 : 0)
            + quality;
    }, []);

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

    const availableAudios = useMemo(() => {
        const set = new Set<'sub' | 'dub'>();
        allStreams.forEach((s) => set.add(normalizeAudio(s.audio)));
        if (set.size === 0) set.add('sub');
        return [...set];
    }, [allStreams]);

    const filterStreams = useCallback((raw: StreamLink[], audio: 'sub' | 'dub') => {
        let next = raw.filter((s) => normalizeAudio(s.audio) === audio);
        if (next.length === 0) next = raw;

        const sorted = [...next].sort((a, b) => scoreStream(b) - scoreStream(a));
        const dedupedByQuality = new Map<string, StreamLink>();

        sorted.forEach((stream) => {
            const qualityKey = getMappedQuality(String(stream.quality || '0'));
            if (!dedupedByQuality.has(qualityKey)) {
                dedupedByQuality.set(qualityKey, stream);
            }
        });

        return Array.from(dedupedByQuality.values());
    }, [scoreStream]);

    useEffect(() => {
        if (allStreams.length === 0) {
            setStreams([]);
            return;
        }
        const nextStreams = filterStreams(allStreams, selectedAudio);
        setStreams(nextStreams);
        setSelectedStreamIndex(0);
        setIsAutoQuality(true);
    }, [allStreams, selectedAudio, filterStreams]);

    const loadStream = useCallback(async (episode: Episode) => {
        const requestId = activeLoadRequestRef.current + 1;
        activeLoadRequestRef.current = requestId;
        setCurrentEpisode(episode);
        setStreamLoading(true);
        setAllStreams([]);
        setStreams([]);
        setSelectedStreamIndex(0);

        try {
            const streamData = await ensureStreamData(episode);
            if (activeLoadRequestRef.current !== requestId) {
                return;
            }
            if (streamData.length > 0) {
                const nextAudio = streamData.some((s) => normalizeAudio(s.audio) === selectedAudio)
                    ? selectedAudio
                    : (streamData.some((s) => normalizeAudio(s.audio) === 'sub') ? 'sub' : 'dub');
                const nextStreams = filterStreams(streamData, nextAudio);

                setSelectedAudio(nextAudio);
                setAllStreams(streamData);
                setStreams(nextStreams);
                setIsAutoQuality(true);
            }
        } catch (e) {
            if (activeLoadRequestRef.current !== requestId) {
                return;
            }
            console.error('Failed to load stream', e);
        } finally {
            if (activeLoadRequestRef.current === requestId) {
                setStreamLoading(false);
            }
        }
    }, [ensureStreamData, selectedAudio, filterStreams]);

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

    const tryNextStream = useCallback(() => {
        if (streams.length > 0 && selectedStreamIndex < streams.length - 1) {
            setSelectedStreamIndex((idx) => Math.min(idx + 1, streams.length - 1));
            setIsAutoQuality(false);
            return true;
        }

        const alternateAudio: 'sub' | 'dub' = selectedAudio === 'sub' ? 'dub' : 'sub';
        if (availableAudios.includes(alternateAudio)) {
            setSelectedAudio(alternateAudio);
            setSelectedStreamIndex(0);
            setIsAutoQuality(true);
            return true;
        }

        return false;
    }, [streams.length, selectedStreamIndex, selectedAudio, availableAudios]);

    // Clear all stream state when switching anime
    const clearStreams = useCallback(() => {
        activeLoadRequestRef.current += 1;
        setCurrentEpisode(null);
        setAllStreams([]);
        setStreams([]);
        setSelectedStreamIndex(0);
        setSelectedAudio('sub');
        setStreamLoading(false);
        streamCache.current.clear();
    }, []);

    // Invalidate cache for a specific episode so the next loadStream call fetches fresh.
    const bustEpisodeCache = useCallback((session: string) => {
        streamCache.current.delete(session);
        if (scraperSession) {
            animeService.invalidateStreamCache(scraperSession, session);
        }
    }, [scraperSession]);

    return {
        // State
        currentEpisode,
        streams,
        selectedStreamIndex,
        isAutoQuality,
        selectedAudio,
        availableAudios,
        showQualityMenu,
        currentStream,
        streamLoading,

        // Actions
        loadStream,
        prefetchStream,
        handleQualityChange,
        setAutoQuality,
        setShowQualityMenu,
        setSelectedAudio,
        tryNextStream,
        getMappedQuality,
        clearStreams,
        bustEpisodeCache,
    };
}
