import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage, type ReadListItem } from '../utils/storage';

export function useReadList() {
    const { user } = useAuth();
    const [readList, setReadList] = useState<ReadListItem[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        setReadList(storage.getReadList());
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!user) {
            setReadList([]);
            setLoading(false);
            return;
        }

        // Initial load
        reload();

        // Re-render whenever storage mutates
        window.addEventListener('yorumi-storage-updated', reload);
        return () => window.removeEventListener('yorumi-storage-updated', reload);
    }, [user, reload]);

    const addToReadList = useCallback((item: Omit<ReadListItem, 'addedAt'>) => {
        if (!user) return;
        storage.addToReadList(item, item.status || 'reading');
    }, [user]);

    const removeFromReadList = useCallback((id: string) => {
        if (!user) return;
        storage.removeFromReadList(id);
    }, [user]);

    const isInReadList = useCallback((id: string) => {
        return readList.some(item => item.id === id);
    }, [readList]);

    return {
        readList,
        loading,
        addToReadList,
        removeFromReadList,
        isInReadList
    };
}
