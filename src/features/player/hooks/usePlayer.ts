import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAnime } from '../../../hooks/useAnime';
import { useStreams } from '../../../hooks/useStreams';
import type { Anime, Episode } from '../../../types/anime';
import { storage } from '../../../utils/storage';
import { animeService } from '../../../services/animeService';

export function usePlayer(animeId: string | undefined) {
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
        selectedStreamIndex,
        showQualityMenu,
        setShowQualityMenu,
        handleQualityChange,
        setAutoQuality,
        clearStreams,
        loadStream,
        prefetchStream
    } = streamsHook;

    // 3. UI State
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [hasSeenEpisodeFetchStart, setHasSeenEpisodeFetchStart] = useState(false);
    const [episodesResolved, setEpisodesResolved] = useState(false);
    const epNumParam = searchParams.get('ep') || '1';
    const resumeAtSeconds = (() => {
        const raw = searchParams.get('t');
        if (!raw) return 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    })();
    
    // Watch time persistence
    const accumulatedSecondsRef = useRef(0);
    const lastPlaybackSecondRef = useRef<number | null>(null);
    const lastDurationSecondRef = useRef(0);
    const lastSavedProgressRef = useRef<{ at: number; second: number }>({ at: 0, second: -1 });

    const parseEpisodeNumber = (value: unknown): number => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const raw = String(value ?? '').trim();
        const direct = Number(raw);
        if (Number.isFinite(direct)) return direct;
        const match = raw.match(/(\d+(?:\.\d+)?)/);
        return match ? Number(match[1]) : NaN;
    };

    // --- Effects ---

    // Clear streams on mount/id change
    useEffect(() => {
        clearStreams();
        setHasSeenEpisodeFetchStart(false);
        setEpisodesResolved(false);
        setIsPlayerReady(false);
        accumulatedSecondsRef.current = 0;
        lastPlaybackSecondRef.current = null;
        lastDurationSecondRef.current = 0;
        lastSavedProgressRef.current = { at: 0, second: -1 };
    }, [animeId]);

    useEffect(() => {
        const currentId = String(animeId || '');
        const animeMatch = selectedAnime &&
            (String(selectedAnime.id) === currentId || String(selectedAnime.mal_id) === currentId);
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
            const ids = isNaN(Number(animeId)) ? animeId : parseInt(animeId);
            handleAnimeClick({ mal_id: ids } as Anime);
        }
    }, [animeId, location.state, selectedAnime]);

    // Auto-load Episode
    useEffect(() => {
        // STRICT GUARD: Match URL ID with Context Anime ID
        // This prevents race condition where previous anime state triggers a load for the new page
        const currentId = String(animeId);
        const animeMatch = selectedAnime &&
            (String(selectedAnime.id) === currentId || String(selectedAnime.mal_id) === currentId);

        if (episodes.length > 0 && !currentStream && !streamLoading && animeMatch) {
            let targetEp: Episode | undefined;

            if (epNumParam === 'latest') {
                const sorted = [...episodes].sort((a, b) => parseFloat(a.episodeNumber) - parseFloat(b.episodeNumber));
                targetEp = sorted[sorted.length - 1];
            } else {
                targetEp = episodes.find(e => e.episodeNumber == epNumParam) || episodes[0];
            }

            if (targetEp) {
                const targetEpisodeNumber = parseEpisodeNumber(targetEp.episodeNumber);
                if (Number.isFinite(targetEpisodeNumber) && targetEpisodeNumber > 0) {
                    markEpisodeComplete(targetEpisodeNumber);
                }
                // Update URL if we defaulted to a different episode or resolved 'latest'
                if (String(targetEp.episodeNumber) !== epNumParam) {
                    setSearchParams({ ep: String(targetEp.episodeNumber) }, { replace: true });
                }
                loadStream(targetEp);
            }
        }
    }, [episodes, epNumParam, currentStream, streamLoading, selectedAnime?.id, selectedAnime?.mal_id, animeId]);

    // Episode-change bookkeeping.
    useEffect(() => {
        if (!selectedAnime || !currentEpisode) return;
        const episodeNumber = parseEpisodeNumber(currentEpisode.episodeNumber);
        if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
            markEpisodeComplete(episodeNumber);
        }
        lastPlaybackSecondRef.current = null;
        lastDurationSecondRef.current = 0;
        lastSavedProgressRef.current = { at: 0, second: -1 };
    }, [selectedAnime, currentEpisode]);

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

    const flushWatchTime = useCallback(() => {
        const seconds = Math.floor(accumulatedSecondsRef.current);
        if (seconds <= 0 || !selectedAnime) return;

        const primaryAnimeId = String(selectedAnime.mal_id || '');
        const secondaryAnimeId = String(selectedAnime.id || '');
        const targetAnimeIds = [primaryAnimeId, secondaryAnimeId]
            .filter((id, index, arr) => id && arr.indexOf(id) === index);

        targetAnimeIds.forEach((id) => storage.addAnimeWatchTime(id, seconds));
        accumulatedSecondsRef.current -= seconds;
    }, [selectedAnime?.mal_id, selectedAnime?.id]);

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

        if (lastPlaybackSecondRef.current !== null) {
            const delta = currentSecond - lastPlaybackSecondRef.current;
            if (delta > 0 && delta <= 15) {
                accumulatedSecondsRef.current += delta;
            }
        }
        lastPlaybackSecondRef.current = currentSecond;

        if (accumulatedSecondsRef.current >= 15 || progress.ended) {
            flushWatchTime();
        }

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
    }, [selectedAnime, currentEpisode, isPlayerReady, flushWatchTime, saveProgress]);

    // --- Actions ---

    const handleEpisodeClick = (ep: Episode) => {
        const episodeNumber = parseEpisodeNumber(ep.episodeNumber);
        if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
            markEpisodeComplete(episodeNumber);
        }
        setSearchParams({ ep: String(ep.episodeNumber) });
        loadStream(ep);
    };

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const reloadPlayer = () => {
        if (currentEpisode) {
            loadStream(currentEpisode);
        }
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
        resumeAtSeconds,
        cleanCurrentTitle,

        // Loading States
        epLoading,
        streamLoading,
        isPlayerReady,

        // UI State
        isExpanded,
        isAutoQuality,
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
        handlePlaybackProgress,
        navigate // Expose navigate for back button
    };
}
