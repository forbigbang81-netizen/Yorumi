import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage, type ReadProgress } from '../utils/storage';
import { useActivityHistory } from './useActivityHistory';

interface Manga {
    mal_id: number | string;
    title: string;
    status?: string;
    chapters?: number | null;
    images: {
        jpg: {
            image_url?: string;
            large_image_url: string;
        };
    };
}

interface Chapter {
    id: string;
    chapter: string; // "1" or "10.5"
    title?: string;
}

export function useContinueReading() {
    const { user } = useAuth();
    const { recordActivity } = useActivityHistory();
    const [continueReadingList, setContinueReadingList] = useState<ReadProgress[]>([]);

    const reload = useCallback(() => {
        setContinueReadingList(storage.getContinueReading());
    }, []);

    // Subscribe to local storage updates
    useEffect(() => {
        if (!user) {
            setContinueReadingList([]);
            return;
        }

        // Initial load
        reload();

        // Re-render whenever storage mutates
        window.addEventListener('yorumi-storage-updated', reload);
        return () => window.removeEventListener('yorumi-storage-updated', reload);
    }, [user, reload]);

    const saveProgress = useCallback(async (manga: Manga, chapter: Chapter) => {
        if (!user) return; // Only save if logged in

        const progress: ReadProgress = {
            mangaId: manga.mal_id.toString(),
            chapterId: chapter.id,
            chapterNumber: chapter.chapter,
            timestamp: Date.now(),
            lastRead: Date.now(),
            mangaTitle: manga.title,
            mangaImage: manga.images.jpg.large_image_url,
            mangaPoster: manga.images.jpg.image_url || manga.images.jpg.large_image_url,
            totalCount: typeof manga.chapters === 'number' && manga.chapters > 0 ? manga.chapters : undefined,
            mediaStatus: manga.status
        };

        storage.saveReadingProgress(progress);

        try {
            await recordActivity(`manga:${manga.mal_id}:ch:${progress.chapterNumber}`);
        } catch (error) {
            console.error("Failed to record read activity:", error);
        }
    }, [user, recordActivity]);

    const removeFromHistory = useCallback(async (mangaId: string) => {
        if (!user) return;
        storage.removeFromContinueReading(mangaId.toString());
    }, [user]);

    return {
        continueReadingList,
        saveProgress,
        removeFromHistory
    };
}
