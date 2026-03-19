import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type TitleLanguage = 'eng' | 'jpy';

interface TitleLanguageContextValue {
    language: TitleLanguage;
    setLanguage: (language: TitleLanguage) => void;
    toggleLanguage: () => void;
}

const STORAGE_KEY = 'yorumi_title_language';

const TitleLanguageContext = createContext<TitleLanguageContextValue | undefined>(undefined);

export function TitleLanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<TitleLanguage>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === 'jpy' ? 'jpy' : 'eng';
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, language);
    }, [language]);

    const setLanguage = (nextLanguage: TitleLanguage) => {
        setLanguageState(nextLanguage);
    };

    const toggleLanguage = () => {
        setLanguageState((prev) => (prev === 'eng' ? 'jpy' : 'eng'));
    };

    const value = useMemo(
        () => ({ language, setLanguage, toggleLanguage }),
        [language]
    );

    return (
        <TitleLanguageContext.Provider value={value}>
            {children}
        </TitleLanguageContext.Provider>
    );
}

export function useTitleLanguage() {
    const context = useContext(TitleLanguageContext);
    if (!context) {
        throw new Error('useTitleLanguage must be used within a TitleLanguageProvider');
    }
    return context;
}
