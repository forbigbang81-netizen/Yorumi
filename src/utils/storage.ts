import { collection, deleteDoc, doc, getDoc, getDocs, increment, orderBy, query, setDoc, deleteField } from 'firebase/firestore';
import { auth, db, isFirebaseEnabled } from '../services/firebase';

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
    CONTINUE_WATCHING_PENDING_DELETES: 'yorumi_continue_watching_pending_deletes',
    CONTINUE_READING_PENDING_DELETES: 'yorumi_continue_reading_pending_deletes',
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

const USER_SUBCOLLECTIONS = {
    WATCH_LIST: 'watchList',
    READ_LIST: 'readList',
    CONTINUE_WATCHING: 'continueWatching',
    CONTINUE_READING: 'continueReading'
} as const;

const storageMemoryCache = new Map<string, string>();

const getScopedStorageKey = (key: string) => {
    const uid = auth?.currentUser?.uid;
    return uid ? `${key}_${uid}` : key;
};

const getEntryRecency = (value: unknown, primaryKey: 'lastWatched' | 'lastRead') => {
    if (!value || typeof value !== 'object') return 0;
    const entry = value as Record<string, unknown>;
    const primary = Number(entry[primaryKey]);
    if (Number.isFinite(primary) && primary > 0) return primary;
    const fallback = Number(entry.timestamp);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
};

const mergeRecentItems = <T extends object>(
    cloudItems: T[],
    localItems: T[],
    idKey: keyof T,
    recencyKey: 'lastWatched' | 'lastRead'
) => {
    const merged = new Map<string, T>();

    [...cloudItems, ...localItems].forEach((item) => {
        const rawId = item[idKey];
        const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : '';
        if (!id) return;

        const existing = merged.get(id);
        if (!existing || getEntryRecency(item, recencyKey) >= getEntryRecency(existing, recencyKey)) {
            merged.set(id, item);
        }
    });

    return Array.from(merged.values())
        .sort((a, b) => getEntryRecency(b, recencyKey) - getEntryRecency(a, recencyKey))
        .slice(0, 20);
};

