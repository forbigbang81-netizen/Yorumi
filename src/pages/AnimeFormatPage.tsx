import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { animeService } from '../services/animeService';
import { slugify } from '../utils/slugify';
import type { Anime } from '../types/anime';
import AnimeCard from '../features/anime/components/AnimeCard';
import AnimeCardSkeleton from '../features/anime/components/AnimeCardSkeleton';
import Pagination from '../components/ui/Pagination';
import { useAnime } from '../hooks/useAnime';

const FORMAT_CONFIG: Record<string, { label: string; anilistFormat: string | undefined }> = {
    popular:  { label: 'Most Popular', anilistFormat: undefined },
    movies:   { label: 'Movies',     anilistFormat: 'MOVIE'   },
    tv:       { label: 'TV Series',  anilistFormat: 'TV'      },
    ova:      { label: 'OVAs',       anilistFormat: 'OVA'     },
    ona:      { label: 'ONAs',       anilistFormat: 'ONA'     },
    specials: { label: 'Specials',   anilistFormat: 'SPECIAL' },
};

export default function AnimeFormatPage() {
    const location = useLocation();
    const format = location.pathname.split('/').pop() || '';
    const navigate = useNavigate();
    const { prefetchEpisodes } = useAnime();
    const isAnimePaheSession = (value: unknown) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

    const config = FORMAT_CONFIG[format];

    const [animeList, setAnimeList] = useState<Anime[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);

    const fetchData = useCallback(async (page: number) => {
        if (!config) return;

        // Instant paint from cache for faster navigation.
        const cached = animeService.peekTopAnime(page, config.anilistFormat);
        if (cached?.data?.length) {
            setAnimeList(cached.data);
            setLastPage(cached?.pagination?.last_visible_page ?? 1);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }

        try {
            const result = await animeService.getTopAnime(page, config.anilistFormat);
            setAnimeList(result?.data ?? []);
            setLastPage(result?.pagination?.last_visible_page ?? 1);

            const nextPage = page + 1;
            if ((result?.pagination?.last_visible_page ?? 1) >= nextPage) {
                animeService.getTopAnime(nextPage, config.anilistFormat).catch(() => undefined);
            }
        } catch (e) {
            console.error('AnimeFormatPage fetch error:', e);
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
            animeService.getTopAnime(nextPage, config.anilistFormat).catch(() => undefined);
        }
    }, [config, currentPage, lastPage]);

    const handlePageChange = (page: number) => {
        if (page === currentPage) return;

        const cached = animeService.peekTopAnime(page, config.anilistFormat);
        setCurrentPage(page);
        if (!cached?.data?.length) {
            setIsLoading(true);
        }
        fetchData(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleAnimeClick = (item: Anime) => {
        const id = item.id || item.mal_id;
        navigate(`/anime/details/${id}`, { state: { anime: item } });
    };

    const handleWatchClick = (item: Anime) => {
        const title = slugify(item.title || item.title_english || 'anime');
        const rawScraperId = String(item.scraperId || '').trim();
        const id = rawScraperId && isAnimePaheSession(rawScraperId)
            ? (rawScraperId.startsWith('s:') ? rawScraperId : `s:${rawScraperId}`)
            : (item.mal_id || item.id);
        if (!id) return;
        const ep = item.status === 'Currently Airing' ? 'latest' : 1;
        navigate(`/anime/watch/${title}/${id}?ep=${ep}`, { state: { anime: item } });
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
                    <div className="w-1 h-7 bg-yorumi-accent rounded-full" />
                    <h1 className="text-2xl font-black text-white tracking-wide uppercase">
                        {config.label}
                    </h1>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <AnimeCardSkeleton key={i} />
                        ))}
                    </div>
                ) : animeList.length === 0 ? (
                    <div className="flex items-center justify-center py-32 text-white/50">
                        No results found.
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                            {animeList.map((item) => (
                                <AnimeCard
                                    key={item.mal_id || item.id}
                                    anime={item}
                                    onClick={() => handleAnimeClick(item)}
                                    onWatchClick={() => handleWatchClick(item)}
                                    onMouseEnter={() => prefetchEpisodes(item)}
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
