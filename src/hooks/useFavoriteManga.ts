import { useState, useEffect, useCallback } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

export interface FavoriteMangaItem {
    id: string;
    title: string;
    image: string;
    addedAt: number;
}

export function useFavoriteManga() {
    const { user } = useAuth();
    const [favorites, setFavorites] = useState<FavoriteMangaItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setFavorites([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'users', user.uid, 'favoriteManga'),
            orderBy('addedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map((entry) => entry.data() as FavoriteMangaItem);
            setFavorites(data);
            setLoading(false);
        }, () => {
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const addFavorite = useCallback(async (item: Omit<FavoriteMangaItem, 'addedAt'>) => {
        if (!user) return;
        await setDoc(doc(db, 'users', user.uid, 'favoriteManga', item.id), {
            ...item,
            addedAt: Date.now()
        });
    }, [user]);

    const removeFavorite = useCallback(async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'favoriteManga', id));
    }, [user]);

    const isFavorite = useCallback((id: string) => favorites.some((entry) => entry.id === id), [favorites]);

    return {
        favorites,
        loading,
        addFavorite,
        removeFavorite,
        isFavorite
    };
}

