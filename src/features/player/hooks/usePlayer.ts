import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAnime } from '../../../hooks/useAnime';
import { useStreams } from '../../../hooks/useStreams';
import type { Anime, Episode } from '../../../types/anime';
import { storage } from '../../../utils/storage';

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
        loadStream
    } = streamsHook;

    // 3. UI State
    const [isExpanded, setIsExpanded] = useState(false);
    const epNumParam = searchParams.get('ep') || '1';

    // --- Effects ---

    // Clear streams on mount/id change
    useEffect(() => {
        clearStreams();
    }, [animeId]);

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
                // Find the episode with the highest number
                // episodes are typically sorted, but let's be safe
                // Assuming episodes are sorted desc or asc, usually we want the one with highest number
                // But typically the list from AniList/Jikan is sorted.
                // Let's just take the last one in the list if we assume chronological order, 
                // OR find the max episodeNumber.
                // Let's rely on the array order or a find max.
                // Safe bet: Parse numbers and find max.

                // Optimized: just grab the last one if available, or sort.
                // Let's sort to be safe.
                const sorted = [...episodes].sort((a, b) => parseFloat(a.episodeNumber) - parseFloat(b.episodeNumber));
                targetEp = sorted[sorted.length - 1];
            } else {
                targetEp = episodes.find(e => e.episodeNumber == epNumParam) || episodes[0];
            }

            if (targetEp) {
                // Update URL if we defaulted to a different episode or resolved 'latest'
                if (String(targetEp.episodeNumber) !== epNumParam) {
                    setSearchParams({ ep: String(targetEp.episodeNumber) }, { replace: true });
                }
                loadStream(targetEp);
            }
        }
    }, [episodes, epNumParam]);

    // Save Progress
    useEffect(() => {
        if (selectedAnime && currentEpisode) {
            saveProgress(selectedAnime, currentEpisode);
            markEpisodeComplete(parseFloat(currentEpisode.episodeNumber));
        }
    }, [selectedAnime, currentEpisode]);

    // Track real watch time while player is active and visible.
    useEffect(() => {
        if (!selectedAnime || !currentStream?.url) return;

        const animeId = String(selectedAnime.id || selectedAnime.mal_id || '');
        if (!animeId) return;

        let accumulatedSeconds = 0;
        let lastTick = Date.now();

        const isActiveWatching = () =>
            document.visibilityState === 'visible' && document.hasFocus();

        const flush = () => {
            const seconds = Math.floor(accumulatedSeconds);
            if (seconds > 0) {
                storage.addAnimeWatchTime(animeId, seconds);
                accumulatedSeconds = 0;
            }
        };

        const interval = window.setInterval(() => {
            const now = Date.now();
            const delta = (now - lastTick) / 1000;
            lastTick = now;

            if (isActiveWatching()) {
                accumulatedSeconds += delta;
            }

            if (accumulatedSeconds >= 15) {
                flush();
            }
        }, 1000);

        const handleBlur = () => flush();
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') {
                flush();
            }
            lastTick = Date.now();
        };
        const handleFocus = () => {
            lastTick = Date.now();
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
    }, [selectedAnime?.id, selectedAnime?.mal_id, currentStream?.url]);

    // --- Actions ---

    const handleEpisodeClick = (ep: Episode) => {
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
        epNum: epNumParam,
        cleanCurrentTitle,

        // Loading States
        epLoading,
        streamLoading,

        // UI State
        isExpanded,
        isAutoQuality,
        showQualityMenu,
        selectedStreamIndex,

        // Actions
        toggleExpand,
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
