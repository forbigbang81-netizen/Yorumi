import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
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
            await runTransaction(db, async (tx) => {
                // Count unique chapter/episode only once when a dedupe key is provided.
                if (activitySeenRef) {
                    const seenSnap = await tx.get(activitySeenRef);
                    if (seenSnap.exists()) return;
                }

                const historySnap = await tx.get(activityRef);
                const currentCount = historySnap.exists()
                    ? Number((historySnap.data() as ActivityData)[dateString] || 0)
                    : 0;

                tx.set(activityRef, {
                    [dateString]: currentCount + 1
                }, { merge: true });

                if (activitySeenRef) {
                    tx.set(activitySeenRef, {
                        createdAt: Date.now(),
                        date: dateString
                    });
                }
            });
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
