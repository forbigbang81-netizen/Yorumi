import { useNavigate } from 'react-router-dom';
import type { Anime } from '../../../types/anime';
import type { WatchProgress } from '../../../utils/storage';
import SpotlightHero from './SpotlightHero';
import ContinueWatching from './ContinueWatching';
import TrendingNow from './TrendingNow';
import PopularSeason from './PopularSeason';
import AnimeCard from './AnimeCard';
import AnimeCardSkeleton from './AnimeCardSkeleton';
import EstimatedSchedule from './EstimatedSchedule';
import Genres from './Genres';
import TopTenSidebar from './TopTenSidebar';

interface AnimeDashboardProps {
    spotlightAnime: Anime[];
    continueWatchingList: WatchProgress[];
    trendingAnime: Anime[];
    trendingLoading: boolean;
    popularSeason: Anime[];
    popularSeasonLoading: boolean;
    topTenToday: Anime[];
    topTenWeek: Anime[];
    topTenMonth: Anime[];
    topTenLoading: boolean;
    topAnime: Anime[];
    topAnimeLoading?: boolean;
    allTimeTitle?: string;
    compactCatalogMode?: boolean;
    showEstimatedSchedule?: boolean;
    showGenres?: boolean;
    onAnimeClick: (anime: Anime) => void;
    onWatchClick: (anime: Anime, episodeNumber?: number, startSeconds?: number) => void;
    onViewAll: (type: 'trending' | 'seasonal' | 'continue_watching' | 'popular') => void;
    onRemoveFromHistory: (animeId: number | string) => void;
    onAnimeHover?: (anime: Anime) => void;
}

export default function AnimeDashboard({
    spotlightAnime,
    continueWatchingList,
    trendingAnime,
    trendingLoading,
    popularSeason,
    popularSeasonLoading,
    topTenToday,
    topTenWeek,
    topTenMonth,
    topTenLoading,
    topAnime,
    topAnimeLoading = false,
    allTimeTitle = 'All-Time Popular',
    compactCatalogMode = false,
    showEstimatedSchedule = true,
    showGenres = true,
    onAnimeClick,
    onWatchClick,
    onViewAll,
    onRemoveFromHistory,
    onAnimeHover
}: AnimeDashboardProps) {
    const navigate = useNavigate();

    return (
        <>
            {!compactCatalogMode && (
                <SpotlightHero
                    animeList={spotlightAnime}
                    onAnimeClick={onAnimeClick}
                    onWatchClick={onWatchClick}
                />
            )}

            <div className={`container mx-auto px-4 z-10 relative ${compactCatalogMode ? '' : 'mt-8'}`}>
                {/* Continue Watching Carousel */}
                {!compactCatalogMode && continueWatchingList.length > 0 && (
                    <ContinueWatching
                        items={continueWatchingList}
                        variant="dashboard"
                        onWatchClick={onWatchClick}
                        onRemove={onRemoveFromHistory}
                        onViewAll={() => onViewAll('continue_watching')}
                    />
                )}

            {!compactCatalogMode && (
                <TrendingNow
                    animeList={trendingAnime}
                    isLoading={trendingLoading}
                    onAnimeClick={onAnimeClick}
                    onWatchClick={onWatchClick}
                    onViewAll={() => onViewAll('trending')}
                    onMouseEnter={onAnimeHover}
                />
            )}

            {!compactCatalogMode && (
                <PopularSeason
                    animeList={popularSeason}
                    isLoading={popularSeasonLoading}
                    onAnimeClick={onAnimeClick}
                    onWatchClick={onWatchClick}
                    onViewAll={() => onViewAll('seasonal')}
                    onMouseEnter={onAnimeHover}
                />
            )}

                {/* All-Time Popular + Top 10 + Schedule + Genres */}
                <div className="container mx-auto px-4 pt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold border-l-4 border-yorumi-accent pl-3 text-white">{allTimeTitle}</h2>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                {topAnimeLoading ? (
                                    Array.from({ length: 15 }).map((_, i) => (
                                        <AnimeCardSkeleton key={i} />
                                    ))
                                ) : (
                                    topAnime.slice(0, 15).map((item) => (
                                        <AnimeCard
                                            key={item.mal_id}
                                            anime={item}
                                            onClick={() => onAnimeClick(item)}
                                            onWatchClick={() => onWatchClick(item)}
                                            onMouseEnter={() => onAnimeHover?.(item)}
                                        />
                                    ))
                                )}
                            </div>
                            {showEstimatedSchedule && (
                                <div className="mt-4">
                                    <EstimatedSchedule onAnimeClick={(id) => navigate(`/anime/${id}`)} />
                                </div>
                            )}
                        </div>

                        <div className={showGenres ? 'space-y-6' : ''}>
                            <TopTenSidebar
                                today={topTenToday}
                                week={topTenWeek}
                                month={topTenMonth}
                                isLoading={topTenLoading}
                                onAnimeClick={onAnimeClick}
                            />
                            {showGenres && <Genres onGenreClick={(genre) => navigate(`/genre/${encodeURIComponent(genre)}`)} />}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
