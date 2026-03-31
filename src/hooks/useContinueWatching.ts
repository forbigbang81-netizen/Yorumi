import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage, type WatchProgress } from '../utils/storage';
import { useActivityHistory } from './useActivityHistory';
import type { Anime, Episode } from '../types/anime';

interface PlaybackProgress {
    positionSeconds?: number;
    durationSeconds?: number;
}

export function useContinueWatching() {
    const { user } = useAuth();
    const { recordActivity } = useActivityHistory();
    const [continueWatchingList, setContinueWatchingList] = useState<WatchProgress[]>([]);

    const reload = useCallback(() => {
        setContinueWatchingList(storage.getContinueWatching());
    }, []);

    useEffect(() => {
        if (!user) {
            setContinueWatchingList([]);
            return;
        }

        // Initial load
        reload();

        // Re-render whenever storage mutates
        window.addEventListener('yorumi-storage-updated', reload);
        return () => window.removeEventListener('yorumi-storage-updated', reload);
    }, [user, reload]);

    const saveProgress = useCallback(async (anime: Anime, episode: Episode, playback?: PlaybackProgress) => {
        if (!user) return;

        const image = anime.anilist_banner_image || anime.images.jpg.large_image_url;
        const poster = anime.images.jpg.image_url || anime.images.jpg.large_image_url;

        const parseEpisodeNumber = (value: unknown): number => {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            const raw = String(value ?? '').trim();
            const direct = Number(raw);
            if (Number.isFinite(direct)) return direct;
            const match = raw.match(/(\d+(?:\.\d+)?)/);
            return match ? Number(match[1]) : 0;
        };

        const validId = anime.mal_id || anime.id;
        if (!validId) return;

        const normalizedPosition = Number.isFinite(playback?.positionSeconds)
            ? Math.max(0, Math.floor(Number(playback?.positionSeconds)))
            : undefined;
        const normalizedDuration = Number.isFinite(playback?.durationSeconds)
            ? Math.max(0, Math.floor(Number(playback?.durationSeconds)))
            : undefined;

        const progress: WatchProgress = {
            animeId: validId.toString(),
            episodeId: episode.session || (episode as any).id || '',
            episodeNumber: parseEpisodeNumber(episode.episodeNumber),
            timestamp: Date.now(),
            lastWatched: Date.now(),
            animeTitle: anime.title,
            animeImage: image,
            animePoster: poster,
            totalCount: typeof anime.episodes === 'number' && anime.episodes > 0 ? anime.episodes : undefined,
            mediaStatus: anime.status,
            positionSeconds: normalizedPosition,
            durationSeconds: normalizedDuration
        };

        // storage.saveProgress syncs to the cloud document field automatically
        storage.saveProgress(progress);

        try {
            await recordActivity(`anime:${validId}:ep:${progress.episodeNumber}`);
        } catch (error) {
            console.error('Failed to record activity:', error);
        }
    }, [user, recordActivity]);

    const removeFromHistory = useCallback(async (malId: number | string) => {
        if (!user) return;
        storage.removeFromContinueWatching(malId.toString());
    }, [user]);

    return {
        continueWatchingList,
        saveProgress,
        removeFromHistory
    };
}
