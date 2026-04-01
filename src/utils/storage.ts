import { doc, setDoc, getDoc, increment } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export interface WatchProgress {
    animeId: string;
    episodeId: string;
    episodeNumber: number;
    timestamp: number;
    lastWatched: number;
    animeTitle: string;
    animeImage: string;
    animePoster?: string;
    totalCount?: number;
    mediaStatus?: string;
    positionSeconds?: number;
    durationSeconds?: number;
}

export interface ReadProgress {
    mangaId: string;
    chapterId: string;
    chapterNumber: string; // Chapters can be 10.5
    timestamp: number;
    lastRead: number;
    mangaTitle: string;
    mangaImage: string;
    mangaPoster?: string;
    totalCount?: number;
    mediaStatus?: string;
}

export interface AnimeCompletionSnapshot {
    title?: string;
    totalCount?: number;
    mediaStatus?: string;
}

export interface MangaCompletionSnapshot {
    title?: string;
    totalCount?: number;
    mediaStatus?: string;
}

export interface WatchListItem {
    id: string;
    anilistId?: string;
    malId?: string;
    scraperId?: string;
    title: string;
    image: string;
    addedAt: number;
    status: 'watching' | 'completed' | 'plan_to_watch';
    score?: number;
    currentProgress?: number;
    totalCount?: number; // Episodes
    type?: string;
    genres?: string[];
    mediaStatus?: string;
    synopsis?: string;
}

export interface ReadListItem {
    id: string;
    title: string;
    image: string;
    addedAt: number;
    status: 'reading' | 'completed' | 'plan_to_read';
    score?: number;
    currentProgress?: number;
    totalCount?: number; // Chapters
    type?: string;
    genres?: string[];
    mediaStatus?: string;
    synopsis?: string;
}

const STORAGE_KEYS = {
    CONTINUE_WATCHING: 'yorumi_continue_watching',
    CONTINUE_READING: 'yorumi_continue_reading',
    WATCH_LIST: 'yorumi_watch_list',
    READ_LIST: 'yorumi_read_list',
    EPISODE_HISTORY: 'yorumi_episode_history',
    CHAPTER_HISTORY: 'yorumi_chapter_history',
    ANIME_WATCH_TIME: 'yorumi_anime_watch_time',
    ANIME_WATCH_TIME_TOTAL: 'yorumi_anime_watch_time_total',
    ANIME_GENRE_CACHE: 'yorumi_anime_genre_cache',
    ANIME_COMPLETION_CACHE: 'yorumi_anime_completion_cache',
    MANGA_COMPLETION_CACHE: 'yorumi_manga_completion_cache',
    MANGA_GENRE_CACHE: 'yorumi_manga_genre_cache'
};

const storageMemoryCache = new Map<string, string>();

const getScopedStorageKey = (key: string) => {
    const uid = auth.currentUser?.uid;
    return uid ? `${key}_${uid}` : key;
};

const setScopedItem = (key: string, value: string) => {
    const scopedKey = getScopedStorageKey(key);
    storageMemoryCache.set(scopedKey, value);

    if (auth.currentUser) {
        return;
    }

    try {
        localStorage.setItem(scopedKey, value);
    } catch (error) {
        console.warn(`Failed to persist ${scopedKey} to localStorage; keeping in memory only.`, error);
    }
};

const getScopedItem = (key: string) => {
    const scopedKey = getScopedStorageKey(key);
    if (storageMemoryCache.has(scopedKey)) {
        return storageMemoryCache.get(scopedKey) || null;
    }

    try {
        const stored = localStorage.getItem(scopedKey);
        if (stored != null) {
            storageMemoryCache.set(scopedKey, stored);
        }
        return stored;
    } catch (error) {
        console.warn(`Failed to read ${scopedKey} from localStorage.`, error);
        return null;
    }
};

export const clearLocalProgressStorage = () => {
    try {
        Object.values(STORAGE_KEYS).forEach((key) => {
            storageMemoryCache.delete(key);
            localStorage.removeItem(key);
            const scopedPrefix = `${key}_`;
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                const k = localStorage.key(i);
                if (k && k.startsWith(scopedPrefix)) {
                    storageMemoryCache.delete(k);
                    localStorage.removeItem(k);
                }
            }
        });
        emitStorageUpdated();
    } catch (error) {
        console.error('Failed to clear local progress storage:', error);
    }
};

