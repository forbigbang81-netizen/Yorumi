import { ArrowLeft } from 'lucide-react';
import AnimeCardSkeleton from './AnimeCardSkeleton';
import Pagination from '../../../components/ui/Pagination';
import AnimeCard from './AnimeCard';
import type { Anime } from '../../../types/anime';

interface AnimeGridPageProps {
    title: string;
    animeList: Anime[];
    isLoading: boolean;
    pagination: {
        current_page: number;
        last_visible_page: number;
        has_next_page: boolean;
    };
    onPageChange: (page: number) => void;
    onBack: () => void;
    onAnimeClick: (anime: Anime) => void;
    onAnimeHover?: (anime: Anime) => void;
}

export default function AnimeGridPage({
    title,
    animeList,
    isLoading,
    pagination,
    onPageChange,
    onBack,
    onAnimeClick,
    onAnimeHover
}: AnimeGridPageProps) {
    return (
        <div className="pb-12 min-h-screen pt-24 container mx-auto px-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-2xl font-black text-white tracking-wide uppercase">{title}</h2>
            </div>
            {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <AnimeCardSkeleton key={i} />
                    ))}
                </div>
            ) : (
                <>
                    {animeList.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {animeList.map((item) => (
                                <AnimeCard
                                    key={`${item.scraperId || item.id || item.mal_id || item.title}-${item.latestEpisode || item.episodes || 0}`}
                                    anime={item}
                                    onClick={() => onAnimeClick(item)}
                                    onMouseEnter={() => onAnimeHover?.(item)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-gray-400">
                            No titles available right now.
                        </div>
                    )}
                    {pagination && (
                        <Pagination
                            currentPage={pagination.current_page}
                            lastPage={pagination.last_visible_page}
                            onPageChange={onPageChange}
                        />
                    )}
                </>
            )}
        </div>
    );
}
