import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAnime } from '../../../hooks/useAnime';
import { useStreams } from '../../../hooks/useStreams';
import type { Anime, Episode } from '../../../types/anime';
import { storage } from '../../../utils/storage';
import { animeService } from '../../../services/animeService';

export function usePlayer(animeId: string | undefined, animeSlugTitle?: string) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();

    // 1. Anime Data
    const animeHook = useAnime();
    const {
        selectedAnime,
        episodes,
        epLoading,
        scraperSession,
        error,
        saveProgress,
        watchedEpisodes,
        markEpisodeComplete,
        handleAnimeClick
    } = animeHook;

    // 2. Stream Data
    const streamsHook = useStreams(scraperSession);
    const {
        currentStream,
        streamLoading,
        currentEpisode,
        streams,
        isAutoQuality,
        selectedAudio,
        availableAudios,
        selectedStreamIndex,
        showQualityMenu,
        setShowQualityMenu,
        handleQualityChange: applyQualityChange,
        setAutoQuality: applyAutoQuality,
        setSelectedAudio: applySelectedAudio,
        tryNextStream,
        clearStreams,
        loadStream,
        bustEpisodeCache,
        prefetchStream
    } = streamsHook;

    // 3. UI State
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [hasSeenEpisodeFetchStart, setHasSeenEpisodeFetchStart] = useState(false);
    const [episodesResolved, setEpisodesResolved] = useState(false);
    const [streamExhausted, setStreamExhausted] = useState(false);
    const [startAtOverrideSeconds, setStartAtOverrideSeconds] = useState<number | null>(null);
    const epNumParam = searchParams.get('ep') || '1';
    const resumeAtSeconds = (() => {
        const raw = searchParams.get('t');
        if (!raw) return 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    })();
    
    // Watch time persistence
    const watchSessionStartedAtRef = useRef<number | null>(null);
    const lastPlaybackSecondRef = useRef<number | null>(null);
    const lastDurationSecondRef = useRef(0);
    const lastSavedProgressRef = useRef<{ at: number; second: number }>({ at: 0, second: -1 });
    const streamErrorRetryRef = useRef<{ url: string; at: number }>({ url: '', at: 0 });
    const autoLoadAttemptKeyRef = useRef<string>('');
    const extractAnimePaheSession = (value: unknown): string => {
        const raw = String(value || '').trim();
        const normalized = raw.startsWith('s:') ? raw.slice(2) : raw;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
            ? normalized
            : '';
    };

    const parseEpisodeNumber = (value: unknown): number => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const raw = String(value ?? '').trim();
        const direct = Number(raw);
        if (Number.isFinite(direct)) return direct;
        const match = raw.match(/(\d+(?:\.\d+)?)/);
        return match ? Number(match[1]) : NaN;
    };
    const decodeSlugTitle = (slug?: string) =>
        String(slug || '')
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    // --- Effects ---

    // Clear streams on mount/id change
    useEffect(() => {
        clearStreams();
        setHasSeenEpisodeFetchStart(false);
        setEpisodesResolved(false);
        setIsPlayerReady(false);
        setStreamExhausted(false);
        setStartAtOverrideSeconds(null);
        watchSessionStartedAtRef.current = null;
        lastPlaybackSecondRef.current = null;
        lastDurationSecondRef.current = 0;
        lastSavedProgressRef.current = { at: 0, second: -1 };
        autoLoadAttemptKeyRef.current = '';
    }, [animeId]);

    useEffect(() => {
        autoLoadAttemptKeyRef.current = '';
    }, [scraperSession]);

    useEffect(() => {
        const currentId = String(animeId || '');
        const currentSession = extractAnimePaheSession(currentId);
        const animeMatch = selectedAnime &&
            (
                String(selectedAnime.id) === currentId ||
                String(selectedAnime.mal_id) === currentId ||
                (!!currentSession && extractAnimePaheSession(selectedAnime.scraperId) === currentSession)
            );
        if (!animeMatch) return;

        if (epLoading) {
            setHasSeenEpisodeFetchStart(true);
            return;
        }

        if (episodes.length > 0 || hasSeenEpisodeFetchStart) {
            setEpisodesResolved(true);
        }
    }, [animeId, selectedAnime?.id, selectedAnime?.mal_id, epLoading, episodes.length, hasSeenEpisodeFetchStart]);

    // Fetch Anime if missing
    useEffect(() => {
        // Prevent re-fetching if we already have the correct anime loaded
        if (selectedAnime && (String(selectedAnime.id) === String(animeId) || String(selectedAnime.mal_id) === String(animeId))) {
            return;
        }

        if (location.state?.anime) {
            handleAnimeClick(location.state.anime);
        } else if (animeId) {
            const animePaheSession = extractAnimePaheSession(animeId);
            const ids = isNaN(Number(animeId)) ? animeId : parseInt(animeId);
            const fallbackTitle = decodeSlugTitle(animeSlugTitle);
            handleAnimeClick({
                mal_id: typeof ids === 'number' ? ids : 0,
                id: typeof ids === 'number' ? ids : undefined,
                scraperId: animePaheSession || undefined,
                title: fallbackTitle || String(animeId),
            } as Anime);
        }
    }, [animeId, animeSlugTitle, location.state, selectedAnime]);

    // Auto-load Episode
    useEffect(() => {
        // STRICT GUARD: Match URL ID with Context Anime ID
        // This prevents race condition where previous anime state triggers a load for the new page
        const currentId = String(animeId);
        const currentSession = extractAnimePaheSession(currentId);
        const animeMatch = selectedAnime &&
            (
                String(selectedAnime.id) === currentId ||
                String(selectedAnime.mal_id) === currentId ||
                (!!currentSession && extractAnimePaheSession(selectedAnime.scraperId) === currentSession)
            );

        if (!scraperSession) return;

        if (episodes.length > 0 && !currentStream && !streamLoading && animeMatch) {
            let targetEp: Episode | undefined;

            if (epNumParam === 'latest') {
                const sorted = [...episodes].sort((a, b) => parseFloat(a.episodeNumber) - parseFloat(b.episodeNumber));
                targetEp = sorted[sorted.length - 1];
            } else {
                targetEp = episodes.find(e => e.episodeNumber == epNumParam) || episodes[0];
            }

            if (targetEp) {
                const attemptKey = `${String(animeId || '')}:${String(targetEp.session || targetEp.episodeNumber || '')}`;
                if (autoLoadAttemptKeyRef.current === attemptKey) {
                    return;
                }
                autoLoadAttemptKeyRef.current = attemptKey;

                const targetEpisodeNumber = parseEpisodeNumber(targetEp.episodeNumber);
                if (Number.isFinite(targetEpisodeNumber) && targetEpisodeNumber > 0) {
                    markEpisodeComplete(targetEpisodeNumber);
                }
                // Update URL if we defaulted to a different episode or resolved 'latest'
                if (String(targetEp.episodeNumber) !== epNumParam) {
                    setSearchParams({ ep: String(targetEp.episodeNumber) }, { replace: true });
                }
                setIsPlayerReady(false);
                loadStream(targetEp);
            }
        }
    }, [episodes, epNumParam, currentStream, streamLoading, selectedAnime?.id, selectedAnime?.mal_id, animeId, scraperSession]);

    // Episode-change bookkeeping.
    useEffect(() => {
        if (!selectedAnime || !currentEpisode) return;
        const episodeNumber = parseEpisodeNumber(currentEpisode.episodeNumber);
        if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
            markEpisodeComplete(episodeNumber);
        }
        saveProgress(selectedAnime, currentEpisode, {
            positionSeconds: Math.max(0, Math.floor(startAtOverrideSeconds ?? resumeAtSeconds ?? 0)),
            durationSeconds: Math.max(0, Math.floor(lastDurationSecondRef.current || 0))
        });
        lastSavedProgressRef.current = {
            at: Date.now(),
            second: Math.max(0, Math.floor(startAtOverrideSeconds ?? resumeAtSeconds ?? 0))
        };
        lastPlaybackSecondRef.current = null;
        lastDurationSecondRef.current = 0;
    }, [selectedAnime, currentEpisode, saveProgress, startAtOverrideSeconds, resumeAtSeconds]);

    // Prewarm adjacent episode streams to make next/prev nearly instant.
    useEffect(() => {
        if (!currentEpisode || episodes.length === 0) return;
        if (!scraperSession) return;

        const currentNum = parseFloat(currentEpisode.episodeNumber);
        if (!Number.isFinite(currentNum)) return;

        const adjacent = episodes.filter((ep) => {
            const n = parseFloat(ep.episodeNumber);
            if (!Number.isFinite(n)) return false;
            return n === currentNum + 1 || n === currentNum - 1 || n === currentNum + 2;
        });

        adjacent.forEach((ep) => prefetchStream(ep));
        animeService.prefetchStreams(
            scraperSession,
            adjacent.map((ep) => ep.session)
        );
    }, [currentEpisode?.session, episodes, prefetchStream, scraperSession]);

    // When loading finishes with no stream result → immediately show exhausted (no retry loop).
    useEffect(() => {
        if (!currentEpisode || currentStream || streamLoading) return;
        if (String(currentEpisode.episodeNumber) !== String(epNumParam)) return;
        setStreamExhausted(true);
    }, [currentEpisode, currentStream, streamLoading, epNumParam]);

    const flushWatchTime = useCallback(() => {
        if (!selectedAnime) return;

        const startedAt = watchSessionStartedAtRef.current;
        if (!startedAt) return;

        const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        if (seconds <= 0 || !selectedAnime) return;

        const primaryAnimeId = String(selectedAnime.mal_id || selectedAnime.id || '');
        if (primaryAnimeId) {
            storage.addAnimeWatchTime(primaryAnimeId, seconds);
        }
        storage.addAnimeWatchTimeTotal(seconds);
        watchSessionStartedAtRef.current = null;
    }, [selectedAnime?.mal_id, selectedAnime?.id]);

    useEffect(() => {
        if (!isPlayerReady || !selectedAnime || !currentEpisode) {
            flushWatchTime();
            return;
        }

        if (!watchSessionStartedAtRef.current) {
            watchSessionStartedAtRef.current = Date.now();
        }
    }, [isPlayerReady, selectedAnime, currentEpisode?.session, flushWatchTime]);

    const persistLatestProgress = useCallback(() => {
        if (!selectedAnime || !currentEpisode) return;
        if (lastPlaybackSecondRef.current === null) return;
        const second = Math.max(0, Math.floor(lastPlaybackSecondRef.current));
        if (second <= 0 && lastDurationSecondRef.current <= 0) return;

        saveProgress(selectedAnime, currentEpisode, {
            positionSeconds: second,
            durationSeconds: Math.max(0, Math.floor(lastDurationSecondRef.current || 0))
        });
        lastSavedProgressRef.current = { at: Date.now(), second };
    }, [selectedAnime, currentEpisode, saveProgress]);

    const resetEpisodePlaybackState = useCallback((keepResumeFromCurrent = false) => {
        const second = Math.max(0, Math.floor(lastPlaybackSecondRef.current || 0));
        setStartAtOverrideSeconds(keepResumeFromCurrent && second > 0 ? second : null);
        setIsPlayerReady(false);
        setStreamExhausted(false);
        streamErrorRetryRef.current = { url: '', at: 0 };
        lastPlaybackSecondRef.current = keepResumeFromCurrent ? lastPlaybackSecondRef.current : null;
        lastDurationSecondRef.current = keepResumeFromCurrent ? lastDurationSecondRef.current : 0;
    }, []);

    // Flush watch-time when stream/episode changes or unmounting.
    useEffect(() => {
        return () => {
            persistLatestProgress();
            flushWatchTime();
        };
    }, [currentStream?.url, currentEpisode?.session, persistLatestProgress, flushWatchTime]);

    useEffect(() => {
        const handlePageHide = () => {
            persistLatestProgress();
            flushWatchTime();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                persistLatestProgress();
                flushWatchTime();
            }
        };
        window.addEventListener('pagehide', handlePageHide);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [persistLatestProgress, flushWatchTime]);

    const handlePlaybackProgress = useCallback((progress: { currentTime: number; duration: number; ended?: boolean }) => {
        if (!selectedAnime || !currentEpisode || !isPlayerReady) return;

        const currentSecond = Number.isFinite(progress.currentTime) ? Math.max(0, Math.floor(progress.currentTime)) : 0;
        const durationSeconds = Number.isFinite(progress.duration) ? Math.max(0, Math.floor(progress.duration)) : 0;
        lastDurationSecondRef.current = durationSeconds;
        lastPlaybackSecondRef.current = currentSecond;

        const now = Date.now();
        const shouldSave = progress.ended || (
            now - lastSavedProgressRef.current.at >= 8000
            && Math.abs(currentSecond - lastSavedProgressRef.current.second) >= 2
        );
        if (!shouldSave) return;

        saveProgress(selectedAnime, currentEpisode, {
            positionSeconds: currentSecond,
            durationSeconds
        });
        lastSavedProgressRef.current = { at: now, second: currentSecond };
    }, [selectedAnime, currentEpisode, isPlayerReady, saveProgress]);

    const handleStreamError = useCallback(() => {
        const url = String(currentStream?.url || '');
        const now = Date.now();
        if (url && streamErrorRetryRef.current.url === url && now - streamErrorRetryRef.current.at < 1200) {
            return;
        }
        streamErrorRetryRef.current = { url, at: now };
        const second = Math.max(0, Math.floor(lastPlaybackSecondRef.current || 0));
        if (second > 0) setStartAtOverrideSeconds(second);
        tryNextStream();
    }, [currentStream?.url, tryNextStream]);

    // --- Actions ---

    const handleEpisodeClick = (ep: Episode) => {
        persistLatestProgress();
        autoLoadAttemptKeyRef.current = '';
        const episodeNumber = parseEpisodeNumber(ep.episodeNumber);
        if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
            markEpisodeComplete(episodeNumber);
        }
        bustEpisodeCache(ep.session);
        resetEpisodePlaybackState(false);
        setSearchParams({ ep: String(ep.episodeNumber) });
        loadStream(ep);
    };

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const reloadPlayer = () => {
        if (currentEpisode) {
            autoLoadAttemptKeyRef.current = '';
            bustEpisodeCache(currentEpisode.session);
            resetEpisodePlaybackState(true);
            loadStream(currentEpisode);
        }
    };

    const handleQualityChange = (index: number) => {
        resetEpisodePlaybackState(true);
        applyQualityChange(index);
    };

    const setAutoQuality = () => {
        resetEpisodePlaybackState(true);
        applyAutoQuality();
    };

    const setSelectedAudio = (audio: 'sub' | 'dub') => {
        autoLoadAttemptKeyRef.current = '';
        resetEpisodePlaybackState(true);
        applySelectedAudio(audio);
    };

    const handlePrevEp = () => {
        const targetNum = parseInt(epNumParam) - 1;
        const target = episodes.find(e => parseInt(e.episodeNumber) === targetNum);
        if (target) handleEpisodeClick(target);
    };

    const handleNextEp = () => {
        const targetNum = parseInt(epNumParam) + 1;
        const target = episodes.find(e => parseInt(e.episodeNumber) === targetNum);
        if (target) handleEpisodeClick(target);
    };

    // Derived State
    const currentEpTitle = episodes.find(e => e.episodeNumber == epNumParam)?.title;
    const cleanCurrentTitle = currentEpTitle && currentEpTitle.trim().toLowerCase() !== 'untitled' ? currentEpTitle : null;

    return {
        // Data
        anime: selectedAnime,
        episodes,
        currentEpisode,
        currentStream,
        streams,
        error,
        watchedEpisodes,
        episodesResolved,
        epNum: epNumParam,
        resumeAtSeconds: startAtOverrideSeconds ?? resumeAtSeconds,
        cleanCurrentTitle,

        // Loading States
        epLoading,
        streamLoading,
        isPlayerReady,
        streamExhausted,

        // UI State
        isExpanded,
        isAutoQuality,
        selectedAudio,
        availableAudios,
        showQualityMenu,
        selectedStreamIndex,

        // Actions
        toggleExpand,
        setIsPlayerReady,
        reloadPlayer,
        handlePrevEp,
        handleNextEp,
        handleEpisodeClick,
        setShowQualityMenu,
        handleQualityChange,
        setAutoQuality,
        setSelectedAudio,
        handlePlaybackProgress,
        handleStreamError,
        navigate // Expose navigate for back button
    };
}
