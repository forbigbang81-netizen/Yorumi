import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { mangaService } from '../services/mangaService';
import type { Manga } from '../types/manga';
import MangaCard from '../features/manga/components/MangaCard';
import MangaCardSkeleton from '../features/manga/components/MangaCardSkeleton';
import Pagination from '../components/ui/Pagination';

type FormatResult = { data: Manga[]; pagination: { last_visible_page: number; current_page: number; has_next_page: boolean } };

const FORMAT_CONFIG: Record<string, {
    label: string;
    fetchMethod: (page: number) => Promise<FormatResult>;
    peekMethod: (page: number) => FormatResult | null;
}> = {
    popular:    { label: 'Most Popular',    fetchMethod: (p) => mangaService.getPopularManga(p),       peekMethod: (p) => mangaService.peekPopularManga(p) },
    latest:     { label: 'Latest Updates',  fetchMethod: (p) => mangaService.getLatestMangaScraper(p), peekMethod: (p) => mangaService.peekLatestMangaScraper(p) },
    directory:  { label: 'Manga Directory', fetchMethod: (p) => mangaService.getMangaDirectory(p),     peekMethod: (p) => mangaService.peekMangaDirectory(p) },
    new:        { label: 'New Manga',       fetchMethod: (p) => mangaService.getNewMangaScraper(p),    peekMethod: (p) => mangaService.peekNewMangaScraper(p) },
    manhwa:     { label: 'Popular Manhwa',  fetchMethod: (p) => mangaService.getPopularManhwa(p),      peekMethod: (p) => mangaService.peekPopularManhwa(p) },
    'one-shot': { label: 'One Shots',       fetchMethod: (p) => mangaService.getOneShotManga(p),       peekMethod: (p) => mangaService.peekOneShotManga(p) },
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

    const fetchData = useCallback(async (page: number) => {
        if (!config) return;

        const cached = config.peekMethod(page);
        if (cached?.data?.length) {
            setMangaList(cached.data);
            setLastPage(cached.pagination?.last_visible_page ?? 1);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }

        try {
            const result = await config.fetchMethod(page);
            setMangaList(result?.data ?? []);
            setLastPage(result?.pagination?.last_visible_page ?? 1);

            const nextPage = page + 1;
            if ((result?.pagination?.last_visible_page ?? 1) >= nextPage) {
                config.fetchMethod(nextPage).catch(() => undefined);
            }
        } catch (e) {
            console.error('MangaFormatPage fetch error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [config]);

    useEffect(() => {
        setCurrentPage(1);
        fetchData(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [format, fetchData]);

    useEffect(() => {
        if (!config) return;

        const nextPage = currentPage + 1;
        if (nextPage <= lastPage) {
            config.fetchMethod(nextPage).catch(() => undefined);
        }
    }, [config, currentPage, lastPage]);

    const handlePageChange = (page: number) => {
        if (page === currentPage) return;

        const cached = config.peekMethod(page);
        setCurrentPage(page);
        if (!cached?.data?.length) {
            setIsLoading(true);
        }
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
