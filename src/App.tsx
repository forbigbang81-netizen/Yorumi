import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from './app/AppRoutes';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/ui/ScrollToTop';
import { useTitleLanguage } from './context/TitleLanguageContext';
import { useNavbarSearch } from './features/search/hooks/useNavbarSearch';
import { useAnime } from './hooks/useAnime';

function App() {
    const navigate = useNavigate();
    const location = useLocation();
    const { closeViewAll } = useAnime();
    const { language } = useTitleLanguage();

    const queryParams = new URLSearchParams(location.search);
    const activeTab = location.pathname.startsWith('/manga')
        || queryParams.get('type') === 'manga'
        || queryParams.get('tab') === 'continue-reading'
        || queryParams.get('tab') === 'readlist'
        || queryParams.get('tab') === 'manga-overview'
        ? 'manga'
        : 'anime';

    const { searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching } = useNavbarSearch({
        activeTab,
        language,
    });

    useEffect(() => {
        if (!location.pathname.startsWith('/search')) {
            setSearchQuery('');
            setSearchResults([]);
        }
    }, [location.pathname, setSearchQuery, setSearchResults]);

    const handleTabChange = (tab: 'anime' | 'manga') => {
        if (tab === 'anime') {
            closeViewAll();
            navigate('/');
            return;
        }

        navigate('/manga');
    };

    const handleSearchSubmit = (e: React.FormEvent, queryOverride?: string) => {
        e.preventDefault();
        const queryToUse = (queryOverride ?? searchQuery).trim();
        if (!queryToUse) return;

        navigate(`/search?q=${encodeURIComponent(queryToUse)}&type=${activeTab}`);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleLogoClick = () => {
        closeViewAll();
        navigate(activeTab === 'manga' ? '/manga' : '/');
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        if (location.pathname === '/search') {
            navigate(activeTab === 'manga' ? '/manga' : '/');
        }
    };

    return (
        <div className={`min-h-screen bg-yorumi-bg text-white font-sans ${activeTab === 'manga' ? 'selection:bg-yorumi-manga' : 'selection:bg-yorumi-accent'} selection:text-white overflow-x-hidden`}>
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${activeTab === 'manga' ? 'bg-yorumi-manga/5' : 'bg-yorumi-accent/5'} rounded-full blur-[120px]`} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yorumi-main/5 rounded-full blur-[120px]" />
            </div>

            <Navbar
                activeTab={activeTab}
                searchQuery={searchQuery}
                onTabChange={handleTabChange}
                onSearchChange={setSearchQuery}
                onSearchSubmit={handleSearchSubmit}
                onClearSearch={handleClearSearch}
                onLogoClick={handleLogoClick}
                searchResults={searchResults}
                isSearching={isSearching}
            />

            <AppRoutes />

            <ScrollToTop activeTab={activeTab as 'anime' | 'manga'} />

            {!location.pathname.includes('/watch/') && !location.pathname.includes('/read/') && <Footer />}
        </div>
    );
}

export default App;
