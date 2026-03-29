import { useCallback, useEffect, useMemo, useState } from 'react';
import { animeService } from '../services/animeService';
import { mangaService } from '../services/mangaService';
import { useAuth } from '../context/AuthContext';
import { useWatchList } from './useWatchList';
import { useReadList } from './useReadList';
import { useContinueReading } from './useContinueReading';
import { storage, type WatchListItem } from '../utils/storage';
import type { Anime } from '../types/anime';
import type { Manga, MangaChapter } from '../types/manga';

export interface EpisodeNotification {
    id: string;
    mediaType: 'anime' | 'manga';
    mediaId: string;
    title: string;
    image: string;
    availableNumber: number;
}

const NOTIFICATION_READ_PREFIX = 'yorumi_episode_notifications_read';

const getReadStorageKey = (uid?: string | null) =>
    uid ? `${NOTIFICATION_READ_PREFIX}:${uid}` : NOTIFICATION_READ_PREFIX;

const readNotificationState = (uid?: string | null): Record<string, boolean> => {
    try {
        const raw = localStorage.getItem(getReadStorageKey(uid));
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const writeNotificationState = (uid: string | null | undefined, value: Record<string, boolean>) => {
    try {
        localStorage.setItem(getReadStorageKey(uid), JSON.stringify(value));
    } catch {
        // Ignore storage errors.
    }
};

const getWatchCandidateId = (item: WatchListItem) => {
    const raw = String(item.id || '').trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    return raw || null;
};

const getAvailableEpisode = (anime: Anime) => {
    const latest = Number(anime.latestEpisode || 0);
    const nextAiring = Number(anime.nextAiringEpisode?.episode || 0);
    if (latest > 0) return latest;
    if (nextAiring > 1) return nextAiring - 1;
    return 0;
};

const getWatchedEpisodeMax = (anime: Anime, item: WatchListItem) => {
    const candidateIds = new Set<string>();
    [item.id, anime.id, anime.mal_id].forEach((value) => {
        const normalized = String(value || '').trim();
        if (normalized) candidateIds.add(normalized);
    });

    let maxWatched = Number(item.currentProgress || 0);
    candidateIds.forEach((id) => {
        const watched = storage.getWatchedEpisodes(id);
        watched.forEach((episode) => {
            if (Number.isFinite(episode) && episode > maxWatched) {
                maxWatched = episode;
            }
        });
    });
    return maxWatched;
};

export function useEpisodeNotifications() {
    const { user } = useAuth();
    const { watchList, loading } = useWatchList();
    const { readList, loading: readListLoading } = useReadList();
    const { continueReadingList } = useContinueReading();
    const [notifications, setNotifications] = useState<EpisodeNotification[]>([]);
    const [readState, setReadState] = useState<Record<string, boolean>>(() => readNotificationState(user?.uid));

    useEffect(() => {
        setReadState(readNotificationState(user?.uid));
    }, [user?.uid]);

    useEffect(() => {
        let cancelled = false;

        const parseChapterNumber = (value: unknown) => {
            const raw = String(value ?? '').trim();
            const direct = Number(raw);
            if (Number.isFinite(direct)) return direct;
            const match = raw.match(/(\d+(?:\.\d+)?)/);
            return match ? Number(match[1]) : 0;
        };

        const loadNotifications = async () => {
            if (!user || loading || readListLoading) {
                if (!cancelled) setNotifications([]);
                return;
            }

            const animeCandidates = watchList.slice(0, 20);
            const animeResolved = await Promise.all(
                animeCandidates.map(async (item) => {
                    const id = getWatchCandidateId(item);
                    if (!id) return null;

                    try {
                        const cached = animeService.peekAnimeDetailsCache(id);
                        const details = cached || await animeService.getAnimeDetails(id);
                        const anime = details?.data as Anime | null;
                        if (!anime) return null;

                        const availableEpisode = getAvailableEpisode(anime);
                        const watchedEpisode = getWatchedEpisodeMax(anime, item);
                        const isCurrentlyAiring =
                            String(anime.status || '').toUpperCase().includes('AIRING') ||
                            Number(anime.nextAiringEpisode?.episode || 0) > 0;

                        if (!isCurrentlyAiring || availableEpisode <= 0 || availableEpisode <= watchedEpisode) {
                            return null;
                        }

                        return {
                            id: `${String(anime.id || anime.mal_id)}:${availableEpisode}`,
                            mediaType: 'anime',
                            mediaId: String(anime.id || anime.mal_id || item.id),
                            title: anime.title || item.title,
                            image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || item.image,
                            availableNumber: availableEpisode,
                        } satisfies EpisodeNotification;
                    } catch {
                        return null;
                    }
                })
            );

            const continueReadingMap = new Map<string, number>();
            continueReadingList.forEach((item) => {
                const current = continueReadingMap.get(item.mangaId) || 0;
                const next = parseChapterNumber(item.chapterNumber);
                if (next > current) {
                    continueReadingMap.set(item.mangaId, next);
                }
            });

            const mangaResolved = await Promise.all(
                readList.slice(0, 20).map(async (item) => {
                    const id = String(item.id || '').trim();
                    if (!id) return null;

                    try {
                        const details = await mangaService.getUnifiedMangaDetails(id);
                        const manga = details as Manga | null;
                        if (!manga) return null;

                        const chaptersPayload = await mangaService.getChapters(String(manga.id || manga.mal_id || id)).catch(() => null);
                        const chapters = Array.isArray(chaptersPayload?.chapters) ? chaptersPayload.chapters as MangaChapter[] : [];
                        const availableChapter = chapters.length > 0
                            ? chapters.reduce((max, chapter) => Math.max(max, parseChapterNumber(chapter.title)), 0)
                            : Number(manga.chapters || item.totalCount || 0);
                        const readChapter = Math.max(
                            Number(item.currentProgress || 0),
                            continueReadingMap.get(id) || 0,
                            continueReadingMap.get(String(manga.id || '')) || 0,
                            continueReadingMap.get(String(manga.mal_id || '')) || 0
                        );

                        if (availableChapter <= 0 || availableChapter <= readChapter) {
                            return null;
                        }

                        return {
                            id: `manga:${String(manga.id || manga.mal_id || id)}:${availableChapter}`,
                            mediaType: 'manga',
                            mediaId: String(manga.id || manga.mal_id || id),
                            title: manga.title || item.title,
                            image: manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url || item.image,
                            availableNumber: availableChapter,
                        } satisfies EpisodeNotification;
                    } catch {
                        return null;
                    }
                })
            );

            if (cancelled) return;

            const nextNotifications = [...animeResolved, ...mangaResolved]
                .filter((item): item is EpisodeNotification => Boolean(item))
                .sort((a, b) => b.availableNumber - a.availableNumber);

            setNotifications(nextNotifications);
        };

        loadNotifications().catch(() => undefined);

        const handleStorageUpdate = () => loadNotifications().catch(() => undefined);
        window.addEventListener('yorumi-storage-updated', handleStorageUpdate);
        return () => {
            cancelled = true;
            window.removeEventListener('yorumi-storage-updated', handleStorageUpdate);
        };
    }, [user, watchList, loading, readList, readListLoading, continueReadingList]);

    const markAsRead = useCallback((id: string) => {
        setReadState((current) => {
            const next = { ...current, [id]: true };
            writeNotificationState(user?.uid, next);
            return next;
        });
    }, [user?.uid]);

    const markAllRead = useCallback(() => {
        setReadState((current) => {
            const next = { ...current };
            notifications.forEach((notification) => {
                next[notification.id] = true;
            });
            writeNotificationState(user?.uid, next);
            return next;
        });
    }, [notifications, user?.uid]);

    const unreadNotifications = useMemo(
        () => notifications.filter((notification) => !readState[notification.id]),
        [notifications, readState]
    );

    const unreadCount = unreadNotifications.length;

    return {
        notifications: unreadNotifications,
        unreadCount,
        isRead: (id: string) => Boolean(readState[id]),
        markAsRead,
        markAllRead,
    };
}
