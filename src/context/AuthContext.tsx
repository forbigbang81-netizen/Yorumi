import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User, signInWithPopup, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../services/firebase';
import { getDeterministicAvatar } from '../utils/avatars';
import { clearLegacyUnscopedProgressStorage, syncStorage } from '../utils/storage';

interface AuthContextType {
    user: User | null;
    avatar: string | null;
    banner: string | null;
    profileCardBackground: string | null;
    isLoading: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    updateName: (name: string) => Promise<void>;
    updateAvatar: (path: string) => Promise<void>;
    updateBanner: (path: string) => Promise<void>;
    updateProfileCardBackground: (path: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [avatar, setAvatar] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);
    const [profileCardBackground, setProfileCardBackground] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchUserProfile = async (uid: string) => {
        try {
            const docRef = doc(db, 'users', uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    avatar: (data.avatar as string) || null,
                    banner: (data.banner as string) || null,
                    profileCardBackground: (data.profileCardBackground as string) || null
                };
            }
        } catch (error) {
            console.error('Failed to fetch user profile from Firestore:', error);
        }
        return { avatar: null, banner: null, profileCardBackground: null };
    };

    const saveUserProfile = async (uid: string, values: { avatar?: string; banner?: string; profileCardBackground?: string; displayName?: string; email?: string; searchName?: string; creationTime?: string }) => {
        try {
            const docRef = doc(db, 'users', uid);
            await setDoc(docRef, values, { merge: true });
        } catch (error) {
            console.error('Failed to save user profile to Firestore:', error);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (currentUser) {
                // Only clear legacy unscoped keys. Scoped user data should survive refresh/sign-in.
                clearLegacyUnscopedProgressStorage();

                // Sync data from cloud
                try {
                    await syncStorage.pullFromCloud();
                } catch (e) {
                    console.error("Failed to sync on login", e);
                }

                // Persist searchable user info to Firestore for user search
                try {
                    await saveUserProfile(currentUser.uid, {
                        displayName: currentUser.displayName || '',
                        email: currentUser.email || '',
                        searchName: (currentUser.displayName || '').toLowerCase(),
                        creationTime: currentUser.metadata.creationTime || '',
                    });
                } catch (e) {
                    console.error('Failed to persist user search info:', e);
                }

                // 1. Optimistically load from LocalStorage for instant UI (No "D" flash)
                const storedAvatar = localStorage.getItem(`avatar_${currentUser.uid}`);
                const storedBanner = localStorage.getItem(`banner_${currentUser.uid}`);
                const storedProfileCardBackground = localStorage.getItem(`profile_card_bg_${currentUser.uid}`);
                if (storedAvatar) {
                    setAvatar(storedAvatar);
                }
                if (storedBanner) {
                    setBanner(storedBanner);
                }
                if (storedProfileCardBackground) {
                    setProfileCardBackground(storedProfileCardBackground);
                }

                // 2. Fetch from Backend (Source of Truth - Firestore) and update if different
                const profile = await fetchUserProfile(currentUser.uid);
                const dbAvatar = profile.avatar;
                const dbBanner = profile.banner;
                const dbProfileCardBackground = profile.profileCardBackground;

                if (dbAvatar) {
                    if (dbAvatar !== storedAvatar) {
                        setAvatar(dbAvatar);
                        localStorage.setItem(`avatar_${currentUser.uid}`, dbAvatar);
                    }
                } else {
                    // 3. If no DB avatar but we have local, sync local to DB
                    if (storedAvatar) {
                        saveUserProfile(currentUser.uid, { avatar: storedAvatar });
                    } else {
                        // 4. If neither, generate new random (deterministic based on UID)
                        const newAvatar = getDeterministicAvatar(currentUser.uid);
                        setAvatar(newAvatar);
                        saveUserProfile(currentUser.uid, { avatar: newAvatar });
                        localStorage.setItem(`avatar_${currentUser.uid}`, newAvatar);
                    }
                }

                const defaultBanner = '/anime-bg.png';
                if (dbBanner) {
                    if (dbBanner !== storedBanner) {
                        setBanner(dbBanner);
                        localStorage.setItem(`banner_${currentUser.uid}`, dbBanner);
                    }
                } else if (storedBanner) {
                    saveUserProfile(currentUser.uid, { banner: storedBanner });
                } else {
                    setBanner(defaultBanner);
                    saveUserProfile(currentUser.uid, { banner: defaultBanner });
                    localStorage.setItem(`banner_${currentUser.uid}`, defaultBanner);
                }

                if (dbProfileCardBackground) {
                    if (dbProfileCardBackground !== storedProfileCardBackground) {
                        setProfileCardBackground(dbProfileCardBackground);
                        localStorage.setItem(`profile_card_bg_${currentUser.uid}`, dbProfileCardBackground);
                    }
                } else if (storedProfileCardBackground) {
                    saveUserProfile(currentUser.uid, { profileCardBackground: storedProfileCardBackground });
                } else {
                    setProfileCardBackground(null);
                }
            } else {
                // Remove only legacy unscoped keys on sign-out.
                clearLegacyUnscopedProgressStorage();
                setAvatar(null);
                setBanner(null);
                setProfileCardBackground(null);
            }

            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed", error);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setAvatar(null);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const updateName = async (name: string) => {
        if (auth.currentUser) {
            try {
                await updateProfile(auth.currentUser, { displayName: name });
                setUser({ ...auth.currentUser, displayName: name });
                // Keep Firestore searchable fields in sync
                await saveUserProfile(auth.currentUser.uid, {
                    displayName: name,
                    searchName: name.toLowerCase(),
                });
            } catch (error) {
                console.error("Failed to update name", error);
                throw error;
            }
        }
    };

    const updateAvatar = async (newAvatarPath: string) => {
        setAvatar(newAvatarPath);

        if (auth.currentUser) {
            // Save to DB
            await saveUserProfile(auth.currentUser.uid, { avatar: newAvatarPath });
            // Keep legacy sync for now
            localStorage.setItem(`avatar_${auth.currentUser.uid}`, newAvatarPath);
        }
    };

    const updateBanner = async (newBannerPath: string) => {
        setBanner(newBannerPath);

        if (auth.currentUser) {
            await saveUserProfile(auth.currentUser.uid, { banner: newBannerPath });
            localStorage.setItem(`banner_${auth.currentUser.uid}`, newBannerPath);
        }
    };

    const updateProfileCardBackground = async (newBackgroundPath: string) => {
        setProfileCardBackground(newBackgroundPath);

        if (auth.currentUser) {
            await saveUserProfile(auth.currentUser.uid, { profileCardBackground: newBackgroundPath });
            localStorage.setItem(`profile_card_bg_${auth.currentUser.uid}`, newBackgroundPath);
        }
    };

    return (
        <AuthContext.Provider value={{ user, avatar, banner, profileCardBackground, isLoading, login, logout, updateName, updateAvatar, updateBanner, updateProfileCardBackground }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
