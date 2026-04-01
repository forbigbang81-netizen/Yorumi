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
    const [selectedProvider, setSelectedProvider] = useState<'vidsrc' | 'megacloud'>('vidsrc');
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
    const normalizeProvider = (value: string) => {
        const lower = String(value || '').toLowerCase();
        if (lower.includes('mega')) return 'megacloud';
        if (lower.includes('vidsrc') || lower.includes('vidstream')) return 'vidsrc';
        return '';
    };
    const scoreStream = useCallback((stream: StreamLink, preferredProvider?: 'vidsrc' | 'megacloud') => {
        const quality = parseInt(String(stream.quality || '0'), 10) || 0;
        const provider = normalizeProvider(stream.provider || stream.server || stream.url);
        const url = String(stream.url || '');
        const directUrl = String(stream.directUrl || '');
        const hasDirectUrl = Boolean(directUrl);
        const isHls = Boolean(stream.isHls) || url.includes('.m3u8') || directUrl.includes('.m3u8');
        const isIframeLike = /vidsrc|vidstream|megacloud|embed/i.test(url) && !hasDirectUrl && !isHls;

        return (isHls ? 1_000_000 : 0)
            + (hasDirectUrl ? 100_000 : 0)
            + (provider && provider === preferredProvider ? 1_000 : 0)
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

        const sorted = [...next].sort((a, b) => scoreStream(b, provider) - scoreStream(a, provider));
        const dedupedByQuality = new Map<string, StreamLink>();

        sorted.forEach((stream) => {
            const qualityKey = getMappedQuality(String(stream.quality || '0'));
            if (!dedupedByQuality.has(qualityKey)) {
                dedupedByQuality.set(qualityKey, stream);
            }
        });

        return Array.from(dedupedByQuality.values());
    }, [scoreStream]);

    const pickBestProvider = useCallback(
        (raw: StreamLink[], audio: 'sub' | 'dub', preferred: 'vidsrc' | 'megacloud') => {
            const scoped = raw.filter((s) => normalizeAudio(s.audio) === audio);
            const pool = scoped.length > 0 ? scoped : raw;
            const providers: Array<'vidsrc' | 'megacloud'> = ['vidsrc', 'megacloud'];

            const scoreProvider = (provider: 'vidsrc' | 'megacloud') => {
                const p = pool.filter((s) => normalizeProvider(s.provider || s.server || s.url) === provider);
                if (p.length === 0) return -1;
                const hasHls = p.some((s) => Boolean(s.isHls) || String(s.url || '').includes('.m3u8'));
                const maxScore = p.reduce((mx, s) => Math.max(mx, scoreStream(s, provider)), 0);
                return maxScore + (hasHls ? 100000 : 0) + (provider === preferred ? 5 : 0);
            };

            const ranked = providers
                .map((provider) => ({ provider, score: scoreProvider(provider) }))
                .sort((a, b) => b.score - a.score);

            return ranked[0]?.score >= 0 ? ranked[0].provider : preferred;
        },
        [scoreStream]
    );

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
        const requestId = activeLoadRequestRef.current + 1;
        activeLoadRequestRef.current = requestId;
        setCurrentEpisode(episode);
        setStreamLoading(true);
        setAllStreams([]);
        setStreams([]);

        try {
            const streamData = await ensureStreamData(episode);
            if (activeLoadRequestRef.current !== requestId) {
                return;
            }
            if (streamData.length > 0) {
                const nextAudio = streamData.some((s) => normalizeAudio(s.audio) === selectedAudio)
                    ? selectedAudio
                    : (streamData.some((s) => normalizeAudio(s.audio) === 'sub') ? 'sub' : 'dub');
                const audioScoped = streamData.filter((s) => normalizeAudio(s.audio) === nextAudio);
                const hasSelectedProviderForAudio = audioScoped.some((s) => normalizeProvider(s.provider || s.server || s.url) === selectedProvider);
                const selectedProviderHasHls = audioScoped.some((s) => {
                    const provider = normalizeProvider(s.provider || s.server || s.url);
                    if (provider !== selectedProvider) return false;
                    return Boolean(s.isHls) || String(s.url || '').includes('.m3u8');
                });
                const bestProvider = pickBestProvider(streamData, nextAudio, selectedProvider);
                const nextProvider = !hasSelectedProviderForAudio
                    ? bestProvider
                    : (!selectedProviderHasHls ? bestProvider : selectedProvider);

                setSelectedAudio(nextAudio);
                setSelectedProvider(nextProvider);
                setAllStreams(streamData);
                setSelectedStreamIndex(0);
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
    }, [ensureStreamData, selectedAudio, selectedProvider, pickBestProvider]);

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
            setSelectedProvider('vidsrc');
            setSelectedStreamIndex(0);
            setIsAutoQuality(true);
            return true;
        }

        return false;
    }, [streams.length, selectedStreamIndex, selectedProvider, availableProviders, selectedAudio, availableAudios]);

    // Clear all stream state when switching anime
    const clearStreams = useCallback(() => {
        activeLoadRequestRef.current += 1;
        setCurrentEpisode(null);
        setAllStreams([]);
        setStreams([]);
        setSelectedStreamIndex(0);
        setSelectedAudio('sub');
        setSelectedProvider('vidsrc');
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
