import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { mangaService } from '../services/mangaService';
import type { Manga } from '../types/manga';
import MangaCard from '../features/manga/components/MangaCard';
import MangaCardSkeleton from '../features/manga/components/MangaCardSkeleton';
import Pagination from '../components/ui/Pagination';

const FORMAT_CONFIG: Record<string, { label: string; fetchMethod: (page: number) => Promise<{ data: Manga[]; pagination: { last_visible_page: number; current_page: number; has_next_page: boolean } }>; provider: 'anilist' | 'mangakatana' }> = {
    popular:    { label: 'Most Popular',    fetchMethod: (p) => mangaService.getPopularManga(p), provider: 'anilist' },
    latest:     { label: 'Latest Updates',  fetchMethod: (p) => mangaService.getLatestMangaScraper(p), provider: 'mangakatana' },
    directory:  { label: 'Manga Directory', fetchMethod: (p) => mangaService.getMangaDirectory(p), provider: 'mangakatana' },
    new:        { label: 'New Manga',       fetchMethod: (p) => mangaService.getNewMangaScraper(p), provider: 'mangakatana' },
    manhwa:     { label: 'Popular Manhwa', fetchMethod: (p) => mangaService.getPopularManhwa(p), provider: 'anilist' },
    'one-shot': { label: 'One Shots',       fetchMethod: (p) => mangaService.getOneShotManga(p), provider: 'anilist' },
};

export default function MangaFormatPage() {
    const location = useLocation();
    const format = location.pathname.split('/').pop() || '';
    const navigate = useNavigate();

    const config = FORMAT_CONFIG[format];

    const [mangaList, setMangaList] = useState<Manga[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);

    const fetchData = useCallback(async (page: number, isNewFormat = false) => {
        if (!config) return;
        
        // Only show full-grid skeletons if transition is a major context switch (new format or initial mount)
        if (isNewFormat) {
            setIsLoading(true);
            setMangaList([]); // Clear list on format change to trigger skeletons
        }

        try {
            const result = await config.fetchMethod(page);
            setMangaList(result?.data ?? []);
            setLastPage(result?.pagination?.last_visible_page ?? 1);
        } catch (e) {
            console.error('MangaFormatPage fetch error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [format]); // Depend on format instead of config object

    useEffect(() => {
        setCurrentPage(1);
        fetchData(1, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [format, fetchData]);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        fetchData(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleMangaClick = (item: Manga) => {
        const id = item.id || item.mal_id;
        navigate(`/manga/details/${id}`, { state: { manga: item } });
    };

    if (!config) {
        return (
            <div className="min-h-screen flex items-center justify-center text-white/60">
                Unknown format.
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20 pt-24">
            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-1 h-7 bg-yorumi-manga rounded-full" />
                    <div className="flex flex-col">
                        <h1 className="text-2xl font-black text-white tracking-wide uppercase">
                            {config.label}
                        </h1>
                    </div>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <MangaCardSkeleton key={i} />
                        ))}
                    </div>
                ) : mangaList.length === 0 ? (
                    <div className="flex items-center justify-center py-32 text-white/50">
                        No results found.
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                            {mangaList.map((item) => (
                                <MangaCard
                                    key={item.id || item.mal_id}
                                    manga={item}
                                    onClick={() => handleMangaClick(item)}
                                />
                            ))}
                        </div>

                        <Pagination
                            currentPage={currentPage}
                            lastPage={lastPage}
                            onPageChange={handlePageChange}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
