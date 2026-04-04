import { collection, deleteDoc, doc, getDoc, getDocs, increment, orderBy, query, setDoc } from 'firebase/firestore';
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
    MANGA_GENRE_CACHE: 'yorumi_manga_genre_cache',
    CLOUD_WRITE_QUEUE: 'yorumi_cloud_write_queue'
};

const USER_SUBCOLLECTIONS = {
    WATCH_LIST: 'watchList',
    READ_LIST: 'readList',
    CONTINUE_WATCHING: 'continueWatching',
    CONTINUE_READING: 'continueReading'
} as const;

const storageMemoryCache = new Map<string, string>();

const getScopedStorageKey = (key: string, uidOverride?: string | null) => {
    const uid = uidOverride ?? auth?.currentUser?.uid;
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

const setScopedItemForUid = (key: string, value: string, uidOverride?: string | null) => {
    const scopedKey = getScopedStorageKey(key, uidOverride);
    storageMemoryCache.set(scopedKey, value);

    try {
        localStorage.setItem(scopedKey, value);
    } catch (error) {
        console.warn(`Failed to persist ${scopedKey} to localStorage; keeping in memory only.`, error);
    }
};

const setScopedItem = (key: string, value: string) => {
    setScopedItemForUid(key, value);
};

const getScopedItemForUid = (key: string, uidOverride?: string | null) => {
    const scopedKey = getScopedStorageKey(key, uidOverride);
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

const getScopedItem = (key: string) => {
    return getScopedItemForUid(key);
};

const readScopedJsonForUid = <T>(key: string, fallback: T, uidOverride?: string | null): T => {
    try {
        const raw = getScopedItemForUid(key, uidOverride);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
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

const getUserRef = (uidOverride?: string | null) => {
    const uid = uidOverride ?? auth?.currentUser?.uid;
    if (!uid || !db) return null;
    return doc(db, 'users', uid);
};

const getUserCollectionRef = (
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    uidOverride?: string | null
) => {
    const uid = uidOverride ?? auth?.currentUser?.uid;
    if (!uid || !db) return null;
    return collection(db, 'users', uid, collectionName);
};

const normalizeDocId = (value: string | number) => String(value).trim();
const CLOUD_SYNC_DEBOUNCE_MS = 1500;
const WATCH_TIME_TOTAL_DEBOUNCE_MS = 4000;

const pendingCloudSyncPromiseByUid = new Map<string, Promise<void>>();
const cloudSyncTimerByUid = new Map<string, ReturnType<typeof setTimeout>>();
const queuedWatchTimeTotalIncrementByUid = new Map<string, number>();
const watchTimeTotalTimerByUid = new Map<string, ReturnType<typeof setTimeout>>();

type CloudWriteQueueOperation =
    | {
        kind: 'set-subdoc';
        uid: string;
        collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS];
        id: string;
        value: Record<string, unknown>;
        createdAt: number;
    }
    | {
        kind: 'delete-subdoc';
        uid: string;
        collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS];
        id: string;
        createdAt: number;
    }
    | {
        kind: 'sync-root';
        uid: string;
        createdAt: number;
    }
    | {
        kind: 'increment-watch-total';
        uid: string;
        seconds: number;
        createdAt: number;
    };

const readCloudWriteQueue = (uid: string): CloudWriteQueueOperation[] => {
    if (!uid) return [];
    return readScopedJsonForUid<CloudWriteQueueOperation[]>(STORAGE_KEYS.CLOUD_WRITE_QUEUE, [], uid)
        .filter((entry) => entry && entry.uid === uid);
};

const writeCloudWriteQueue = (uid: string, queue: CloudWriteQueueOperation[]) => {
    if (!uid) return;
    setScopedItemForUid(STORAGE_KEYS.CLOUD_WRITE_QUEUE, JSON.stringify(queue), uid);
};

const getCloudQueueSignature = (entry: CloudWriteQueueOperation) => {
    switch (entry.kind) {
        case 'set-subdoc':
        case 'delete-subdoc':
            return `${entry.kind}:${entry.collectionName}:${entry.id}`;
        case 'sync-root':
            return 'sync-root';
        case 'increment-watch-total':
            return 'increment-watch-total';
    }
};

const enqueueCloudWrite = (entry: CloudWriteQueueOperation) => {
    const queue = readCloudWriteQueue(entry.uid);
    if (entry.kind === 'increment-watch-total') {
        const existing = queue.find((item) => item.kind === 'increment-watch-total');
        if (existing && existing.kind === 'increment-watch-total') {
            existing.seconds += Math.max(0, Math.floor(entry.seconds || 0));
            existing.createdAt = Date.now();
            writeCloudWriteQueue(entry.uid, queue);
            return;
        }
    }

    const signature = getCloudQueueSignature(entry);
    const nextQueue = queue.filter((item) => getCloudQueueSignature(item) !== signature);
    nextQueue.push(entry);
    writeCloudWriteQueue(entry.uid, nextQueue);
};

const dequeueCloudWrite = (uid: string, matcher: (entry: CloudWriteQueueOperation) => boolean) => {
    const queue = readCloudWriteQueue(uid);
    const nextQueue = queue.filter((entry) => !matcher(entry));
    if (nextQueue.length !== queue.length) {
        writeCloudWriteQueue(uid, nextQueue);
    }
};

const buildRootSyncPayloadForUid = (uid: string) => ({
    episodeHistory: readScopedJsonForUid<Record<string, number[]>>(STORAGE_KEYS.EPISODE_HISTORY, {}, uid),
    chapterHistory: readScopedJsonForUid<Record<string, string[]>>(STORAGE_KEYS.CHAPTER_HISTORY, {}, uid),
    animeWatchTime: readScopedJsonForUid<Record<string, number>>(STORAGE_KEYS.ANIME_WATCH_TIME, {}, uid),
    animeGenreCache: readScopedJsonForUid<Record<string, string[]>>(STORAGE_KEYS.ANIME_GENRE_CACHE, {}, uid),
    animeCompletionCache: readScopedJsonForUid<Record<string, AnimeCompletionSnapshot>>(STORAGE_KEYS.ANIME_COMPLETION_CACHE, {}, uid),
    mangaCompletionCache: readScopedJsonForUid<Record<string, MangaCompletionSnapshot>>(STORAGE_KEYS.MANGA_COMPLETION_CACHE, {}, uid),
    mangaGenreCache: readScopedJsonForUid<Record<string, string[]>>(STORAGE_KEYS.MANGA_GENRE_CACHE, {}, uid),
    // Mirror list data on the root doc as a fallback when subcollection reads are blocked or delayed.
    watchList: readScopedJsonForUid<WatchListItem[]>(STORAGE_KEYS.WATCH_LIST, [], uid),
    readList: readScopedJsonForUid<ReadListItem[]>(STORAGE_KEYS.READ_LIST, [], uid),
    continueWatching: readScopedJsonForUid<WatchProgress[]>(STORAGE_KEYS.CONTINUE_WATCHING, [], uid),
    continueReading: readScopedJsonForUid<ReadProgress[]>(STORAGE_KEYS.CONTINUE_READING, [], uid),
    lastSynced: Date.now()
});

const setUserSubcollectionDoc = async <T extends object>(
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    id: string | number,
    value: T,
    uidOverride?: string | null
) => {
    const collectionRef = getUserCollectionRef(collectionName, uidOverride);
    const docId = normalizeDocId(id);
    const uid = uidOverride ?? auth?.currentUser?.uid ?? '';
    if (!collectionRef || !docId || !uid) return;

    enqueueCloudWrite({
        kind: 'set-subdoc',
        uid,
        collectionName,
        id: docId,
        value: value as Record<string, unknown>,
        createdAt: Date.now()
    });

    try {
        await setDoc(doc(collectionRef, docId), value, { merge: true });
        dequeueCloudWrite(uid, (entry) =>
            entry.kind === 'set-subdoc' &&
            entry.collectionName === collectionName &&
            entry.id === docId
        );
    } catch (error) {
        console.error(`Failed to write ${collectionName}/${docId}:`, error);
    }
};

const deleteUserSubcollectionDoc = async (
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    id: string | number,
    uidOverride?: string | null
) => {
    const collectionRef = getUserCollectionRef(collectionName, uidOverride);
    const docId = normalizeDocId(id);
    const uid = uidOverride ?? auth?.currentUser?.uid ?? '';
    if (!collectionRef || !docId || !uid) return;

    enqueueCloudWrite({
        kind: 'delete-subdoc',
        uid,
        collectionName,
        id: docId,
        createdAt: Date.now()
    });

    try {
        await deleteDoc(doc(collectionRef, docId));
        dequeueCloudWrite(uid, (entry) =>
            entry.kind === 'delete-subdoc' &&
            entry.collectionName === collectionName &&
            entry.id === docId
        );
    } catch (error) {
        console.error(`Failed to delete ${collectionName}/${docId}:`, error);
    }
};

const getOrderedUserSubcollection = async <T>(
    collectionName: typeof USER_SUBCOLLECTIONS[keyof typeof USER_SUBCOLLECTIONS],
    orderField: string,
    uidOverride?: string | null
): Promise<T[]> => {
    const collectionRef = getUserCollectionRef(collectionName, uidOverride);
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
    pushToCloud: async (uidOverride?: string | null) => {
        if (!isFirebaseEnabled || !auth || !db) return;
        const uid = uidOverride ?? auth?.currentUser?.uid;
        const userRef = getUserRef(uid);
        if (!uid || !userRef) return;
        const payload = buildRootSyncPayloadForUid(uid);

        try {
            await setDoc(userRef, payload, { merge: true });
        } catch (error) {
            console.error('Failed to push to cloud:', error);
            throw error;
        }
    },

    // Sync Cloud -> Local (Merge)
    pullFromCloud: async (uidOverride?: string | null) => {
        if (!isFirebaseEnabled || !auth || !db) return;
        const userRef = getUserRef(uidOverride);
        if (!userRef) return;

        try {
            const [snap, cloudWatchList, cloudReadList, cloudContinueWatching, cloudContinueReading] = await Promise.all([
                getDoc(userRef),
                getOrderedUserSubcollection<WatchListItem>(USER_SUBCOLLECTIONS.WATCH_LIST, 'addedAt', uidOverride),
                getOrderedUserSubcollection<ReadListItem>(USER_SUBCOLLECTIONS.READ_LIST, 'addedAt', uidOverride),
                getOrderedUserSubcollection<WatchProgress>(USER_SUBCOLLECTIONS.CONTINUE_WATCHING, 'lastWatched', uidOverride),
                getOrderedUserSubcollection<ReadProgress>(USER_SUBCOLLECTIONS.CONTINUE_READING, 'lastRead', uidOverride)
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
                    const local = readScopedJsonForUid<WatchListItem[]>(STORAGE_KEYS.WATCH_LIST, [], uidOverride);
                    const merged = [...local];
                    watchListSource.forEach((cloudItem: WatchListItem) => {
                        if (!merged.some(i => i.id === cloudItem.id)) {
                            merged.push(cloudItem);
                        }
                    });
                    setScopedItemForUid(STORAGE_KEYS.WATCH_LIST, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                const legacyReadList = Array.isArray(data.readList) ? data.readList as ReadListItem[] : [];
                const readListSource = cloudReadList.length > 0 ? cloudReadList : legacyReadList;
                if (readListSource.length > 0) {
                    const local = readScopedJsonForUid<ReadListItem[]>(STORAGE_KEYS.READ_LIST, [], uidOverride);
                    const merged = [...local];
                    readListSource.forEach((cloudItem: ReadListItem) => {
                        if (!merged.some(i => i.id === cloudItem.id)) {
                            merged.push(cloudItem);
                        }
                    });
                    setScopedItemForUid(STORAGE_KEYS.READ_LIST, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                const legacyContinueWatching = Array.isArray(data.continueWatching) ? data.continueWatching as WatchProgress[] : [];
                const pendingContinueWatchingDeletes = new Set(
                    readScopedJsonForUid<string[]>(STORAGE_KEYS.CONTINUE_WATCHING_PENDING_DELETES, [], uidOverride).map((value) => String(value))
                );
                const continueWatchingSource = (cloudContinueWatching.length > 0 ? cloudContinueWatching : legacyContinueWatching)
                    .filter((item: WatchProgress) => !pendingContinueWatchingDeletes.has(String(item.animeId)));
                if (continueWatchingSource.length > 0) {
                    const local = readScopedJsonForUid<WatchProgress[]>(STORAGE_KEYS.CONTINUE_WATCHING, [], uidOverride);
                    const merged = mergeRecentItems(
                        continueWatchingSource,
                        local,
                        'animeId',
                        'lastWatched'
                    );
                    setScopedItemForUid(STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                const legacyContinueReading = Array.isArray(data.continueReading) ? data.continueReading as ReadProgress[] : [];
                const pendingContinueReadingDeletes = new Set(
                    readScopedJsonForUid<string[]>(STORAGE_KEYS.CONTINUE_READING_PENDING_DELETES, [], uidOverride).map((value) => String(value))
                );
                const continueReadingSource = (cloudContinueReading.length > 0 ? cloudContinueReading : legacyContinueReading)
                    .filter((item: ReadProgress) => !pendingContinueReadingDeletes.has(String(item.mangaId)));
                if (continueReadingSource.length > 0) {
                    const local = readScopedJsonForUid<ReadProgress[]>(STORAGE_KEYS.CONTINUE_READING, [], uidOverride);
                    const merged = mergeRecentItems(
                        continueReadingSource,
                        local,
                        'mangaId',
                        'lastRead'
                    );
                    setScopedItemForUid(STORAGE_KEYS.CONTINUE_READING, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                // Merge Episode History
                if (data.episodeHistory) {
                    const local = readScopedJsonForUid<Record<string, number[]>>(STORAGE_KEYS.EPISODE_HISTORY, {}, uidOverride);
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
                    setScopedItemForUid(STORAGE_KEYS.EPISODE_HISTORY, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                // Merge Chapter History
                if (data.chapterHistory) {
                    const local = readScopedJsonForUid<Record<string, string[]>>(STORAGE_KEYS.CHAPTER_HISTORY, {}, uidOverride);
                    const merged: Record<string, string[]> = { ...local };
                    Object.entries(data.chapterHistory as Record<string, string[]>).forEach(([mangaId, chapters]) => {
                        if (!merged[mangaId]) merged[mangaId] = [];
                        chapters.forEach(ch => {
                            if (!merged[mangaId].includes(ch)) merged[mangaId].push(ch);
                        });
                    });
                    setScopedItemForUid(STORAGE_KEYS.CHAPTER_HISTORY, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                // Merge Anime Watch Time (keep the larger value per anime to avoid sync double-counting)
                if (data.animeWatchTime) {
                    const local = readScopedJsonForUid<Record<string, number>>(STORAGE_KEYS.ANIME_WATCH_TIME, {}, uidOverride);
                    const merged: Record<string, number> = { ...local };

                    Object.entries(data.animeWatchTime as Record<string, number>).forEach(([animeId, seconds]) => {
                        const safeSeconds = Number(seconds) || 0;
                        merged[animeId] = Math.max(merged[animeId] || 0, safeSeconds);
                    });

                    setScopedItemForUid(STORAGE_KEYS.ANIME_WATCH_TIME, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                // Merge total watch time from backend authoritative counter.
                if (typeof data.animeWatchTimeTotalSeconds === 'number') {
                    const localTotalRaw = getScopedItemForUid(STORAGE_KEYS.ANIME_WATCH_TIME_TOTAL, uidOverride);
                    const localTotal = localTotalRaw ? Math.max(0, Math.floor(Number(JSON.parse(localTotalRaw)) || 0)) : 0;
                    const mergedTotal = Math.max(localTotal, Math.floor(data.animeWatchTimeTotalSeconds));
                    setScopedItemForUid(STORAGE_KEYS.ANIME_WATCH_TIME_TOTAL, JSON.stringify(mergedTotal), uidOverride);
                    didUpdateLocal = true;
                }

                // Merge Anime Genre Cache
                if (data.animeGenreCache) {
                    const local = readScopedJsonForUid<Record<string, string[]>>(STORAGE_KEYS.ANIME_GENRE_CACHE, {}, uidOverride);
                    const merged: Record<string, string[]> = { ...local };
                    Object.entries(data.animeGenreCache as Record<string, string[]>).forEach(([animeId, genres]) => {
                        const localGenres = merged[animeId] || [];
                        const cloudGenres = Array.isArray(genres) ? genres : [];
                        merged[animeId] = Array.from(new Set([...localGenres, ...cloudGenres]));
                    });
                    setScopedItemForUid(STORAGE_KEYS.ANIME_GENRE_CACHE, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                if (data.animeCompletionCache) {
                    const local = readScopedJsonForUid<Record<string, AnimeCompletionSnapshot>>(STORAGE_KEYS.ANIME_COMPLETION_CACHE, {}, uidOverride);
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
                    setScopedItemForUid(STORAGE_KEYS.ANIME_COMPLETION_CACHE, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                if (data.mangaCompletionCache) {
                    const local = readScopedJsonForUid<Record<string, MangaCompletionSnapshot>>(STORAGE_KEYS.MANGA_COMPLETION_CACHE, {}, uidOverride);
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
                    setScopedItemForUid(STORAGE_KEYS.MANGA_COMPLETION_CACHE, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                // Merge Manga Genre Cache
                if (data.mangaGenreCache) {
                    const local = readScopedJsonForUid<Record<string, string[]>>(STORAGE_KEYS.MANGA_GENRE_CACHE, {}, uidOverride);
                    const merged: Record<string, string[]> = { ...local };
                    Object.entries(data.mangaGenreCache as Record<string, string[]>).forEach(([mangaId, genres]) => {
                        const localGenres = merged[mangaId] || [];
                        const cloudGenres = Array.isArray(genres) ? genres : [];
                        merged[mangaId] = Array.from(new Set([...localGenres, ...cloudGenres]));
                    });
                    setScopedItemForUid(STORAGE_KEYS.MANGA_GENRE_CACHE, JSON.stringify(merged), uidOverride);
                    didUpdateLocal = true;
                }

                if (didUpdateLocal) {
                    emitStorageUpdated();
                }
            }
        } catch (error) {
            console.error('Failed to pull from cloud:', error);
        }
    },

    replayPendingWrites: async (uidOverride?: string | null) => {
        const uid = uidOverride ?? auth?.currentUser?.uid;
        if (!uid) return;
        await processCloudWriteQueue(uid);
    }
};

const flushCloudSync = async (uid: string) => {
    if (!uid) return;
    const existing = pendingCloudSyncPromiseByUid.get(uid);
    if (existing) {
        return existing;
    }

    enqueueCloudWrite({
        kind: 'sync-root',
        uid,
        createdAt: Date.now()
    });

    const nextPromise = syncStorage.pushToCloud(uid)
        .then(async () => {
            dequeueCloudWrite(uid, (entry) => entry.kind === 'sync-root');
            await processCloudWriteQueue(uid);
        })
        .catch((error) => {
            console.error(`Failed to flush queued cloud sync for ${uid}:`, error);
        })
        .finally(() => {
            pendingCloudSyncPromiseByUid.delete(uid);
        });

    pendingCloudSyncPromiseByUid.set(uid, nextPromise);
    return nextPromise;
};

const scheduleCloudSync = (uidOverride?: string | null) => {
    const uid = uidOverride ?? auth?.currentUser?.uid;
    if (!uid) return;

    const existingTimer = cloudSyncTimerByUid.get(uid);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const nextTimer = setTimeout(() => {
        cloudSyncTimerByUid.delete(uid);
        void flushCloudSync(uid);
    }, CLOUD_SYNC_DEBOUNCE_MS);

    cloudSyncTimerByUid.set(uid, nextTimer);
};

const flushWatchTimeTotalIncrement = async (uid: string) => {
    const userRef = getUserRef(uid);
    const normalized = Math.floor(queuedWatchTimeTotalIncrementByUid.get(uid) || 0);
    queuedWatchTimeTotalIncrementByUid.set(uid, 0);

    if (!userRef || normalized <= 0) return;

    enqueueCloudWrite({
        kind: 'increment-watch-total',
        uid,
        seconds: normalized,
        createdAt: Date.now()
    });

    try {
        await setDoc(userRef, {
            animeWatchTimeTotalSeconds: increment(normalized)
        }, { merge: true });
        dequeueCloudWrite(uid, (entry) => entry.kind === 'increment-watch-total');
    } catch (error) {
        console.error('Failed to sync anime total watch time to cloud:', error);
        queuedWatchTimeTotalIncrementByUid.set(uid, (queuedWatchTimeTotalIncrementByUid.get(uid) || 0) + normalized);
    }
};

const applyCloudWriteOperation = async (entry: CloudWriteQueueOperation) => {
    switch (entry.kind) {
        case 'set-subdoc': {
            const collectionRef = getUserCollectionRef(entry.collectionName, entry.uid);
            if (!collectionRef) throw new Error('Missing user collection ref');
            await setDoc(doc(collectionRef, entry.id), entry.value, { merge: true });
            return;
        }
        case 'delete-subdoc': {
            const collectionRef = getUserCollectionRef(entry.collectionName, entry.uid);
            if (!collectionRef) throw new Error('Missing user collection ref');
            await deleteDoc(doc(collectionRef, entry.id));
            return;
        }
        case 'sync-root': {
            const userRef = getUserRef(entry.uid);
            if (!userRef) throw new Error('Missing user ref');
            await setDoc(userRef, buildRootSyncPayloadForUid(entry.uid), { merge: true });
            return;
        }
        case 'increment-watch-total': {
            const userRef = getUserRef(entry.uid);
            if (!userRef) throw new Error('Missing user ref');
            const seconds = Math.max(0, Math.floor(entry.seconds || 0));
            if (seconds <= 0) return;
            await setDoc(userRef, {
                animeWatchTimeTotalSeconds: increment(seconds)
            }, { merge: true });
            return;
        }
    }
};

const processCloudWriteQueue = async (uid: string) => {
    if (!uid || !isFirebaseEnabled || !db) return;
    const queue = readCloudWriteQueue(uid);
    if (queue.length === 0) return;

    const ordered = [...queue].sort((a, b) => a.createdAt - b.createdAt);
    for (const entry of ordered) {
        try {
            await applyCloudWriteOperation(entry);
            dequeueCloudWrite(uid, (candidate) => getCloudQueueSignature(candidate) === getCloudQueueSignature(entry));
        } catch (error) {
            console.error(`[Storage] Failed to replay queued cloud write (${entry.kind}) for ${uid}:`, error);
            break;
        }
    }
};

const scheduleWatchTimeTotalIncrement = (seconds: number, uidOverride?: string | null) => {
    const uid = uidOverride ?? auth?.currentUser?.uid;
    if (!uid) return;

    const normalized = Math.floor(Number(seconds) || 0);
    if (normalized <= 0) return;

    queuedWatchTimeTotalIncrementByUid.set(uid, (queuedWatchTimeTotalIncrementByUid.get(uid) || 0) + normalized);

    if (watchTimeTotalTimerByUid.has(uid)) {
        return;
    }

    const nextTimer = setTimeout(() => {
        watchTimeTotalTimerByUid.delete(uid);
        void flushWatchTimeTotalIncrement(uid);
    }, WATCH_TIME_TOTAL_DEBOUNCE_MS);

    watchTimeTotalTimerByUid.set(uid, nextTimer);
};

// Hook into storage methods to auto-sync
const originalSaveProgress = storage.saveProgress;
storage.saveProgress = (progress) => {
    const uid = auth?.currentUser?.uid || null;
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
    if (uid) {
        const latest = storage.getContinueWatching().find((item) => item.animeId === progress.animeId);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_WATCHING, latest.animeId, latest, uid);
        }
        scheduleCloudSync(uid);
    }
};

const originalAddToWatchList = storage.addToWatchList;
storage.addToWatchList = (item, status) => {
    const uid = auth?.currentUser?.uid || null;
    originalAddToWatchList(item, status);
    if (uid) {
        const latest = storage.getWatchList().find((entry) => entry.id === item.id);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.WATCH_LIST, latest.id, latest, uid);
        }
    }
};

const originalRemoveFromWatchList = storage.removeFromWatchList;
storage.removeFromWatchList = (id) => {
    const uid = auth?.currentUser?.uid || null;
    originalRemoveFromWatchList(id);
    if (uid) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.WATCH_LIST, id, uid);
    }
};

const originalAddToReadList = storage.addToReadList;
storage.addToReadList = (item, status) => {
    const uid = auth?.currentUser?.uid || null;
    originalAddToReadList(item, status);
    if (uid) {
        const latest = storage.getReadList().find((entry) => entry.id === item.id);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.READ_LIST, latest.id, latest, uid);
        }
    }
};

const originalSaveReadingProgress = storage.saveReadingProgress;
storage.saveReadingProgress = (progress) => {
    const uid = auth?.currentUser?.uid || null;
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
    if (uid) {
        const latest = storage.getContinueReading().find((item) => item.mangaId === progress.mangaId);
        if (latest) {
            void setUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_READING, latest.mangaId, latest, uid);
        }
        scheduleCloudSync(uid);
    }
};

const originalRemoveFromReadList = storage.removeFromReadList;
storage.removeFromReadList = (id) => {
    const uid = auth?.currentUser?.uid || null;
    originalRemoveFromReadList(id);
    if (uid) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.READ_LIST, id, uid);
    }
};

const originalMarkEpisodeAsWatched = storage.markEpisodeAsWatched;
storage.markEpisodeAsWatched = (animeId, episodeNumber) => {
    const uid = auth?.currentUser?.uid || null;
    originalMarkEpisodeAsWatched(animeId, episodeNumber);
    if (uid) scheduleCloudSync(uid);
};

const originalSetEpisodeHistory = storage.setEpisodeHistory;
storage.setEpisodeHistory = (history) => {
    const uid = auth?.currentUser?.uid || null;
    originalSetEpisodeHistory(history);
    if (uid) scheduleCloudSync(uid);
};

const originalMarkChapterAsRead = storage.markChapterAsRead;
storage.markChapterAsRead = (mangaId, chapterId) => {
    const uid = auth?.currentUser?.uid || null;
    originalMarkChapterAsRead(mangaId, chapterId);
    if (uid) scheduleCloudSync(uid);
};

const originalAddAnimeWatchTime = storage.addAnimeWatchTime;
storage.addAnimeWatchTime = (animeId, seconds) => {
    const uid = auth?.currentUser?.uid || null;
    originalAddAnimeWatchTime(animeId, seconds);
    if (uid) scheduleCloudSync(uid);
};

const originalAddAnimeWatchTimeTotal = storage.addAnimeWatchTimeTotal;
storage.addAnimeWatchTimeTotal = (seconds) => {
    const uid = auth?.currentUser?.uid || null;
    originalAddAnimeWatchTimeTotal(seconds);
    scheduleWatchTimeTotalIncrement(seconds, uid);
};

const originalSetAnimeGenreCache = storage.setAnimeGenreCache;
storage.setAnimeGenreCache = (cache) => {
    const uid = auth?.currentUser?.uid || null;
    originalSetAnimeGenreCache(cache);
    if (uid) scheduleCloudSync(uid);
};

const originalSetMangaGenreCache = storage.setMangaGenreCache;
storage.setMangaGenreCache = (cache) => {
    const uid = auth?.currentUser?.uid || null;
    originalSetMangaGenreCache(cache);
    if (uid) scheduleCloudSync(uid);
};

const originalRemoveFromContinueWatching = storage.removeFromContinueWatching;
storage.removeFromContinueWatching = (id) => {
    const uid = auth?.currentUser?.uid || null;
    originalRemoveFromContinueWatching(id);
    if (uid) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_WATCHING, id, uid);
    }
};

const originalRemoveFromContinueReading = storage.removeFromContinueReading;
storage.removeFromContinueReading = (id) => {
    const uid = auth?.currentUser?.uid || null;
    originalRemoveFromContinueReading(id);
    if (uid) {
        void deleteUserSubcollectionDoc(USER_SUBCOLLECTIONS.CONTINUE_READING, id, uid);
    }
};