const setScopedItem = (key: string, value: string) => {
    const scopedKey = getScopedStorageKey(key);
    storageMemoryCache.set(scopedKey, value);

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

const getPendingDeleteIds = (key: string): string[] => {
    try {
        const data = getScopedItem(key);
        const parsed = data ? JSON.parse(data) : [];
        return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
    } catch {
        return [];
    }
};

const addPendingDeleteId = (key: string, id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const next = Array.from(new Set([...getPendingDeleteIds(key), normalizedId]));
    setScopedItem(key, JSON.stringify(next));
};

const removePendingDeleteId = (key: string, id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const next = getPendingDeleteIds(key).filter((value) => value !== normalizedId);
    setScopedItem(key, JSON.stringify(next));
};

export const storage = {
    // Continue Watching
    saveProgress: (progress: Omit<WatchProgress, 'lastWatched'>) => {
        try {
            removePendingDeleteId(STORAGE_KEYS.CONTINUE_WATCHING_PENDING_DELETES, progress.animeId);
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
            addPendingDeleteId(STORAGE_KEYS.CONTINUE_WATCHING_PENDING_DELETES, animeId);
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
            removePendingDeleteId(STORAGE_KEYS.CONTINUE_READING_PENDING_DELETES, progress.mangaId);
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
            addPendingDeleteId(STORAGE_KEYS.CONTINUE_READING_PENDING_DELETES, mangaId);
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
    const user = auth?.currentUser;
    if (!user || !db) return null;
    return doc(db, 'users', user.uid);
};

const getUserCollectionRef = (collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS]) => {
    const user = auth?.currentUser;
    if (!user || !db) return null;
    return collection(db, 'users', user.uid, collectionName);
};

const normalizeDocId = (value: string | number) => String(value).trim();
const CLOUD_SYNC_DEBOUNCE_MS = 1500;
const WATCH_TIME_TOTAL_DEBOUNCE_MS = 4000;

let pendingCloudSyncPromise: Promise<void> | null = null;
let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let queuedWatchTimeTotalIncrement = 0;
let watchTimeTotalTimer: ReturnType<typeof setTimeout> | null = null;

const setUserSubcollectionDoc = async <T extends object>(
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    id: string | number,
    value: T
) => {
    const collectionRef = getUserCollectionRef(collectionName);
    const docId = normalizeDocId(id);
    if (!collectionRef || !docId) return;

    try {
        await setDoc(doc(collectionRef, docId), value);
    } catch (error) {
        console.error(`Failed to write ${collectionName}/${docId}:`, error);
    }
};

const deleteUserSubcollectionDoc = async (
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    id: string | number
) => {
    const collectionRef = getUserCollectionRef(collectionName);
    const docId = normalizeDocId(id);
    if (!collectionRef || !docId) return;

    try {
        await deleteDoc(doc(collectionRef, docId));
    } catch (error) {
        console.error(`Failed to delete ${collectionName}/${docId}:`, error);
    }
};

const getOrderedUserSubcollection = async <T>(
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    orderField: string
): Promise<T[]> => {
    const collectionRef = getUserCollectionRef(collectionName);
    if (!collectionRef) return [];

    try {
        const snapshot = await getDocs(query(collectionRef, orderBy(orderField, 'desc')));
        return snapshot.docs.map((entry) => entry.data() as T);
    } catch (error) {
        console.warn(`Failed to load ${collectionName} subcollection:`, error);
        return [];
    }
};

export const syncStorage = {
    // Sync Local -> Cloud
    pushToCloud: async () => {
        if (!isFirebaseEnabled || !auth || !db) return;
        const userRef = getUserRef();
        if (!userRef) return;
        const episodeHistory = storage.getEpisodeHistory();
        const chapterHistory = storage.getChapterHistory();
        const animeWatchTime = storage.getAnimeWatchTime();
        const animeGenreCache = storage.getAnimeGenreCache();
        const animeCompletionCache = storage.getAnimeCompletionCache();
        const mangaCompletionCache = storage.getMangaCompletionCache();
        const mangaGenreCache = storage.getMangaGenreCache();

        try {
            await setDoc(userRef, {
                episodeHistory,
                chapterHistory,
                animeWatchTime,
                animeGenreCache,
                animeCompletionCache,
                mangaCompletionCache,
                mangaGenreCache,
                watchList: deleteField(),
                readList: deleteField(),
                continueWatching: deleteField(),
                continueReading: deleteField(),
                lastSynced: Date.now()
            }, { merge: true });
        } catch (error) {
            console.error('Failed to push to cloud:', error);
        }
    },

    // Sync Cloud -> Local (Merge)
    pullFromCloud: async () => {
        if (!isFirebaseEnabled || !auth || !db) return;
        const userRef = getUserRef();
        if (!userRef) return;

        try {
            const [snap, cloudWatchList, cloudReadList, cloudContinueWatching, cloudContinueReading] = await Promise.all([
                getDoc(userRef),
                getOrderedUserSubcollection<WatchListItem>(USER_SUBCOLLECTIONS.WATCH_LIST, 'addedAt'),
                getOrderedUserSubcollection<ReadListItem>(USER_SUBCOLLECTIONS.READ_LIST, 'addedAt'),
                getOrderedUserSubcollection<WatchProgress>(USER_SUBCOLLECTIONS.CONTINUE_WATCHING, 'lastWatched'),
                getOrderedUserSubcollection<ReadProgress>(USER_SUBCOLLECTIONS.CONTINUE_READING, 'lastRead')
            ]);
            if (snap.exists()) {
                const data = snap.data();
                let didUpdateLocal = false;

                // Merge logic could be more complex, but for now we'll prefer Cloud if it exists, 
                // or simpler: just overwrite Local if Cloud has data, 
                // OR better: Merge sets based on IDs.

                // Simple merge for lists (Union by ID)
                const legacyWatchList = Array.isArray(data.watchList) ? data.watchList as WatchListItem[] : [];
                const watchListSource = cloudWatchList.length > 0 ? cloudWatchList : legacyWatchList;
                if (watchListSource.length > 0) {
                    const local = storage.getWatchList();
                    const merged = [...local];
                    watchListSource.forEach((cloudItem: WatchListItem) => {
                        if (!merged.some(i => i.id === cloudItem.id)) {
                            merged.push(cloudItem);
                        }
                    });
                    setScopedItem(STORAGE_KEYS.WATCH_LIST, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                const legacyReadList = Array.isArray(data.readList) ? data.readList as ReadListItem[] : [];
                const readListSource = cloudReadList.length > 0 ? cloudReadList : legacyReadList;
                if (readListSource.length > 0) {
                    const local = storage.getReadList();
                    const merged = [...local];
                    readListSource.forEach((cloudItem: ReadListItem) => {
                        if (!merged.some(i => i.id === cloudItem.id)) {
                            merged.push(cloudItem);
                        }
                    });
                    setScopedItem(STORAGE_KEYS.READ_LIST, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                const legacyContinueWatching = Array.isArray(data.continueWatching) ? data.continueWatching as WatchProgress[] : [];
                const pendingContinueWatchingDeletes = new Set(getPendingDeleteIds(STORAGE_KEYS.CONTINUE_WATCHING_PENDING_DELETES));
                const continueWatchingSource = (cloudContinueWatching.length > 0 ? cloudContinueWatching : legacyContinueWatching)
                    .filter((item: WatchProgress) => !pendingContinueWatchingDeletes.has(String(item.animeId)));
                if (continueWatchingSource.length > 0) {
                    const local = storage.getContinueWatching();
                    const merged = mergeRecentItems(
                        continueWatchingSource,
                        local,
                        'animeId',
                        'lastWatched'
                    );
                    setScopedItem(STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(merged));
                    didUpdateLocal = true;
                }

                const legacyContinueReading = Array.isArray(data.continueReading) ? data.continueReading as ReadProgress[] : [];
                const pendingContinueReadingDeletes = new Set(getPendingDeleteIds(STORAGE_KEYS.CONTINUE_READING_PENDING_DELETES));
                const continueReadingSource = (cloudContinueReading.length > 0 ? cloudContinueReading : legacyContinueReading)
                    .filter((item: ReadProgress) => !pendingContinueReadingDeletes.has(String(item.mangaId)));
                if (continueReadingSource.length > 0) {
                    const local = storage.getContinueReading();
                    const merged = mergeRecentItems(
                        continueReadingSource,
                        local,
                        'mangaId',
                        'lastRead'
                    );
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

const flushCloudSync = async () => {
    if (pendingCloudSyncPromise) {
        return pendingCloudSyncPromise;
    }

    pendingCloudSyncPromise = syncStorage.pushToCloud()
        .catch((error) => {
            console.error('Failed to flush queued cloud sync:', error);
        })
        .finally(() => {
            pendingCloudSyncPromise = null;
        });

    return pendingCloudSyncPromise;
};

const scheduleCloudSync = () => {
    if (!auth?.currentUser) return;

    if (cloudSyncTimer) {
        clearTimeout(cloudSyncTimer);
    }

    cloudSyncTimer = setTimeout(() => {
        cloudSyncTimer = null;
        void flushCloudSync();
    }, CLOUD_SYNC_DEBOUNCE_MS);
};

const flushWatchTimeTotalIncrement = async () => {
    const userRef = getUserRef();
    const normalized = Math.floor(queuedWatchTimeTotalIncrement);
    queuedWatchTimeTotalIncrement = 0;

    if (!userRef || normalized <= 0) return;

    try {
        await setDoc(userRef, {
            animeWatchTimeTotalSeconds: increment(normalized)
        }, { merge: true });
    } catch (error) {
        console.error('Failed to sync anime total watch time to cloud:', error);
        queuedWatchTimeTotalIncrement += normalized;
    }
};

const scheduleWatchTimeTotalIncrement = (seconds: number) => {
    if (!auth?.currentUser) return;

    const normalized = Math.floor(Number(seconds) || 0);
    if (normalized <= 0) return;

    queuedWatchTimeTotalIncrement += normalized;

    if (watchTimeTotalTimer) {
        return;
    }

    watchTimeTotalTimer = setTimeout(() => {
        watchTimeTotalTimer = null;
        void flushWatchTimeTotalIncrement();
    }, WATCH_TIME_TOTAL_DEBOUNCE_MS);
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
    if (auth?.currentUser) {
        const latest = storage.getContinueWatching().find((item) => item.animeId === progress.animeId);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_WATCHING, latest.animeId, latest);
        }
        scheduleCloudSync();
    }
};

const originalAddToWatchList = storage.addToWatchList;
storage.addToWatchList = (item, status) => {
    originalAddToWatchList(item, status);
    if (auth?.currentUser) {
        const latest = storage.getWatchList().find((entry) => entry.id === item.id);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.WATCH_LIST, latest.id, latest);
        }
    }
};

const originalRemoveFromWatchList = storage.removeFromWatchList;
storage.removeFromWatchList = (id) => {
    originalRemoveFromWatchList(id);
    if (auth?.currentUser) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.WATCH_LIST, id);
    }
};

const originalAddToReadList = storage.addToReadList;
storage.addToReadList = (item, status) => {
    originalAddToReadList(item, status);
    if (auth?.currentUser) {
        const latest = storage.getReadList().find((entry) => entry.id === item.id);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.READ_LIST, latest.id, latest);
        }
    }
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
    if (auth?.currentUser) {
        const latest = storage.getContinueReading().find((item) => item.mangaId === progress.mangaId);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_READING, latest.mangaId, latest);
        }
        scheduleCloudSync();
    }
};

const originalRemoveFromReadList = storage.removeFromReadList;
storage.removeFromReadList = (id) => {
    originalRemoveFromReadList(id);
    if (auth?.currentUser) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.READ_LIST, id);
    }
};

