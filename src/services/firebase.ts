// Import the functions you need from the SDKs you need
import type { FirebaseApp } from "firebase/app";
import { initializeApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import { getAnalytics } from "firebase/analytics";
import type { Auth } from "firebase/auth";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredFirebaseKeys = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.storageBucket,
    firebaseConfig.messagingSenderId,
    firebaseConfig.appId,
];

const isFirebaseEnabled = requiredFirebaseKeys.every((value) => typeof value === 'string' && value.trim().length > 0);

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseEnabled) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();

    if (typeof window !== 'undefined') {
        analytics = getAnalytics(app);
    }
} else {
    console.info('[Firebase] Firebase config missing. Running in local-only mode.');
}

export { app, analytics, auth, db, googleProvider, isFirebaseEnabled };
