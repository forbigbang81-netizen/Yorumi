import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import AnimeFormatPage from './pages/AnimeFormatPage';
import AnimeDetailsPage from './pages/AnimeDetailsPage';
import MangaDetailsPage from './pages/MangaDetailsPage';
import WatchPage from './pages/WatchPage';
import MangaReaderPage from './pages/MangaReaderPage';
import SearchPage from './pages/SearchPage';
import MangaPage from './pages/MangaPage';
import GenrePage from './pages/GenrePage';
import MangaGenrePage from './pages/MangaGenrePage';
import ProfilePage from './pages/ProfilePage';
import UserSearchPage from './pages/UserSearchPage';
import UserProfilePage from './pages/UserProfilePage';
import ContinueWatchingPage from './pages/ContinueWatchingPage';
import WatchListPage from './pages/WatchListPage';
import FavoriteAnimePage from './pages/FavoriteAnimePage';
import MangaContinueReadingPage from './pages/MangaContinueReadingPage';
import MangaReadListPage from './pages/MangaReadListPage';
import FavoriteMangaPage from './pages/FavoriteMangaPage';
import MangaFormatPage from './pages/MangaFormatPage';
import Footer from './components/layout/Footer';
import { useAnime } from './hooks/useAnime';
import { animeService } from './services/animeService';
import { mangaService } from './services/mangaService';
import ScrollToTop from './components/ui/ScrollToTop';
import { useTitleLanguage } from './context/TitleLanguageContext';
import { getDisplayTitle, getSecondaryTitle } from './utils/titleLanguage';
import { useDebounce } from './hooks/useDebounce';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { closeViewAll } = useAnime();
  const { language } = useTitleLanguage();
  const searchRequestIdRef = useRef(0);
  const searchCacheRef = useRef(new Map<string, { data: any[]; timestamp: number }>());
  const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
  const debouncedSearchQuery = useDebounce(searchQuery, 280);
  const isAnimePaheSession = (value: unknown) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

  // Derive active tab from URL or Query Params (to persist state on Search Page)
  const queryParams = new URLSearchParams(location.search);
  const activeTab = location.pathname.startsWith('/manga')
    || queryParams.get('type') === 'manga'
    || queryParams.get('tab') === 'continue-reading'
    || queryParams.get('tab') === 'readlist'
    || queryParams.get('tab') === 'manga-overview'
    ? 'manga' : 'anime';

  // Perform search when debounced term changes
  useEffect(() => {
    const performSearch = async () => {
      const term = debouncedSearchQuery.trim();
      if (term.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      const cacheKey = `${activeTab}:${language}:${term.toLowerCase()}`;
      const cached = searchCacheRef.current.get(cacheKey);
      const now = Date.now();
      if (cached && (now - cached.timestamp) < SEARCH_CACHE_TTL_MS) {
        setSearchResults(cached.data);
        setIsSearching(false);
        return;
      }

        const requestId = ++searchRequestIdRef.current;
      setIsSearching(true);
      try {
        if (activeTab === 'anime') {
          const { data } = await animeService.searchAnimeScraper(term, 1, 6);
          const mapped = data.slice(0, 4).map((item: any) => ({
            id: item.scraperId || item.id,
            title: getDisplayTitle(item, language),
            subtitle: getSecondaryTitle(item, language),
            image: item.images.jpg.image_url,
            date: item.aired?.string ? item.aired.string : item.year,
            type: item.type, // e.g., TV
            duration: item.duration || null,
            url: item.scraperId && isAnimePaheSession(item.scraperId) ? `/anime/details/s:${item.scraperId}` : `/anime/details/${item.id}`
          }));
          if (requestId !== searchRequestIdRef.current) return;
          setSearchResults(mapped);
          searchCacheRef.current.set(cacheKey, { data: mapped, timestamp: Date.now() });
        } else {
          const { data } = await mangaService.searchMangaScraper(term, 1, 6);
          const mapped = data.slice(0, 4).map((item: any) => ({
            id: item.id || item.mal_id,
            title: getDisplayTitle(item, language),
            subtitle: item.latestChapter || getSecondaryTitle(item, language),
            image: item.images.jpg.image_url,
            date: item.published?.string ? new Date(item.published.string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
            type: item.type, // e.g., MANGA
            duration: null, // Manga doesn't have duration
            url: `/manga/details/${item.id || item.mal_id}`
          }));
          if (requestId !== searchRequestIdRef.current) return;
          setSearchResults(mapped);
          searchCacheRef.current.set(cacheKey, { data: mapped, timestamp: Date.now() });
        }
      } catch (error) {
        console.error("Search failed:", error);
        if (requestId === searchRequestIdRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    };

    performSearch();
  }, [debouncedSearchQuery, activeTab, language]);
  useEffect(() => {
    if (!location.pathname.startsWith('/search')) {
      // Don't clear query here as it might clear while user is typing if they navigate?
      // Actually, existing logic: if NOT on search page, clear query.
      // But we want to keep the query if the specific user interaction (like clicking outside) hasn't happened.
      // However, for now, let's keep it but ensure we don't clear it unnecessarily.
      // If we are navigating TO a page (like details), we probably want to clear it.
      // But if we are just staying on the same page...

      // Original logic was fine for "resetting" state when navigating away from search page.
      // But now we have a dropdown on EVERY page.
      // If I click a result, I navigate. After navigation, I probably want the search to clear.

      // Let's modify: Only clear if we just navigated and NOT just typing.
      // Actually, let's trust the existing logic for now, but be careful.
      // existing: setSearchQuery('');
      // This runs on EVERY location change.
    }
    // If we navigate to a details page, we want the search bar to clear? Yes.
    // So this is probably fine.
    if (!location.pathname.startsWith('/search')) {
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [location.pathname]);

  const handleTabChange = (tab: 'anime' | 'manga') => {
    if (tab === 'anime') {
      closeViewAll();
      navigate('/');
    }
    else navigate('/manga');
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
    // If on search page, navigate back to home
    if (location.pathname === '/search') {
      navigate(activeTab === 'manga' ? '/manga' : '/');
    }
  };

  return (
    <div className={`min-h-screen bg-yorumi-bg text-white font-sans ${activeTab === 'manga' ? 'selection:bg-yorumi-manga' : 'selection:bg-yorumi-accent'} selection:text-white overflow-x-hidden`}>
      {/* Background Gradients */}
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

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/anime/popular" element={<AnimeFormatPage />} />
        <Route path="/anime/movies" element={<AnimeFormatPage />} />
        <Route path="/anime/tv" element={<AnimeFormatPage />} />
        <Route path="/anime/ova" element={<AnimeFormatPage />} />
        <Route path="/anime/ona" element={<AnimeFormatPage />} />
        <Route path="/anime/specials" element={<AnimeFormatPage />} />
        <Route path="/anime/details/:id" element={<AnimeDetailsPage />} />
        <Route path="/anime/watch/:title/:id" element={<WatchPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/manga" element={<MangaPage />} />
        <Route path="/manga/details/:id" element={<MangaDetailsPage />} />
        <Route path="/manga/read/:title/:id/:chapter" element={<MangaReaderPage />} />
        <Route path="/genre/:name" element={<GenrePage />} />
        <Route path="/manga/genre/:name" element={<MangaGenrePage />} />
        <Route path="/manga/popular" element={<MangaFormatPage />} />
        <Route path="/manga/latest" element={<MangaFormatPage />} />
        <Route path="/manga/directory" element={<MangaFormatPage />} />
        <Route path="/manga/new" element={<MangaFormatPage />} />
        <Route path="/manga/manhwa" element={<MangaFormatPage />} />
        <Route path="/manga/one-shot" element={<MangaFormatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/users" element={<UserSearchPage />} />
        <Route path="/user/:uid" element={<UserProfilePage />} />
        <Route path="/anime/continue-watching" element={<ContinueWatchingPage />} />
        <Route path="/anime/watch-list" element={<WatchListPage />} />
        <Route path="/anime/favorites" element={<FavoriteAnimePage />} />
        <Route path="/manga/continue-reading" element={<MangaContinueReadingPage />} />
        <Route path="/manga/read-list" element={<MangaReadListPage />} />
        <Route path="/manga/favorites" element={<FavoriteMangaPage />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Scroll to Top Button */}
      <ScrollToTop activeTab={activeTab as 'anime' | 'manga'} />

      {!location.pathname.includes('/watch/') && !location.pathname.includes('/read/') && <Footer />}
    </div>
  );
}

export default App;
