import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface PublicUserProfile {
    uid: string;
    displayName: string;
    email: string;
    avatar: string | null;
    banner: string | null;
    profileCardBackground: string | null;
    creationTime: string | null;
    // Lists synced by syncStorage
    watchList: any[];
    readList: any[];
    continueWatching: any[];
    continueReading: any[];
    episodeHistory: Record<string, number[]>;
    chapterHistory: Record<string, string[]>;
    animeWatchTime: Record<string, number>;
    animeWatchTimeTotalSeconds: number;
    animeGenreCache: Record<string, string[]>;
    animeCompletionCache: Record<string, { title?: string; totalCount?: number; mediaStatus?: string }>;
    mangaCompletionCache: Record<string, { title?: string; totalCount?: number; mediaStatus?: string }>;
    mangaGenreCache: Record<string, string[]>;
    // Subcollection data fetched separately
    activityHistory: Record<string, number>;
    favoriteAnime: any[];
    favoriteManga: any[];
}

export const userSearchService = {
    /**
     * Search users by display name prefix (case-insensitive).
     * Uses the `searchName` field (lowercased) for Firestore range queries.
     */
    searchUsers: async (queryStr: string, maxResults = 12): Promise<PublicUserProfile[]> => {
        try {
            const normalised = queryStr.trim().toLowerCase();
            if (normalised.length < 2) return [];

            // Firestore prefix range: searchName >= query AND searchName < query + '\uf8ff'
            const usersRef = collection(db, 'users');
            const q = query(
                usersRef,
                where('searchName', '>=', normalised),
                where('searchName', '<=', normalised + '\uf8ff'),
                orderBy('searchName'),
                limit(maxResults),
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    uid: docSnap.id,
                    displayName: data.displayName || 'Unknown',
                    email: data.email || '',
                    avatar: data.avatar || null,
                    banner: data.banner || null,
                    profileCardBackground: data.profileCardBackground || null,
                    creationTime: data.creationTime || null,
                    watchList: data.watchList || [],
                    readList: data.readList || [],
                    continueWatching: data.continueWatching || [],
                    continueReading: data.continueReading || [],
                    episodeHistory: data.episodeHistory || {},
                    chapterHistory: data.chapterHistory || {},
                    animeWatchTime: data.animeWatchTime || {},
                    animeWatchTimeTotalSeconds: data.animeWatchTimeTotalSeconds || 0,
                    animeGenreCache: data.animeGenreCache || {},
                    animeCompletionCache: data.animeCompletionCache || {},
                    mangaCompletionCache: data.mangaCompletionCache || {},
                    mangaGenreCache: data.mangaGenreCache || {},
                } as PublicUserProfile;
            });
        } catch (error) {
            console.error('Failed to search users:', error);
            return [];
        }
    },

    /**
     * Get a list of users for the discovery page when not searching.
     */
    getDiscoverUsers: async (maxResults = 20): Promise<PublicUserProfile[]> => {
        try {
            const usersRef = collection(db, 'users');
            const q = query(
                usersRef,
                limit(maxResults)
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    uid: docSnap.id,
                    displayName: data.displayName || 'Unknown',
                    email: data.email || '',
                    avatar: data.avatar || null,
                    banner: data.banner || null,
                    profileCardBackground: data.profileCardBackground || null,
                    creationTime: data.creationTime || null,
                    watchList: data.watchList || [],
                    readList: data.readList || [],
                    continueWatching: data.continueWatching || [],
                    episodeHistory: data.episodeHistory || {},
                    chapterHistory: data.chapterHistory || {},
                    animeWatchTime: data.animeWatchTime || {},
                    animeWatchTimeTotalSeconds: data.animeWatchTimeTotalSeconds || 0,
                    animeGenreCache: data.animeGenreCache || {},
                    animeCompletionCache: data.animeCompletionCache || {},
                    mangaCompletionCache: data.mangaCompletionCache || {},
                    mangaGenreCache: data.mangaGenreCache || {},
                } as PublicUserProfile;
            });
        } catch (error) {
            console.error('Failed to get discover users:', error);
            return [];
        }
    },

    /**
     * Get a single user's public profile by UID.
     * Subcollections (favoriteAnime, favoriteManga, activityHistory) are fetched
     * independently and fail gracefully if permissions are missing.
     */
    getUserProfile: async (uid: string): Promise<PublicUserProfile | null> => {
        try {
            // Main user document — this MUST succeed
            const docRef = doc(db, 'users', uid);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return null;

            const data = docSnap.data();

            // Subcollections — each resolves to a fallback if denied
            const activityRef = doc(db, 'users', uid, 'activity', 'history');
            const favAnimeRef = collection(db, 'users', uid, 'favoriteAnime');
            const favMangaRef = collection(db, 'users', uid, 'favoriteManga');

            const [activityResult, favAnimeResult, favMangaResult] = await Promise.allSettled([
                getDoc(activityRef),
                getDocs(query(favAnimeRef, orderBy('addedAt', 'desc'))),
                getDocs(query(favMangaRef, orderBy('addedAt', 'desc'))),
            ]);

            const activityHistory: Record<string, number> =
                activityResult.status === 'fulfilled' && activityResult.value.exists()
                    ? (activityResult.value.data() as Record<string, number>)
                    : {};

            const favoriteAnime: any[] =
                favAnimeResult.status === 'fulfilled'
                    ? favAnimeResult.value.docs.map(d => d.data())
                    : [];

            const favoriteManga: any[] =
                favMangaResult.status === 'fulfilled'
                    ? favMangaResult.value.docs.map(d => d.data())
                    : [];

            if (activityResult.status === 'rejected') console.warn('Could not load activity history (check Firestore rules):', activityResult.reason);
            if (favAnimeResult.status === 'rejected') console.warn('Could not load favoriteAnime (check Firestore rules):', favAnimeResult.reason);
            if (favMangaResult.status === 'rejected') console.warn('Could not load favoriteManga (check Firestore rules):', favMangaResult.reason);

            return {
                uid: docSnap.id,
                displayName: data.displayName || 'Unknown',
                email: data.email || '',
                avatar: data.avatar || null,
                banner: data.banner || null,
                profileCardBackground: data.profileCardBackground || null,
                creationTime: data.creationTime || null,
                watchList: data.watchList || [],
                readList: data.readList || [],
                continueWatching: data.continueWatching || [],
                continueReading: data.continueReading || [],
                episodeHistory: data.episodeHistory || {},
                chapterHistory: data.chapterHistory || {},
                animeWatchTime: data.animeWatchTime || {},
                animeWatchTimeTotalSeconds: data.animeWatchTimeTotalSeconds || 0,
                animeGenreCache: data.animeGenreCache || {},
                animeCompletionCache: data.animeCompletionCache || {},
                mangaCompletionCache: data.mangaCompletionCache || {},
                mangaGenreCache: data.mangaGenreCache || {},
                activityHistory,
                favoriteAnime,
                favoriteManga,
            } as PublicUserProfile;
        } catch (error) {
            console.error('Failed to get user profile:', error);
            return null;
        }
    },
};
