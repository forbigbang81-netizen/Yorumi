import { useState, useRef, useEffect } from 'react';
import { LayoutList, LayoutGrid, Search, ArrowUpDown } from 'lucide-react';
import type { Anime, Episode } from '../../../types/anime';

interface EpisodeListProps {
    episodes: Episode[];
    currentEpNumber: string;
    watchedEpisodes: Set<number>;
    isLoading: boolean;
    onEpisodeClick: (ep: Episode) => void;
    anime?: Anime | null;
}

export default function EpisodeList({
    episodes,
    currentEpNumber,
    watchedEpisodes,
    isLoading,
    onEpisodeClick,
    anime
}: EpisodeListProps) {
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [searchEp, setSearchEp] = useState('');
    const [sortAsc, setSortAsc] = useState(true);

    // Auto-scroll to active episode
    const activeEpRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (activeEpRef.current) {
            activeEpRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [currentEpNumber, viewMode]);

    // Filter + sort episodes
    const filteredEpisodes = episodes
        .filter(ep =>
            (ep.title?.toLowerCase() || '').includes(searchEp.toLowerCase()) ||
            ep.episodeNumber.toString().includes(searchEp)
        )
        .sort((a, b) => {
            const diff = parseFloat(a.episodeNumber) - parseFloat(b.episodeNumber);
            return sortAsc ? diff : -diff;
        });

    const fallbackThumbnail =
        anime?.images?.jpg?.large_image_url ||
        anime?.images?.jpg?.image_url ||
        anime?.anilist_cover_image ||
        '';

    const nextEpisode = (() => {
        const currentNum = parseFloat(currentEpNumber);
        if (!Number.isFinite(currentNum)) return null;
        return episodes.find(ep => parseFloat(ep.episodeNumber) === currentNum + 1) || null;
    })();

    const getEpisodeMeta = (ep: Episode) => {
        const episodeNumber = parseFloat(String(ep.episodeNumber));
        const metadata = anime?.episodeMetadata || [];

        if (!Number.isFinite(episodeNumber) || metadata.length === 0) {
            return null;
        }

        return metadata.find((item) => {
            const match = item.title?.match(/Episode\s+(\d+)/i);
            return match && parseFloat(match[1]) === episodeNumber;
        }) || metadata[episodeNumber - 1] || null;
    };

    return (
        <aside className="w-full md:w-[380px] xl:w-[420px] shrink-0 flex flex-col h-[480px] md:h-full overflow-hidden order-2 md:order-2 rounded-t-[28px] md:rounded-none md:border-l border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.96),rgba(7,7,10,0.92))] backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="px-4 pt-4 pb-3 border-b border-white/5 flex flex-col gap-3">
                {/* Title row */}
                <div>
                    <p className="text-[11px] font-semibold tracking-[0.24em] uppercase text-gray-500">
                        {nextEpisode ? `Up Next - Episode ${nextEpisode.episodeNumber}` : 'Up Next'}
                    </p>
                    <h3 className="mt-0.5 text-sm font-semibold text-white">
                        Episodes ({episodes.length})
                    </h3>
                </div>

                {/* Toolbar row: search + sort + view toggle */}
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search Episode"
                            value={searchEp}
                            onChange={(e) => setSearchEp(e.target.value)}
                            className="w-full bg-black/40 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:bg-black/60 transition-colors"
                        />
                    </div>

                    {/* Sort toggle */}
                    <button
                        onClick={() => setSortAsc(v => !v)}
                        title={sortAsc ? 'Sort descending' : 'Sort ascending'}
                        className="flex-shrink-0 p-2 rounded-lg bg-black/40 text-gray-400 hover:text-white hover:bg-black/60 transition-colors"
                    >
                        <ArrowUpDown className="w-4 h-4" />
                    </button>

                    {/* List / Grid toggle */}
                    <div className="flex flex-shrink-0 bg-black/40 rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <LayoutList className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                {isLoading ? (
                    <div className={viewMode === 'grid' ? "grid grid-cols-5 gap-2 p-3" : "flex flex-col"}>
                        {Array.from({ length: viewMode === 'grid' ? 20 : 10 }).map((_, index) => (
                            <div
                                key={`episode-skeleton-${index}`}
                                className={
                                    viewMode === 'grid'
                                        ? "aspect-square rounded-md bg-white/5 animate-pulse"
                                        : "w-full px-5 py-3 flex flex-col gap-2"
                                }
                            >
                                {viewMode !== 'grid' && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <div className="h-3 w-12 bg-white/10 rounded animate-pulse" />
                                            <div className="h-6 w-6 bg-white/10 rounded-full animate-pulse" />
                                        </div>
                                        <div className="h-3 w-3/4 bg-white/10 rounded animate-pulse" />
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ) : filteredEpisodes.length > 0 ? (
                    <div className={viewMode === 'grid' ? "grid grid-cols-5 gap-2 p-3" : "flex flex-col"}>
                        {filteredEpisodes.map((ep) => {
                            const isCurrent = ep.episodeNumber == currentEpNumber;
                            const isWatched = watchedEpisodes.has(parseFloat(ep.episodeNumber));
                            const meta = getEpisodeMeta(ep);
                            const cleanTitle = ep.title && ep.title.trim().toLowerCase() !== 'untitled' ? ep.title : null;
                            const displayTitle = meta?.title?.replace(/^Episode \d+[\s-]*:?/i, '').trim() || cleanTitle || `Episode ${ep.episodeNumber}`;
                            const previewImage = ep.snapshot || meta?.thumbnail || fallbackThumbnail;

                            return (
                                <button
                                    key={ep.session || ep.episodeNumber}
                                    ref={isCurrent ? activeEpRef : null}
                                    onClick={() => onEpisodeClick(ep)}
                                    className={`
                                        group relative transition-all duration-200
                                        ${viewMode === 'grid'
                                            ? `aspect-square rounded-md flex items-center justify-center border ${isCurrent ? 'bg-yorumi-accent text-white border-yorumi-accent font-bold' : isWatched ? 'bg-white/5 text-gray-600 border-white/10 opacity-50' : 'bg-white/10 border-white/5 hover:bg-white/20 text-gray-400 hover:text-white'}`
                                            : `w-full px-4 py-3 text-left flex items-center gap-3 ${isCurrent ? 'bg-[#12324a]' : isWatched ? 'opacity-60' : 'hover:bg-white/[0.045]'}`
                                        }
                                    `}
                                >
                                    {viewMode === 'grid' ? (
                                        <span className="text-sm">{ep.episodeNumber}</span>
                                    ) : (
                                        <>
                                            <div className="relative h-20 w-[136px] shrink-0 overflow-hidden rounded-2xl bg-white/5">
                                                {previewImage ? (
                                                    <img
                                                        src={previewImage}
                                                        alt={displayTitle}
                                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="h-full w-full bg-white/5" />
                                                )}
                                                <span className="absolute bottom-2 left-2 inline-flex min-w-[44px] items-center justify-center rounded-lg bg-black/70 px-2 py-1 text-xs font-bold text-white">
                                                    Ep {ep.episodeNumber}
                                                </span>
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <span className={`block text-lg font-semibold leading-tight ${isCurrent ? 'text-white' : isWatched ? 'text-gray-300' : 'text-gray-100'}`}>
                                                            Episode {ep.episodeNumber}
                                                        </span>
                                                        <span className={`mt-1 block truncate text-sm ${isCurrent ? 'text-blue-50/95' : 'text-gray-400'}`}>
                                                            {displayTitle}
                                                        </span>
                                                    </div>
                                                </div>
                                                {ep.duration && (
                                                    <span className="mt-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                                                        {ep.duration}
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-500 text-sm">
                        {episodes.length === 0 ? "No episodes found." : "No matching episodes."}
                    </div>
                )}
            </div>
        </aside>
    );
}
