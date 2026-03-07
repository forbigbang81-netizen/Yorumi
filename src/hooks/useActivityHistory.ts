import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, onSnapshot, increment, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

export interface ActivityData {
    [dateString: string]: number; // "YYYY-MM-DD": count
}

export function useActivityHistory() {
    const { user } = useAuth();
    const [activityData, setActivityData] = useState<ActivityData>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setActivityData({});
            setLoading(false);
            return;
        }

        // We store activity in: users/{uid}/activity/history
        const activityRef = doc(db, 'users', user.uid, 'activity', 'history');

        const unsubscribe = onSnapshot(activityRef, (doc) => {
            if (doc.exists()) {
                setActivityData(doc.data() as ActivityData);
            } else {
                setActivityData({});
            }
            setLoading(false);
        }, (error) => {
            console.error("Failed to subscribe to activity history:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const recordActivity = useCallback(async (activityKey?: string) => {
        if (!user) return;

        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        const activityRef = doc(db, 'users', user.uid, 'activity', 'history');
        const normalizedKey = activityKey?.replace(/\//g, '_');
        const activitySeenRef = normalizedKey
            ? doc(db, 'users', user.uid, 'activitySeen', normalizedKey)
            : null;

        try {
            // Count unique chapter/episode only once when a dedupe key is provided.
            if (activitySeenRef) {
                const seenSnap = await getDoc(activitySeenRef);
                if (seenSnap.exists()) return;
            }

            const docSnap = await getDoc(activityRef);
            if (!docSnap.exists()) {
                await setDoc(activityRef, {
                    [dateString]: 1
                });
            } else {
                await updateDoc(activityRef, {
                    [dateString]: increment(1)
                });
            }

            if (activitySeenRef) {
                await setDoc(activitySeenRef, {
                    createdAt: Date.now(),
                    date: dateString
                });
            }
        } catch (error) {
            console.error("Failed to record activity:", error);
        }
    }, [user]);

    return {
        activityData,
        recordActivity,
        loading
    };
}
