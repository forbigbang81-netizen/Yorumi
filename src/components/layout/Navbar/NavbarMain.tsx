import { useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Menu, ChevronLeft, Plus, Users } from 'lucide-react';
import { animeService } from '../../../services/animeService';
import { mangaService } from '../../../services/mangaService';
import { useAuth } from '../../../context/AuthContext';
import SearchBar from './SearchBar';
import NavToggle from './NavToggle';
import TitleLanguageToggle from './TitleLanguageToggle';
import UserMenu from './UserMenu';
import RandomButton from './RandomButton';
import NotificationsBell from './NotificationsBell';

interface NavbarProps {
    activeTab: 'anime' | 'manga';
    searchQuery: string;
    onTabChange: (tab: 'anime' | 'manga') => void;
    onSearchChange: (query: string) => void;
    onSearchSubmit: (e: React.FormEvent, queryOverride?: string) => void;
    onClearSearch: () => void;
    onLogoClick?: () => void;
    searchResults?: any[];
    isSearching?: boolean;
}

export default function Navbar({
    activeTab,
    searchQuery,
    onTabChange,
    onSearchChange,
    onSearchSubmit,
    onClearSearch,
    onLogoClick,
    searchResults = [],
    isSearching = false,
}: NavbarProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { login, logout, user, avatar } = useAuth();

    const [isScrolled, setIsScrolled] = useState(false);
    const [isLoadingRandom, setIsLoadingRandom] = useState(false);
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showMobileGenres, setShowMobileGenres] = useState(true);

    // Local input state for instant typing UX
    const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

    // Sync local state when prop changes (e.g. clear button from parent)
    useEffect(() => {
        setLocalSearchQuery(searchQuery);
    }, [searchQuery]);

    const handleLocalSearchChange = (value: string) => {
        setLocalSearchQuery(value);
        onSearchChange(value);
    };

    // Handle scroll for transparent navbar
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!showMobileMenu) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [showMobileMenu]);

    // Keyboard shortcut to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement !== searchInputRef.current) {
                e.preventDefault();
                searchInputRef.current?.focus();
                if (window.innerWidth < 768) {
                    setShowMobileSearch(true);
                }
            }
            if (e.key === 'Escape' && showMobileSearch) {
                setShowMobileSearch(false);
            }
            if (e.key === 'Escape' && showMobileMenu) {
                setShowMobileMenu(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showMobileSearch, showMobileMenu]);

    // Random handler
    const handleRandom = async () => {
        if (isLoadingRandom) return;
        setIsLoadingRandom(true);
        try {
            if (activeTab === 'manga') {
                const result = await mangaService.getRandomManga();
                if (result && result.id) {
                    navigate(`/manga/details/${result.id}`, { state: { fromRandom: true } });
                }
            } else {
                const result = await animeService.getRandomAnime();
                if (result && result.id) {
                    navigate(`/anime/details/${result.id}`, { state: { fromRandom: true } });
                }
            }
        } catch (error) {
            console.error('Failed to get random media:', error);
            const randomId = Math.floor(Math.random() * 50000) + 1;
            navigate(`/${activeTab}/details/${randomId}`, { state: { fromRandom: true } });
        } finally {
            setIsLoadingRandom(false);
        }
    };

    const handleResultSelect = (item: any) => {
        setLocalSearchQuery('');
        navigate(item.url);
        onClearSearch();
    };

    const handleMobileResultSelect = (item: any) => {
        setLocalSearchQuery('');
        navigate(item.url);
        onClearSearch();
        setShowMobileSearch(false);
    };

    const closeMobileOverlays = () => {
        setShowMobileMenu(false);
        setShowMobileSearch(false);
    };

    const handleMobileNavigate = (to: string) => {
        navigate(to);
        closeMobileOverlays();
    };

    const genreColors = [
        'text-[#cde6a4]', 'text-[#f5d57a]', 'text-[#ff9b86]', 'text-[#cab2ea]',
        'text-[#a0d0d7]', 'text-[#f6c3b6]', 'text-[#74d9c8]', 'text-[#c7e0a3]',
        'text-[#f3d67f]', 'text-[#ff8578]',
    ];
    const mobileGenres = ['Action', 'Adventure', 'Cars', 'Comedy', 'Dementia', 'Demons', 'Drama', 'Ecchi', 'Fantasy', 'Game'];
    const mobileMenuItems = activeTab === 'manga'
        ? [
            { label: 'Home', to: '/manga' },
            { label: 'Most Popular', to: '/manga/popular' },
            { label: 'Latest Updates', to: '/manga/latest' },
            { label: 'Manga Directory', to: '/manga/directory' },
            { label: 'New Manga', to: '/manga/new' },
            { label: 'Manhwa', to: '/manga/manhwa' },
            { label: 'One Shot', to: '/manga/one-shot' },
            { label: 'Community', to: '/users' },
            { label: 'Profile', to: '/profile?tab=manga-overview' },
        ]
        : [
            { label: 'Home', to: '/' },
            { label: 'Most Popular', to: '/anime/popular' },
            { label: 'Movies', to: '/anime/movies' },
            { label: 'TV Series', to: '/anime/tv' },
            { label: 'OVAs', to: '/anime/ova' },
            { label: 'ONAs', to: '/anime/ona' },
            { label: 'Specials', to: '/anime/specials' },
            { label: 'Community', to: '/users' },
            { label: 'Profile', to: '/profile?tab=anime-overview' },
        ];

    const handleClearAndFocus = () => {
        setLocalSearchQuery('');
        onClearSearch();
        searchInputRef.current?.focus();
    };

    const isTransparentPage = !location.pathname.includes('/manga/read') && !location.pathname.includes('/anime/watch');
    const communityHoverColor = activeTab === 'manga' ? 'group-hover:text-yorumi-manga' : 'group-hover:text-yorumi-accent';

    return (
        <>
        <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${isScrolled || !isTransparentPage
            ? 'bg-[#0a0a0a]/72 backdrop-blur-xl border-b border-transparent py-3'
            : 'bg-gradient-to-b from-black via-black/60 to-transparent border-transparent py-4'
            }`}>
            <div className="px-4 md:px-8 flex items-center justify-between">
                {/* LEFT: Logo + Search + Toggle + Random */}
                <div className="flex items-center gap-4 md:gap-6">
                    <button
                        onClick={() => {
                            setShowMobileMenu(true);
                            setShowMobileSearch(false);
                        }}
                        className="w-9 h-9 text-white/95 rounded-md flex items-center justify-center transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        {/* Logo */}
                    <div
                        onClick={onLogoClick || onClearSearch}
                        className="flex items-center cursor-pointer hover:opacity-90 transition-opacity select-none shrink-0"
                        role="button"
                        tabIndex={0}
                    >
                        <span className="text-xl md:text-2xl font-black text-white tracking-tighter">YORU</span>
                        <span className={`text-xl md:text-2xl font-black ${activeTab === 'manga' ? 'text-yorumi-manga' : 'text-yorumi-accent'} tracking-tighter`}>MI</span>
                    </div>

                        <div className="md:hidden">
                            <NavToggle
                                activeTab={activeTab}
                                onTabChange={onTabChange}
                                onClearSearch={onClearSearch}
                                variant="mobile"
                            />
                        </div>
                    </div>

                    {/* Desktop Search */}
                    <div className="hidden md:block max-w-xs w-full">
                        <SearchBar
                            ref={searchInputRef}
                            searchQuery={localSearchQuery}
                            searchResults={searchResults}
                            isSearching={isSearching}
                            onSearchChange={handleLocalSearchChange}
                            onSearchSubmit={(e) => {
                                onSearchSubmit(e, localSearchQuery);
                                setLocalSearchQuery('');
                                onClearSearch();
                            }}
                            onClearSearch={handleClearAndFocus}
                            onResultSelect={handleResultSelect}
                            theme={activeTab}
                        />
                    </div>

                    {/* Toggle & Random Controls */}
                    <div className="hidden md:flex items-center gap-6">
                        <NavToggle
                            activeTab={activeTab}
                            onTabChange={onTabChange}
                            onClearSearch={onClearSearch}
                        />
                        <TitleLanguageToggle theme={activeTab} />
                        <RandomButton
                            isLoading={isLoadingRandom}
                            onClick={handleRandom}
                            theme={activeTab}
                        />
                        <button
                            onClick={() => navigate('/users')}
                            className="group flex items-center justify-center p-2 text-gray-500 hover:text-white transition-colors"
                            title="Community"
                            aria-label="Community"
                        >
                            <Users className={`w-5 h-5 transition-all duration-300 ${communityHoverColor} group-hover:-translate-y-0.5 group-hover:scale-110`} />
                        </button>
                    </div>
                </div>

                {/* RIGHT: Login + Mobile Controls */}
                <div className="flex items-center justify-end gap-2 md:gap-4 shrink-0">
                    {/* Mobile Search Icon */}
                    <button
                        onClick={() => {
                            setShowMobileSearch(!showMobileSearch);
                            setShowMobileMenu(false);
                        }}
                        className="md:hidden text-white p-2 md:hover:bg-white/10 active:bg-white/10 rounded-full transition-colors outline-none focus:outline-none"
                    >
                        {showMobileSearch ? (
                            <X className="w-5 h-5" />
                        ) : (
                            <Search className="w-5 h-5" />
                        )}
                    </button>

                    <NotificationsBell visible={Boolean(user)} theme={activeTab} />

                    <UserMenu
                        user={user}
                        avatar={avatar}
                        activeTab={activeTab}
                        onLogin={login}
                        onLogout={logout}
                    />
                </div>
            </div>

            {/* Mobile Search Bar & Controls Overlay */}
            <div className={`
                md:hidden overflow-hidden transition-all duration-300 ease-in-out
                ${showMobileSearch ? 'max-h-40 opacity-100 border-t border-white/5 bg-yorumi-bg/95 backdrop-blur-md' : 'max-h-0 opacity-0'}
            `}>
                <div className="p-4 space-y-4">
                    <SearchBar
                        searchQuery={localSearchQuery}
                        searchResults={searchResults}
                        isSearching={isSearching}
                        onSearchChange={handleLocalSearchChange}
                        onSearchSubmit={(e) => {
                            onSearchSubmit(e, localSearchQuery);
                            setLocalSearchQuery('');
                            onClearSearch();
                            setShowMobileSearch(false);
                        }}
                        onClearSearch={onClearSearch}
                        onResultSelect={handleMobileResultSelect}
                        showShortcut={false}
                        autoFocus={showMobileSearch}
                        theme={activeTab}
                    />

                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            
                            <TitleLanguageToggle
                                variant="mobile"
                                onClose={() => setShowMobileSearch(false)}
                                theme={activeTab}
                            />
                        </div>
                        <RandomButton
                            isLoading={isLoadingRandom}
                            onClick={() => { handleRandom(); setShowMobileSearch(false); }}
                            variant="mobile"
                            theme={activeTab}
                        />
                        <button
                            onClick={() => handleMobileNavigate('/users')}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white bg-[#1c1c1c] rounded border border-transparent hover:border-white/10 transition-all"
                        >
                            <Users className="w-3.5 h-3.5" />
                            Community
                        </button>
                    </div>
                </div>
            </div>
        </nav>

        <div className={`fixed inset-0 z-[120] transition-all duration-300 ${showMobileMenu ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div
                onClick={() => setShowMobileMenu(false)}
                className={`absolute inset-0 menu-backdrop-blur transition-opacity duration-300 ${showMobileMenu ? 'opacity-100 bg-black/55 backdrop-blur-sm' : 'opacity-0'}`}
            />
            <aside className={`absolute top-0 left-0 h-full w-[82vw] max-w-[360px] md:w-[360px] menu-panel-blur bg-black/40 border-r border-white/5 backdrop-blur-2xl transition-transform duration-300 flex flex-col ${showMobileMenu ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="h-[60px] shrink-0 border-b border-white/5 flex items-center px-3">
                    <button
                        onClick={() => setShowMobileMenu(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 hover:bg-white/15 transition-colors font-semibold outline-none"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Close menu
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {mobileMenuItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => handleMobileNavigate(item.to)}
                            className={`w-full text-left px-4 py-6 text-[15px] md:text-[16px] leading-none font-bold tracking-tight text-white/90 hover:bg-white/5 transition-colors border-b border-white/5 outline-none ${activeTab === 'anime' ? 'hover:text-yorumi-accent' : 'hover:text-yorumi-manga'}`}
                        >
                            {item.label}
                        </button>
                    ))}

                    <div className="border-b border-white/5">
                        <button
                            onClick={() => setShowMobileGenres((v) => !v)}
                            className={`w-full text-left px-4 py-6 text-[15px] md:text-[16px] leading-none font-bold tracking-tight text-white/90 hover:bg-white/5 transition-colors flex items-center justify-between outline-none ${activeTab === 'anime' ? 'hover:text-yorumi-accent' : 'hover:text-yorumi-manga'}`}
                        >
                            Genre
                            <span className={`text-base transition-transform ${showMobileGenres ? 'rotate-45' : ''}`}>
                                <Plus className="w-4 h-4" />
                            </span>
                        </button>

                        <div className={`overflow-hidden transition-all duration-300 ${showMobileGenres ? 'max-h-[320px] pb-4' : 'max-h-0'}`}>
                            <div className="grid grid-cols-2 gap-y-3 px-4 pt-2">
                                {mobileGenres.map((genre, idx) => (
                                    <button
                                        key={genre}
                                        onClick={() => handleMobileNavigate(activeTab === 'manga' ? `/manga/genre/${encodeURIComponent(genre)}` : `/genre/${encodeURIComponent(genre)}`)}
                                        className={`text-left text-[14px] md:text-[15px] font-semibold ${genreColors[idx % genreColors.length]} hover:opacity-80 transition-opacity outline-none`}
                                    >
                                        {genre}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
        </>
    );
}
