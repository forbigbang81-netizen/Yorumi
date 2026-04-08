import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AnimeProvider } from '../context/AnimeContext';
import { AuthProvider } from '../context/AuthContext';
import { TitleLanguageProvider } from '../context/TitleLanguageContext';

export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <BrowserRouter>
            <AuthProvider>
                <TitleLanguageProvider>
                    <AnimeProvider>{children}</AnimeProvider>
                </TitleLanguageProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
