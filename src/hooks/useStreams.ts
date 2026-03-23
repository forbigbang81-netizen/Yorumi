import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

import type { Episode } from '../types/anime';
import type { StreamLink } from '../types/stream';
import { getStreamData, getMappedQuality } from '../utils/streamUtils';

export function useStreams(scraperSession: string | null) {
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
    const [allStreams, setAllStreams] = useState<StreamLink[]>([]);
    const [streams, setStreams] = useState<StreamLink[]>([]);
    const [selectedStreamIndex, setSelectedStreamIndex] = useState<number>(0);
    const [isAutoQuality, setIsAutoQuality] = useState(true);
    const [selectedAudio, setSelectedAudio] = useState<'sub' | 'dub'>('sub');
    const [selectedProvider, setSelectedProvider] = useState<'vidsrc' | 'megacloud'>('megacloud');
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [streamLoading, setStreamLoading] = useState(false);
    const streamCache = useRef(new Map<string, Promise<StreamLink[]>>());

    const currentStream = streams[selectedStreamIndex] || null;

    const normalizeAudio = (value: string) => (String(value || '').toLowerCase() === 'dub' ? 'dub' : 'sub');
    const normalizeProvider = (value: string) => {
        const lower = String(value || '').toLowerCase();
        if (lower.includes('mega')) return 'megacloud';
        if (lower.includes('vidsrc') || lower.includes('vidstream')) return 'vidsrc';
        return '';
    };

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

    const availableProviders = useMemo(() => {
        const set = new Set<'vidsrc' | 'megacloud'>();
        allStreams
            .filter((s) => normalizeAudio(s.audio) === selectedAudio)
            .forEach((s) => {
                const provider = normalizeProvider(s.provider || s.server || s.url);
                if (provider === 'vidsrc' || provider === 'megacloud') set.add(provider);
            });
        if (set.size === 0) {
            allStreams.forEach((s) => {
                const provider = normalizeProvider(s.provider || s.server || s.url);
                if (provider === 'vidsrc' || provider === 'megacloud') set.add(provider);
            });
        }
        if (set.size === 0) set.add('megacloud');
        return [...set];
    }, [allStreams, selectedAudio]);

    const filterStreams = useCallback((raw: StreamLink[], audio: 'sub' | 'dub', provider: 'vidsrc' | 'megacloud') => {
        let next = raw.filter((s) => normalizeAudio(s.audio) === audio);
        if (next.length === 0) next = raw;

        const providerFiltered = next.filter((s) => normalizeProvider(s.provider || s.server || s.url) === provider);
        if (providerFiltered.length > 0) next = providerFiltered;

        return [...next].sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    }, []);

    useEffect(() => {
        if (allStreams.length === 0) {
            setStreams([]);
            return;
        }
        const nextStreams = filterStreams(allStreams, selectedAudio, selectedProvider);
        setStreams(nextStreams);
        setSelectedStreamIndex(0);
        setIsAutoQuality(true);
    }, [allStreams, selectedAudio, selectedProvider, filterStreams]);

    const loadStream = useCallback(async (episode: Episode) => {
        const isFirstLoadForAnime = currentEpisode === null;
        setCurrentEpisode(episode);
        setStreamLoading(true);
        setAllStreams([]);
        setStreams([]);

        try {
            const streamData = await ensureStreamData(episode);
            if (streamData.length > 0) {
                const nextAudio = streamData.some((s) => normalizeAudio(s.audio) === selectedAudio)
                    ? selectedAudio
                    : (streamData.some((s) => normalizeAudio(s.audio) === 'sub') ? 'sub' : 'dub');
                const audioScoped = streamData.filter((s) => normalizeAudio(s.audio) === nextAudio);
                const hasVidSrcForAudio = audioScoped.some((s) => normalizeProvider(s.provider || s.server || s.url) === 'vidsrc');
                const hasMegaCloudForAudio = audioScoped.some((s) => normalizeProvider(s.provider || s.server || s.url) === 'megacloud');
                const hasSelectedProviderForAudio = audioScoped.some((s) => normalizeProvider(s.provider || s.server || s.url) === selectedProvider);

                // First load defaults to MegaCloud if available because it is
                // generally more reliable for immediate autoplay in our embed flow.
                // Subsequent loads keep user's provider selection when possible.
                const nextProvider = isFirstLoadForAnime
                    ? (hasMegaCloudForAudio ? 'megacloud' : (hasVidSrcForAudio ? 'vidsrc' : selectedProvider))
                    : (hasSelectedProviderForAudio
                        ? selectedProvider
                        : (hasMegaCloudForAudio ? 'megacloud' : (hasVidSrcForAudio ? 'vidsrc' : selectedProvider)));

                setSelectedAudio(nextAudio);
                setSelectedProvider(nextProvider);
                setAllStreams(streamData);
                setSelectedStreamIndex(0);
                setIsAutoQuality(true);
            }
        } catch (e) {
            console.error('Failed to load stream', e);
        } finally {
            setStreamLoading(false);
        }
    }, [ensureStreamData, selectedAudio, selectedProvider, currentEpisode]);

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

        const alternateProvider: 'vidsrc' | 'megacloud' = selectedProvider === 'vidsrc' ? 'megacloud' : 'vidsrc';
        if (availableProviders.includes(alternateProvider)) {
            setSelectedProvider(alternateProvider);
            setSelectedStreamIndex(0);
            setIsAutoQuality(true);
            return true;
        }

        const alternateAudio: 'sub' | 'dub' = selectedAudio === 'sub' ? 'dub' : 'sub';
        if (availableAudios.includes(alternateAudio)) {
            setSelectedAudio(alternateAudio);
            setSelectedProvider('megacloud');
            setSelectedStreamIndex(0);
            setIsAutoQuality(true);
            return true;
        }

        return false;
    }, [streams.length, selectedStreamIndex, selectedProvider, availableProviders, selectedAudio, availableAudios]);

    // Clear all stream state when switching anime
    const clearStreams = useCallback(() => {
        setCurrentEpisode(null);
        setAllStreams([]);
        setStreams([]);
        setSelectedStreamIndex(0);
        setSelectedAudio('sub');
        setSelectedProvider('megacloud');
        setStreamLoading(false);
        streamCache.current.clear();
    }, []);

    return {
        // State
        currentEpisode,
        streams,
        selectedStreamIndex,
        isAutoQuality,
        selectedAudio,
        selectedProvider,
        availableAudios,
        availableProviders,
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
        setSelectedProvider,
        tryNextStream,
        getMappedQuality,
        clearStreams,
    };
}