export const clearLegacyUnscopedProgressStorage = () => {
    try {
        Object.values(STORAGE_KEYS).forEach((key) => {
            storageMemoryCache.delete(key);
            localStorage.removeItem(key);
        });
        emitStorageUpdated();
    } catch (error) {
        console.error('Failed to clear legacy progress storage:', error);
    }
};

const emitStorageUpdated = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('yorumi-storage-updated'));
    }
};

export const storage = {
    // Continue Watching
    saveProgress: (progress: Omit<WatchProgress, 'lastWatched'>) => {
        try {
            const current = storage.getContinueWatching();
            const updated = [
                { ...progress, lastWatched: Date.now() },
                ...current.filter(item => item.animeId !== progress.animeId)
            ].slice(0, 20); // Keep last 20

            setScopedItem(STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to save progress:', error);
        }
    },

    getContinueWatching: (): WatchProgress[] => {
        try {
            const data = getScopedItem(STORAGE_KEYS.CONTINUE_WATCHING);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to get continue watching:', error);
            return [];
        }
    },

    removeFromContinueWatching: (animeId: string) => {
        try {
            const current = storage.getContinueWatching();
            const updated = current.filter(item => item.animeId !== animeId);
            setScopedItem(STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to remove from continue watching:', error);
        }
    },

    // Continue Reading
    saveReadingProgress: (progress: Omit<ReadProgress, 'lastRead'>) => {
        try {
            const current = storage.getContinueReading();
            const updated = [
                { ...progress, lastRead: Date.now() },
                ...current.filter(item => item.mangaId !== progress.mangaId)
            ].slice(0, 20); // Keep last 20

            setScopedItem(STORAGE_KEYS.CONTINUE_READING, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to save reading progress:', error);
        }
    },

    getContinueReading: (): ReadProgress[] => {
        try {
            const data = getScopedItem(STORAGE_KEYS.CONTINUE_READING);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to get continue reading:', error);
            return [];
        }
    },

    removeFromContinueReading: (mangaId: string) => {
        try {
            const current = storage.getContinueReading();
            const updated = current.filter(item => item.mangaId !== mangaId);
            setScopedItem(STORAGE_KEYS.CONTINUE_READING, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to remove from continue reading:', error);
        }
    },

    // Watch List
    addToWatchList: (item: Omit<WatchListItem, 'addedAt' | 'status'>, status: WatchListItem['status'] = 'watching') => {
        try {
            const current = storage.getWatchList();
            if (current.some(i => i.id === item.id)) return; // Already in list

            const updated = [
                { ...item, status, addedAt: Date.now() },
                ...current
            ];

            setScopedItem(STORAGE_KEYS.WATCH_LIST, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to add to watch list:', error);
        }
    },

    removeFromWatchList: (animeId: string) => {
        try {
            const current = storage.getWatchList();
            const updated = current.filter(item => item.id !== animeId);
            setScopedItem(STORAGE_KEYS.WATCH_LIST, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to remove from watch list:', error);
        }
    },

    getWatchList: (): WatchListItem[] => {
        try {
            const data = getScopedItem(STORAGE_KEYS.WATCH_LIST);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to get watch list:', error);
            return [];
        }
    },

    isInWatchList: (animeId: string): boolean => {
        const list = storage.getWatchList();
        return list.some(item => item.id === animeId);
    },

    // Read List
    addToReadList: (item: Omit<ReadListItem, 'addedAt' | 'status'>, status: ReadListItem['status'] = 'reading') => {
        try {
            const current = storage.getReadList();
            if (current.some(i => i.id === item.id)) return;

            const updated = [
                { ...item, status, addedAt: Date.now() },
                ...current
            ];

            setScopedItem(STORAGE_KEYS.READ_LIST, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to add to read list:', error);
        }
    },

    removeFromReadList: (mangaId: string) => {
        try {
            const current = storage.getReadList();
            const updated = current.filter(item => item.id !== mangaId);
            setScopedItem(STORAGE_KEYS.READ_LIST, JSON.stringify(updated));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to remove from read list:', error);
        }
    },

    getReadList: (): ReadListItem[] => {
        try {
            const data = getScopedItem(STORAGE_KEYS.READ_LIST);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to get read list:', error);
            return [];
        }
    },

    isInReadList: (mangaId: string): boolean => {
        const list = storage.getReadList();
        return list.some(item => item.id === mangaId);
    },

    // Episode History (Watched Episodes)
    markEpisodeAsWatched: (animeId: string, episodeNumber: number) => {
        try {
            const history = storage.getEpisodeHistory();
            if (!history[animeId]) history[animeId] = [];
            if (!history[animeId].includes(episodeNumber)) {
                history[animeId].push(episodeNumber);
                setScopedItem(STORAGE_KEYS.EPISODE_HISTORY, JSON.stringify(history));
                emitStorageUpdated();
            }
        } catch (error) {
            console.error('Failed to mark episode as watched:', error);
        }
    },

    getEpisodeHistory: (): Record<string, number[]> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.EPISODE_HISTORY);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    },

    setEpisodeHistory: (history: Record<string, number[]>) => {
        try {
            setScopedItem(STORAGE_KEYS.EPISODE_HISTORY, JSON.stringify(history || {}));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to set episode history:', error);
        }
    },

    getWatchedEpisodes: (animeId: string): number[] => {
        const history = storage.getEpisodeHistory();
        return history[animeId] || [];
    },

    // Anime watch time (seconds)
    addAnimeWatchTime: (animeId: string, seconds: number) => {
        try {
            if (!animeId || !Number.isFinite(seconds) || seconds <= 0) return;
            const current = storage.getAnimeWatchTime();
            const normalized = Math.floor(seconds);
            current[animeId] = (current[animeId] || 0) + normalized;
            setScopedItem(STORAGE_KEYS.ANIME_WATCH_TIME, JSON.stringify(current));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to add anime watch time:', error);
        }
    },

    getAnimeWatchTime: (): Record<string, number> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.ANIME_WATCH_TIME);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to get anime watch time:', error);
            return {};
        }
    },

    getAnimeWatchTimeSeconds: (animeId: string): number => {
        const data = storage.getAnimeWatchTime();
        return data[animeId] || 0;
    },

    addAnimeWatchTimeTotal: (seconds: number) => {
        try {
            if (!Number.isFinite(seconds) || seconds <= 0) return;

            const normalized = Math.floor(seconds);
            const current = storage.getAnimeWatchTimeTotalSeconds();
            setScopedItem(STORAGE_KEYS.ANIME_WATCH_TIME_TOTAL, JSON.stringify(current + normalized));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to add anime total watch time:', error);
        }
    },

    getAnimeWatchTimeTotalSeconds: (): number => {
        try {
            const data = getScopedItem(STORAGE_KEYS.ANIME_WATCH_TIME_TOTAL);
            if (data) {
                const parsed = Number(JSON.parse(data));
                if (Number.isFinite(parsed) && parsed >= 0) return parsed;
            }

            // Backfill from legacy per-anime map when no dedicated total exists yet.
            return Object.values(storage.getAnimeWatchTime()).reduce((sum, seconds) => {
                const safeSeconds = Number(seconds) || 0;
                return sum + Math.max(0, safeSeconds);
            }, 0);
        } catch (error) {
            console.error('Failed to get anime total watch time:', error);
            return 0;
        }
    },

    setAnimeWatchTimeTotalSeconds: (seconds: number) => {
        try {
            const normalized = Math.max(0, Math.floor(Number(seconds) || 0));
            setScopedItem(STORAGE_KEYS.ANIME_WATCH_TIME_TOTAL, JSON.stringify(normalized));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to set anime total watch time:', error);
        }
    },

    // Genre caches
    getAnimeGenreCache: (): Record<string, string[]> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.ANIME_GENRE_CACHE);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to get anime genre cache:', error);
            return {};
        }
    },

    setAnimeGenreCache: (cache: Record<string, string[]>) => {
        try {
            setScopedItem(STORAGE_KEYS.ANIME_GENRE_CACHE, JSON.stringify(cache || {}));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to set anime genre cache:', error);
        }
    },

    getAnimeCompletionCache: (): Record<string, AnimeCompletionSnapshot> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.ANIME_COMPLETION_CACHE);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to get anime completion cache:', error);
            return {};
        }
    },

    setAnimeCompletionCache: (cache: Record<string, AnimeCompletionSnapshot>) => {
        try {
            setScopedItem(STORAGE_KEYS.ANIME_COMPLETION_CACHE, JSON.stringify(cache || {}));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to set anime completion cache:', error);
        }
    },

    getMangaCompletionCache: (): Record<string, MangaCompletionSnapshot> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.MANGA_COMPLETION_CACHE);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to get manga completion cache:', error);
            return {};
        }
    },

    setMangaCompletionCache: (cache: Record<string, MangaCompletionSnapshot>) => {
        try {
            setScopedItem(STORAGE_KEYS.MANGA_COMPLETION_CACHE, JSON.stringify(cache || {}));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to set manga completion cache:', error);
        }
    },

    getMangaGenreCache: (): Record<string, string[]> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.MANGA_GENRE_CACHE);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to get manga genre cache:', error);
            return {};
        }
    },

    setMangaGenreCache: (cache: Record<string, string[]>) => {
        try {
            setScopedItem(STORAGE_KEYS.MANGA_GENRE_CACHE, JSON.stringify(cache || {}));
            emitStorageUpdated();
        } catch (error) {
            console.error('Failed to set manga genre cache:', error);
        }
    },

    // Chapter History (Read Chapters)
    markChapterAsRead: (mangaId: string, chapterId: string) => {
        try {
            const history = storage.getChapterHistory();
            if (!history[mangaId]) history[mangaId] = [];
            if (!history[mangaId].includes(chapterId)) {
                history[mangaId].push(chapterId);
                setScopedItem(STORAGE_KEYS.CHAPTER_HISTORY, JSON.stringify(history));
                emitStorageUpdated();
            }
        } catch (error) {
            console.error('Failed to mark chapter as read:', error);
        }
    },

    getChapterHistory: (): Record<string, string[]> => {
        try {
            const data = getScopedItem(STORAGE_KEYS.CHAPTER_HISTORY);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    },

    getReadChapters: (mangaId: string): string[] => {
        const history = storage.getChapterHistory();
        return history[mangaId] || [];
    }
};

