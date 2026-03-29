import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Pagination from '../components/ui/Pagination';

// Feature Components
import MangaSpotlight from '../features/manga/components/MangaSpotlight';
import PopularManhwa from '../features/manga/components/PopularManhwa';
import AllTimePopularManga from '../features/manga/components/AllTimePopularManga';
import Top100Manga from '../features/manga/components/Top100Manga';
import LatestMangaUpdates from '../features/manga/components/LatestMangaUpdates';
import MangaCard from '../features/manga/components/MangaCard';
import Genres from '../features/anime/components/Genres';
import { useManga } from '../hooks/useManga';
import { useContinueReading } from '../hooks/useContinueReading';
import { slugify } from '../utils/slugify';
import type { Manga } from '../types/manga';
import MangaContinueReading from '../features/manga/components/MangaContinueReading';

export default function MangaPage() {
    const navigate = useNavigate();
    const manga = useManga();
    const { continueReadingList, removeFromHistory } = useContinueReading();


    const handleReadClick = (mangaId: string, mangaTitle: string, chapterNumber: string) => {
        const titleSlug = slugify(mangaTitle || 'manga');
        navigate(`/manga/read/${titleSlug}/${mangaId}/c${chapterNumber}`);
    };

    const handleRemoveFromHistory = (mangaId: string) => {
        removeFromHistory(mangaId);
    };

    const handleContinueReadingViewAll = () => {
        // We can reuse the viewMode pattern if we want, or navigate to a dedicated page
        // For now, there is already a /manga/continue-reading route in App.tsx
        navigate('/manga/continue-reading');
    };



    const handleSpotlightClick = (mangaId: string, autoRead?: boolean, mangaData?: Manga) => {
        navigate(`/manga/details/${mangaId}`, { state: { autoRead, manga: mangaData } });
    };

    const handleMangaClick = (item: Manga) => {
        navigate(`/manga/details/${item.id || item.mal_id}`, { state: { manga: item } });
    };

    // Get the title for View All based on viewMode
    const getViewAllTitle = () => {
        switch (manga.viewMode) {
            case 'popular_manhwa': return 'Popular Manhwa';
            case 'all_time_popular': return 'All Time Popular';
            case 'top_100': return 'Top 100 Manga';
            default: return '';
        }
    };

    // View All Mode - Shows full grid with pagination
    if (manga.viewMode !== 'default') {
        return (
            <div className="container mx-auto px-4 pt-24 pb-12 min-h-screen">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={manga.closeViewAll}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <h2 className="text-2xl font-black text-white tracking-wide uppercase">{getViewAllTitle()}</h2>
                </div>

                {manga.viewAllLoading ? (
                    <div className="animate-pulse">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {Array.from({ length: 18 }).map((_, idx) => (
                                <div key={idx}>
                                    <div className="aspect-[2/3] rounded-lg bg-white/10 mb-3" />
                                    <div className="h-4 w-4/5 rounded bg-white/10" />
                                    <div className="h-4 w-3/5 rounded bg-white/10 mt-2" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {manga.viewAllManga.map((item) => (
                                <MangaCard
                                    key={item.id || item.mal_id}
                                    manga={item}
                                    onClick={() => handleMangaClick(item)}
                                />
                            ))}
                        </div>

                        <Pagination
                            currentPage={manga.viewAllPagination.currentPage}
                            lastPage={manga.viewAllPagination.lastPage}
                            onPageChange={manga.changeViewAllPage}
                        />
                    </>
                )}
            </div>
        );
    }

    // Default Mode - Shows carousels
    return (
        <div className="min-h-screen pb-20">
            {/* Spotlight Hero Section */}
            <MangaSpotlight onMangaClick={handleSpotlightClick} />

            {/* Continue Reading Section */}
            <div className="container mx-auto px-4 mt-8">
                <MangaContinueReading
                    items={continueReadingList}
                    onReadClick={handleReadClick}
                    onRemove={handleRemoveFromHistory}
                    onViewAll={handleContinueReadingViewAll}
                />
            </div>

            {/* Popular Manhwa Carousel */}
            <PopularManhwa
                onMangaClick={handleSpotlightClick}
                onViewAll={() => manga.openViewAll('popular_manhwa')}
            />

            {/* All Time Popular Manga Carousel */}
            <AllTimePopularManga
                onMangaClick={handleSpotlightClick}
                onViewAll={() => manga.openViewAll('all_time_popular')}
            />

            {/* Top 100 Manga Carousel (replaces Manga Catalog grid) */}
            <Top100Manga
                onMangaClick={handleSpotlightClick}
                onViewAll={() => manga.openViewAll('top_100')}
            />

            {/* Latest Updates & Genres Section */}
            <div className="container mx-auto px-4 mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Latest Updates (Left - 2/3) */}
                <div className="lg:col-span-2">
                    <LatestMangaUpdates
                        onMangaClick={handleSpotlightClick}
                    />
                </div>

                {/* Genres (Right - 1/3) */}
                <div>
                    <Genres onGenreClick={(genre) => navigate(`/manga/genre/${encodeURIComponent(genre)}`)} theme="manga" />
                </div>
            </div>
        </div>
    );
}
