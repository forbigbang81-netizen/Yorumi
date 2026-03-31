import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage, type WatchListItem } from '../utils/storage';

export function useWatchList() {
    const { user } = useAuth();
    const [watchList, setWatchList] = useState<WatchListItem[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        setWatchList(storage.getWatchList());
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!user) {
            setWatchList([]);
            setLoading(false);
            return;
        }

        // Initial load
        reload();

        // Re-render whenever storage mutates
        window.addEventListener('yorumi-storage-updated', reload);
        return () => window.removeEventListener('yorumi-storage-updated', reload);
    }, [user, reload]);

    const addToWatchList = useCallback((item: Omit<WatchListItem, 'addedAt'>) => {
        if (!user) return;
        storage.addToWatchList(item, item.status || 'watching');
    }, [user]);

    const removeFromWatchList = useCallback((id: string) => {
        if (!user) return;
        storage.removeFromWatchList(id);
    }, [user]);

    const isInWatchList = useCallback((id: string) => {
        return watchList.some(item => item.id === id);
    }, [watchList]);

    return {
        watchList,
        loading,
        addToWatchList,
        removeFromWatchList,
        isInWatchList
    };
}
