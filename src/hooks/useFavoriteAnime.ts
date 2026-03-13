import { useState, useEffect, useCallback } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

export interface FavoriteAnimeItem {
    id: string;
    title: string;
    image: string;
    synopsis?: string;
    addedAt: number;
}

export function useFavoriteAnime() {
    const { user } = useAuth();
    const [favorites, setFavorites] = useState<FavoriteAnimeItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setFavorites([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'users', user.uid, 'favoriteAnime'),
            orderBy('addedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map((entry) => entry.data() as FavoriteAnimeItem);
            setFavorites(data);
            setLoading(false);
        }, () => {
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const addFavorite = useCallback(async (item: Omit<FavoriteAnimeItem, 'addedAt'>) => {
        if (!user) return;
        await setDoc(doc(db, 'users', user.uid, 'favoriteAnime', item.id), {
            ...item,
            addedAt: Date.now()
        });
    }, [user]);

    const removeFavorite = useCallback(async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'favoriteAnime', id));
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
