import { useMemo, useState } from 'react';
import type { Anime } from '../../../types/anime';
import { useTitleLanguage } from '../../../context/TitleLanguageContext';
import { getDisplayTitle } from '../../../utils/titleLanguage';
import TopTenSkeleton from './TopTenSkeleton';

interface TopTenSidebarProps {
    today: Anime[];
    week: Anime[];
    month: Anime[];
    isLoading?: boolean;
    onAnimeClick: (anime: Anime) => void;
}

type TopRange = 'today' | 'week' | 'month';

export default function TopTenSidebar({ today, week, month, isLoading = false, onAnimeClick }: TopTenSidebarProps) {
    const { language } = useTitleLanguage();
    const [range, setRange] = useState<TopRange>('today');
    const topTen = useMemo(() => {
        const list = range === 'today' ? today : range === 'week' ? week : month;
        return list.slice(0, 10);
    }, [range, today, week, month]);

    return (
        <div className="bg-transparent p-0 shadow-none border-0">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-extrabold text-white tracking-wide">Top 10</h3>
                <div className="flex items-center gap-0 bg-[#222831] rounded-md p-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] overflow-hidden">
                    <button
                        onClick={() => setRange('today')}
                        disabled={isLoading}
                        className={`px-3 py-1 transition-colors text-xs font-bold ${range === 'today' ? 'bg-[#3bb8ff] text-black' : 'text-gray-400 hover:text-white'} ${isLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setRange('week')}
                        disabled={isLoading}
                        className={`px-3 py-1 transition-colors text-xs font-bold ${range === 'week' ? 'bg-[#3bb8ff] text-black' : 'text-gray-400 hover:text-white'} ${isLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                        Week
                    </button>
                    <button
                        onClick={() => setRange('month')}
                        disabled={isLoading}
                        className={`px-3 py-1 transition-colors text-xs font-bold ${range === 'month' ? 'bg-[#3bb8ff] text-black' : 'text-gray-400 hover:text-white'} ${isLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                        Month
                    </button>
                </div>
            </div>

            {isLoading ? (
                <TopTenSkeleton />
            ) : topTen.length === 0 ? (
                <div className="text-sm text-gray-400">No titles available.</div>
            ) : (
                <div className="space-y-3">
                    {topTen.map((anime, index) => (
                        <button
                            key={`${anime.mal_id || anime.id || anime.scraperId || getDisplayTitle(anime as unknown as Record<string, unknown>, language)}-${index}`}
                            onClick={() => onAnimeClick(anime)}
                            className="w-full text-left group"
                        >
                            <div className="relative flex items-stretch gap-3 rounded-xl bg-[#0f1116] hover:bg-[#141821] transition-colors overflow-hidden">
                                <div className="pointer-events-none absolute inset-y-0 right-20 w-24 bg-gradient-to-l from-black/70 via-black/20 to-transparent skew-x-[-12deg] opacity-80" />
                                <div className="relative w-16 flex items-center justify-center">
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-90">
                                        <img
                                            src="/monsterslash.png"
                                            alt=""
                                            className="w-11 h-11 object-contain transition-all duration-300 ease-out group-hover:scale-125 group-hover:brightness-125 group-hover:drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]"
                                            aria-hidden="true"
                                        />
                                    </div>
                                    <div className="relative z-10 text-lg font-extrabold text-white tracking-wider">
                                        {String(index + 1).padStart(2, '0')}
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1 py-3 pr-1">
                                    <div className="text-sm font-semibold text-white line-clamp-2 leading-snug">
                                        {getDisplayTitle(anime as unknown as Record<string, unknown>, language)}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 bg-[#22c55e] text-white text-[10px] font-bold px-2 py-1 rounded-md">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 4H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v2H6V9h5v2zm7 0h-1.5v-.5h-2v3h2V13H18v2h-5V9h5v2z" /></svg>
                                            {anime.latestEpisode || anime.episodes || '—'}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 bg-[#facc15] text-black text-[10px] font-bold px-2 py-1 rounded-md">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                                            {anime.score > 0 ? anime.score.toFixed(1) : '—'}
                                        </span>
                                    </div>
                                </div>

                                <div
                                    className="relative w-32 aspect-[4/3] -mr-2 bg-center bg-cover overflow-hidden [clip-path:polygon(14%_0,100%_0,100%_100%,0_100%)]"
                                    style={{
                                        backgroundImage: `url(${anime.images.jpg.large_image_url || anime.images.jpg.image_url})`,
                                        maskImage: 'linear-gradient(110deg, transparent 0%, black 26%, black 100%)',
                                        WebkitMaskImage: 'linear-gradient(110deg, transparent 0%, black 26%, black 100%)'
                                    }}
                                    aria-label={getDisplayTitle(anime as unknown as Record<string, unknown>, language)}
                                />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