const getUserRef = () => {
    const user = auth.currentUser;
    if (!user) return null;
    return doc(db, 'users', user.uid);
};

export const syncStorage = {
    // Sync Local -> Cloud
    pushToCloud: async () => {
        const userRef = getUserRef();
        if (!userRef) return;

        const watchList = storage.getWatchList();
        const readList = storage.getReadList();
        const continueWatching = storage.getContinueWatching();
        const continueReading = storage.getContinueReading();
        const episodeHistory = storage.getEpisodeHistory();
        const chapterHistory = storage.getChapterHistory();
        const animeWatchTime = storage.getAnimeWatchTime();
        const animeGenreCache = storage.getAnimeGenreCache();
        const animeCompletionCache = storage.getAnimeCompletionCache();
        const mangaCompletionCache = storage.getMangaCompletionCache();
        const mangaGenreCache = storage.getMangaGenreCache();

        try {
            await setDoc(userRef, {
                watchList,
                readList,
                continueWatching,
                continueReading,
                episodeHistory,
                chapterHistory,
                animeWatchTime,
                animeGenreCache,
                animeCompletionCache,
                mangaCompletionCache,
                mangaGenreCache,
                lastSynced: Date.now()
            }, { merge: true });
        } catch (error) {
            console.error('Failed to push to cloud:', error);
        }
    },

    // Sync Cloud -> Local (Merge)
    pullFromCloud: async () => {
        const userRef = getUserRef();
        if (!userRef) return;

        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();
                let didUpdateLocal = false;

                // Merge logic could be more complex, but for now we'll prefer Cloud if it exists, 
                // or simpler: just overwrite Local if Cloud has data, 
                // OR better: Merge sets based on IDs.

                // Simple merge for lists (Union by ID)
                if (data.watchList) {
                    const local = storage.getWatchList();
                    const merged = [...local];
                    data.watchList.forEach((cloudItem: WatchListItem) => {
                        if (!merged.some(i => i.id === cloudItem.id)) {
                            merged.push(cloudItem);
                        }
                    });
                    setScopedItem(STORAGE_KEYS.WATCH_LIST, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                if (data.readList) {
                    const local = storage.getReadList();
                    const merged = [...local];
                    data.readList.forEach((cloudItem: ReadListItem) => {
                        if (!merged.some(i => i.id === cloudItem.id)) {
                            merged.push(cloudItem);
                        }
                    });
                    setScopedItem(STORAGE_KEYS.READ_LIST, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                if (data.continueWatching) {
                    // Start simplified: Overwrite local with cloud if cloud is newer? 
                    // Let's just merge and slice.
                    const local = storage.getContinueWatching();
                    const merged = [...data.continueWatching, ...local]
                        .filter((v, i, a) => a.findIndex(t => t.animeId === v.animeId) === i) // Unique by ID
                        .slice(0, 20);
                    setScopedItem(STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                if (data.continueReading) {
                    const local = storage.getContinueReading();
                    const merged = [...data.continueReading, ...local]
                        .filter((v, i, a) => a.findIndex(t => t.mangaId === v.mangaId) === i)
                        .slice(0, 20);
                    setScopedItem(STORAGE_KEYS.CONTINUE_READING, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                // Merge Episode History
                if (data.episodeHistory) {
                    const local = storage.getEpisodeHistory();
                    const merged: Record<string, number[]> = { ...local };
                    Object.entries(data.episodeHistory as Record<string, unknown[]>).forEach(([animeId, episodes]) => {
                        if (!Array.isArray(episodes)) return;
                        if (!merged[animeId]) merged[animeId] = [];
                        episodes.forEach((ep) => {
                            const n = Number(ep);
                            if (Number.isFinite(n) && n > 0 && !merged[animeId].includes(n)) {
                                merged[animeId].push(n);
                            }
                        });
                    });
                    setScopedItem(STORAGE_KEYS.EPISODE_HISTORY, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                // Merge Chapter History
                if (data.chapterHistory) {
                    const local = storage.getChapterHistory();
                    const merged: Record<string, string[]> = { ...local };
                    Object.entries(data.chapterHistory as Record<string, string[]>).forEach(([mangaId, chapters]) => {
                        if (!merged[mangaId]) merged[mangaId] = [];
                        chapters.forEach(ch => {
                            if (!merged[mangaId].includes(ch)) merged[mangaId].push(ch);
                        });
                    });
                    setScopedItem(STORAGE_KEYS.CHAPTER_HISTORY, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                // Merge Anime Watch Time (keep the larger value per anime to avoid sync double-counting)
                if (data.animeWatchTime) {
                    const local = storage.getAnimeWatchTime();
                    const merged: Record<string, number> = { ...local };

                    Object.entries(data.animeWatchTime as Record<string, number>).forEach(([animeId, seconds]) => {
                        const safeSeconds = Number(seconds) || 0;
                        merged[animeId] = Math.max(merged[animeId] || 0, safeSeconds);
                    });

                    setScopedItem(STORAGE_KEYS.ANIME_WATCH_TIME, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                // Merge total watch time from backend authoritative counter.
                if (typeof data.animeWatchTimeTotalSeconds === 'number') {
                    const localTotal = storage.getAnimeWatchTimeTotalSeconds();
                    const mergedTotal = Math.max(localTotal, Math.floor(data.animeWatchTimeTotalSeconds));
                    storage.setAnimeWatchTimeTotalSeconds(mergedTotal);
                    didUpdateLocal = true;
                }

                // Merge Anime Genre Cache
                if (data.animeGenreCache) {
                    const local = storage.getAnimeGenreCache();
                    const merged: Record<string, string[]> = { ...local };
                    Object.entries(data.animeGenreCache as Record<string, string[]>).forEach(([animeId, genres]) => {
                        const localGenres = merged[animeId] || [];
                        const cloudGenres = Array.isArray(genres) ? genres : [];
                        merged[animeId] = Array.from(new Set([...localGenres, ...cloudGenres]));
                    });
                    setScopedItem(STORAGE_KEYS.ANIME_GENRE_CACHE, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                if (data.animeCompletionCache) {
                    const local = storage.getAnimeCompletionCache();
                    const merged: Record<string, AnimeCompletionSnapshot> = { ...local };
                    Object.entries(data.animeCompletionCache as Record<string, AnimeCompletionSnapshot>).forEach(([animeId, snapshot]) => {
                        const current = merged[animeId] || {};
                        const next = snapshot || {};
                        merged[animeId] = {
                            title: current.title || next.title,
                            totalCount: Math.max(Number(current.totalCount) || 0, Number(next.totalCount) || 0) || undefined,
                            mediaStatus: current.mediaStatus || next.mediaStatus
                        };
                    });
                    setScopedItem(STORAGE_KEYS.ANIME_COMPLETION_CACHE, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                if (data.mangaCompletionCache) {
                    const local = storage.getMangaCompletionCache();
                    const merged: Record<string, MangaCompletionSnapshot> = { ...local };
                    Object.entries(data.mangaCompletionCache as Record<string, MangaCompletionSnapshot>).forEach(([mangaId, snapshot]) => {
                        const current = merged[mangaId] || {};
                        const next = snapshot || {};
                        merged[mangaId] = {
                            title: current.title || next.title,
                            totalCount: Math.max(Number(current.totalCount) || 0, Number(next.totalCount) || 0) || undefined,
                            mediaStatus: current.mediaStatus || next.mediaStatus
                        };
                    });
                    setScopedItem(STORAGE_KEYS.MANGA_COMPLETION_CACHE, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                // Merge Manga Genre Cache
                if (data.mangaGenreCache) {
                    const local = storage.getMangaGenreCache();
                    const merged: Record<string, string[]> = { ...local };
                    Object.entries(data.mangaGenreCache as Record<string, string[]>).forEach(([mangaId, genres]) => {
                        const localGenres = merged[mangaId] || [];
                        const cloudGenres = Array.isArray(genres) ? genres : [];
                        merged[mangaId] = Array.from(new Set([...localGenres, ...cloudGenres]));
                    });
                    setScopedItem(STORAGE_KEYS.MANGA_GENRE_CACHE, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                if (didUpdateLocal) {
                    emitStorageUpdated();
                }
            }
        } catch (error) {
            console.error('Failed to pull from cloud:', error);
        }
    }
};

// Hook into storage methods to auto-sync
const originalSaveProgress = storage.saveProgress;
storage.saveProgress = (progress) => {
    originalSaveProgress(progress);
    const currentCache = storage.getAnimeCompletionCache();
    storage.setAnimeCompletionCache({
        ...currentCache,
        [progress.animeId]: {
            title: progress.animeTitle,
            totalCount: progress.totalCount,
            mediaStatus: progress.mediaStatus
        }
    });
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalAddToWatchList = storage.addToWatchList;
storage.addToWatchList = (item, status) => {
    originalAddToWatchList(item, status);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalRemoveFromWatchList = storage.removeFromWatchList;
storage.removeFromWatchList = (id) => {
    originalRemoveFromWatchList(id);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalAddToReadList = storage.addToReadList;
storage.addToReadList = (item, status) => {
    originalAddToReadList(item, status);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalSaveReadingProgress = storage.saveReadingProgress;
storage.saveReadingProgress = (progress) => {
    originalSaveReadingProgress(progress);
    const currentCache = storage.getMangaCompletionCache();
    storage.setMangaCompletionCache({
        ...currentCache,
        [progress.mangaId]: {
            title: progress.mangaTitle,
            totalCount: progress.totalCount,
            mediaStatus: progress.mediaStatus
        }
    });
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalRemoveFromReadList = storage.removeFromReadList;
storage.removeFromReadList = (id) => {
    originalRemoveFromReadList(id);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalMarkEpisodeAsWatched = storage.markEpisodeAsWatched;
storage.markEpisodeAsWatched = (animeId, episodeNumber) => {
    originalMarkEpisodeAsWatched(animeId, episodeNumber);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalSetEpisodeHistory = storage.setEpisodeHistory;
storage.setEpisodeHistory = (history) => {
    originalSetEpisodeHistory(history);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalMarkChapterAsRead = storage.markChapterAsRead;
storage.markChapterAsRead = (mangaId, chapterId) => {
    originalMarkChapterAsRead(mangaId, chapterId);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalAddAnimeWatchTime = storage.addAnimeWatchTime;
storage.addAnimeWatchTime = (animeId, seconds) => {
    originalAddAnimeWatchTime(animeId, seconds);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalAddAnimeWatchTimeTotal = storage.addAnimeWatchTimeTotal;
storage.addAnimeWatchTimeTotal = (seconds) => {
    originalAddAnimeWatchTimeTotal(seconds);

    const userRef = getUserRef();
    const normalized = Math.floor(Number(seconds) || 0);
    if (!userRef || normalized <= 0) return;

    setDoc(userRef, {
        animeWatchTimeTotalSeconds: increment(normalized)
    }, { merge: true }).catch((error) => {
        console.error('Failed to sync anime total watch time to cloud:', error);
    });
};

const originalSetAnimeGenreCache = storage.setAnimeGenreCache;
storage.setAnimeGenreCache = (cache) => {
    originalSetAnimeGenreCache(cache);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalSetMangaGenreCache = storage.setMangaGenreCache;
storage.setMangaGenreCache = (cache) => {
    originalSetMangaGenreCache(cache);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalRemoveFromContinueWatching = storage.removeFromContinueWatching;
storage.removeFromContinueWatching = (id) => {
    originalRemoveFromContinueWatching(id);
    if (auth.currentUser) syncStorage.pushToCloud();
};

const originalRemoveFromContinueReading = storage.removeFromContinueReading;
storage.removeFromContinueReading = (id) => {
    originalRemoveFromContinueReading(id);
    if (auth.currentUser) syncStorage.pushToCloud();
};
