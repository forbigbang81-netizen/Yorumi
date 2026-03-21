import { useState, useEffect, useRef } from 'react';
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
    
    // Watch time persistence
    const accumulatedSecondsRef = useRef(0);
    const lastTickRef = useRef(Date.now());

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

    // Save Progress
    useEffect(() => {
        if (selectedAnime && currentEpisode) {
            saveProgress(selectedAnime, currentEpisode);
            const episodeNumber = parseEpisodeNumber(currentEpisode.episodeNumber);
            if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
                markEpisodeComplete(episodeNumber);
            }
        }
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

    // Track real watch time while player is active and visible.
    useEffect(() => {
        if (!selectedAnime || !currentStream?.url) return;

        const primaryAnimeId = String(selectedAnime.mal_id || '');
        const secondaryAnimeId = String(selectedAnime.id || '');
        const targetAnimeIds = [primaryAnimeId, secondaryAnimeId].filter((id, index, arr) => id && arr.indexOf(id) === index);
        if (targetAnimeIds.length === 0) return;

        lastTickRef.current = Date.now();

        const isActiveWatching = () =>
            document.visibilityState === 'visible' && document.hasFocus();

        const flush = () => {
            const seconds = Math.floor(accumulatedSecondsRef.current);
            if (seconds > 0) {
                targetAnimeIds.forEach((id) => storage.addAnimeWatchTime(id, seconds));
                accumulatedSecondsRef.current = 0;
            }
        };

        const interval = window.setInterval(() => {
            const now = Date.now();
            let delta = (now - lastTickRef.current) / 1000;
            lastTickRef.current = now;

            // Cap delta to prevent massive jumps (e.g., from computer sleep/hibernate)
            if (delta > 2) delta = 1;

            if (isActiveWatching() && isPlayerReady) {
                accumulatedSecondsRef.current += delta;
            }

            if (accumulatedSecondsRef.current >= 15) {
                flush();
            }
        }, 1000);

        const handleBlur = () => flush();
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') {
                flush();
            }
            lastTickRef.current = Date.now();
        };
        const handleFocus = () => {
            lastTickRef.current = Date.now();
        };

        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearInterval(interval);
            flush();
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
        };
    }, [selectedAnime?.id, selectedAnime?.mal_id, currentStream?.url, isPlayerReady]);

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
        navigate // Expose navigate for back button
    };
}
