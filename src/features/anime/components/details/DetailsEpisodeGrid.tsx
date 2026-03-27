import { useEffect, useState } from 'react';
import type { Episode } from '../../../../types/anime';

interface DetailsEpisodeGridProps {
    episodes: Episode[];
    watchedEpisodes: Set<number>;
    onEpisodeClick: (ep: Episode) => void;
}

export default function DetailsEpisodeGrid({ episodes, watchedEpisodes, onEpisodeClick }: DetailsEpisodeGridProps) {
    const ITEMS_PER_PAGE = 30;
    const [page, setPage] = useState(1);

    if (episodes.length === 0) {
        return <div className="text-gray-500 text-center py-4">No episodes found.</div>;
    }

    const totalPages = Math.ceil(episodes.length / ITEMS_PER_PAGE);
    const visibleEpisodes = episodes.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    useEffect(() => {
        setPage(1);
    }, [episodes.length, episodes[0]?.session, episodes[episodes.length - 1]?.session]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages || 1);
        }
    }, [page, totalPages]);

    return (
        <div className="py-6 border-t border-white/10 mt-6">
            <h3 className="text-xl font-bold text-white mb-4">Episodes ({episodes.length})</h3>
            <div className="mt-6">
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {visibleEpisodes.map((ep) => {
                        const cleanTitle = ep.title && ep.title.trim().toLowerCase() !== 'untitled' ? ep.title : null;
                        const displayTitle = cleanTitle || `Episode ${ep.episodeNumber}`;
                        const isWatched = watchedEpisodes.has(parseFloat(ep.episodeNumber));
                        return (
                            <button
                                key={ep.session || ep.episodeNumber}
                                onClick={() => onEpisodeClick(ep)}
                                className={`aspect-square flex items-center justify-center rounded transition-all duration-200 relative group 
                                    ${isWatched ? 'bg-white/5 text-gray-600 opacity-50' : 'bg-white/10 text-gray-300 hover:bg-yorumi-accent hover:text-black'} 
                                    hover:scale-105 hover:shadow-lg hover:shadow-yorumi-accent/20 cursor-pointer border border-white/5 hover:border-yorumi-accent`}
                                title={displayTitle}
                            >
                                <span className="text-sm font-bold">{ep.episodeNumber}</span>
                            </button>
                            );
                        })}
                </div>
                {totalPages > 1 && (
                    <div className="flex flex-col items-center gap-4 mt-6">
                        <div className="flex flex-wrap justify-center gap-2">
                            <button
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                disabled={page === 1}
                                className="min-w-10 rounded-md bg-white/10 px-3 py-1 text-sm text-gray-300 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Prev
                            </button>
                            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                                <button
                                    key={pageNumber}
                                    onClick={() => setPage(pageNumber)}
                                    className={`min-w-8 rounded-full px-2 py-1 text-sm transition-colors ${
                                        page === pageNumber ? 'bg-yorumi-500 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'
                                    }`}
                                >
                                    {pageNumber}
                                </button>
                            ))}
                            <button
                                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                                disabled={page === totalPages}
                                className="min-w-10 rounded-md bg-white/10 px-3 py-1 text-sm text-gray-300 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