const originalMarkEpisodeAsWatched = storage.markEpisodeAsWatched;
storage.markEpisodeAsWatched = (animeId, episodeNumber) => {
    originalMarkEpisodeAsWatched(animeId, episodeNumber);
    if (auth?.currentUser) scheduleCloudSync();
};

const originalSetEpisodeHistory = storage.setEpisodeHistory;
storage.setEpisodeHistory = (history) => {
    originalSetEpisodeHistory(history);
    if (auth?.currentUser) scheduleCloudSync();
};

const originalMarkChapterAsRead = storage.markChapterAsRead;
storage.markChapterAsRead = (mangaId, chapterId) => {
    originalMarkChapterAsRead(mangaId, chapterId);
    if (auth?.currentUser) scheduleCloudSync();
};

const originalAddAnimeWatchTime = storage.addAnimeWatchTime;
storage.addAnimeWatchTime = (animeId, seconds) => {
    originalAddAnimeWatchTime(animeId, seconds);
    if (auth?.currentUser) scheduleCloudSync();
};

const originalAddAnimeWatchTimeTotal = storage.addAnimeWatchTimeTotal;
storage.addAnimeWatchTimeTotal = (seconds) => {
    originalAddAnimeWatchTimeTotal(seconds);
    scheduleWatchTimeTotalIncrement(seconds);
};

const originalSetAnimeGenreCache = storage.setAnimeGenreCache;
storage.setAnimeGenreCache = (cache) => {
    originalSetAnimeGenreCache(cache);
    if (auth?.currentUser) scheduleCloudSync();
};

const originalSetMangaGenreCache = storage.setMangaGenreCache;
storage.setMangaGenreCache = (cache) => {
    originalSetMangaGenreCache(cache);
    if (auth?.currentUser) scheduleCloudSync();
};

const originalRemoveFromContinueWatching = storage.removeFromContinueWatching;
storage.removeFromContinueWatching = (id) => {
    originalRemoveFromContinueWatching(id);
    if (auth?.currentUser) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_WATCHING, id);
    }
};

const originalRemoveFromContinueReading = storage.removeFromContinueReading;
storage.removeFromContinueReading = (id) => {
    originalRemoveFromContinueReading(id);
    if (auth?.currentUser) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_READING, id);
    }
};
