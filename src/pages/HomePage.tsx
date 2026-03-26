import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAnime } from '../hooks/useAnime';
import { slugify } from '../utils/slugify';
import type { Anime } from '../types/anime';

// Feature Components
import AnimeDashboard from '../features/anime/components/AnimeDashboard';
import AnimeGridPage from '../features/anime/components/AnimeGridPage';
import ContinueWatching from '../features/anime/components/ContinueWatching';

export default function HomePage() {
    const navigate = useNavigate();
    const anime = useAnime();
    const isCatalogFilterView = false;
    const filteredTopAnime = Array.isArray(anime.topAnime) ? anime.topAnime : [];
    const allTimeTitle = 'All-Time Popular';

    useEffect(() => {
        anime.fetchHomeData();
    }, []);

    // Navigation Handlers
    const isAnimePaheSession = (value: unknown) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

    const getWatchRouteId = (item: Anime): string | number | undefined => {
        const rawScraperId = String(item.scraperId || '').trim();
        if (rawScraperId && isAnimePaheSession(rawScraperId)) {
            return rawScraperId.startsWith('s:') ? rawScraperId : `s:${rawScraperId}`;
        }
        return item.mal_id || item.id;
    };

    const handleAnimeClick = (item: Anime) => {
        const animeId = item.id || item.mal_id;
        navigate(`/anime/details/${animeId}`, { state: { anime: item } });
    };

    const handleWatchClick = (item: Anime, episodeNumber?: number, startSeconds?: number) => {
        const title = slugify(item.title || item.title_english || 'anime');
        const id = getWatchRouteId(item);
        if (!id) return;

        let targetEp = episodeNumber;

        if (!targetEp) {
            // Smart Logic:
            // If Finished -> Play Episode 1
            // If Airing -> Play Latest Episode
            if (item.status === 'Finished Airing') {
                targetEp = 1;
            } else if (item.status === 'Currently Airing') {
                // Use 'latest' keyword - let the player determine the actual number
                // based on the loaded episode list
                targetEp = 'latest' as any;
            } else {
                // Default fallback (e.g. Not Yet Released or unknown)
                targetEp = 1;
            }
        }

        const resume = Number.isFinite(startSeconds) ? Math.max(0, Math.floor(startSeconds || 0)) : 0;
        const url = `/anime/watch/${title}/${id}?ep=${targetEp}${resume > 0 ? `&t=${resume}` : ''}`;
        navigate(url, { state: { anime: item } });
    };

    // Scroll to top on mount
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [anime.currentPage]);

    // Replace full-page loading with AnimeDashboard showing skeletons
    if (anime.loading && anime.currentPage === 1 && anime.topAnime.length === 0 && anime.spotlightAnime.length === 0 && anime.trendingAnime.length === 0) {
        return (
            <div className={`min-h-screen pb-20 ${isCatalogFilterView ? 'pt-24' : ''}`}>
                <AnimeDashboard
                    spotlightAnime={[]}
                    continueWatchingList={[]}
                    trendingAnime={[]}
                    trendingLoading={true}
                    popularSeason={[]}
                    popularSeasonLoading={true}
                    topTenToday={[]}
                    topTenWeek={[]}
                    topTenMonth={[]}
                    topTenLoading={true}
                    topAnime={[]}
                    topAnimeLoading={true}
                    allTimeTitle={allTimeTitle}
                    compactCatalogMode={isCatalogFilterView}
                    showEstimatedSchedule={!isCatalogFilterView}
                    showGenres={!isCatalogFilterView}
                    onAnimeClick={handleAnimeClick}
                    onWatchClick={handleWatchClick}
                    onViewAll={anime.openViewAll}
                    onRemoveFromHistory={anime.removeFromHistory}
                    onAnimeHover={anime.prefetchEpisodes}
                />
            </div>
        );
    }

    if (anime.error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-red-500">
                <p className="text-xl mb-4">{anime.error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-red-500/10 border border-red-500 rounded hover:bg-red-500/20"
                >
                    Retry
                </button>
            </div>
        );
    }

    // View Switching
    if (anime.viewMode === 'continue_watching') {
        return (
            <div className="container mx-auto px-4 pt-24 pb-12 z-10 relative">
                <ContinueWatching
                    items={anime.continueWatchingList}
                    variant="page"
                    onWatchClick={handleWatchClick}
                    onRemove={anime.removeFromHistory}
                    onBack={anime.closeViewAll}
                />
            </div>
        );
    }

    if (anime.viewMode === 'trending') {
        return (
            <AnimeGridPage
                title="Trending Now"
                animeList={anime.viewAllAnime}
                isLoading={anime.viewAllLoading}
                pagination={anime.viewAllPagination}
                onPageChange={anime.changeViewAllPage}
                onBack={anime.closeViewAll}
                onAnimeClick={handleAnimeClick}
                onAnimeHover={anime.prefetchEpisodes}
            />
        );
    }

    if (anime.viewMode === 'seasonal') {
        return (
            <AnimeGridPage
                title="Popular This Season"
                animeList={anime.viewAllAnime}
                isLoading={anime.viewAllLoading}
                pagination={anime.viewAllPagination}
                onPageChange={anime.changeViewAllPage}
                onBack={anime.closeViewAll}
                onAnimeClick={handleAnimeClick}
                onAnimeHover={anime.prefetchEpisodes}
            />
        );
    }

    if (anime.viewMode === 'popular') {
        return (
            <AnimeGridPage
                title="All-Time Popular"
                animeList={anime.viewAllAnime}
                isLoading={anime.viewAllLoading}
                pagination={anime.viewAllPagination}
                onPageChange={anime.changeViewAllPage}
                onBack={anime.closeViewAll}
                onAnimeClick={handleAnimeClick}
                onAnimeHover={anime.prefetchEpisodes}
            />
        );
    }

    // Default Dashboard
    return (
        <div className={`min-h-screen pb-20 ${isCatalogFilterView ? 'pt-24' : ''}`}>
            <AnimeDashboard
                spotlightAnime={anime.spotlightAnime}
                continueWatchingList={anime.continueWatchingList}
                trendingAnime={anime.trendingAnime}
                trendingLoading={anime.trendingLoading}
                popularSeason={anime.popularSeason}
                popularSeasonLoading={anime.popularSeasonLoading}
                topTenToday={anime.topTenToday}
                topTenWeek={anime.topTenWeek}
                topTenMonth={anime.topTenMonth}
                topTenLoading={anime.topTenLoading}
                topAnime={filteredTopAnime}
                topAnimeLoading={anime.loading}
                allTimeTitle={allTimeTitle}
                compactCatalogMode={isCatalogFilterView}
                showEstimatedSchedule={!isCatalogFilterView}
                showGenres={!isCatalogFilterView}
                onAnimeClick={handleAnimeClick}
                onWatchClick={handleWatchClick}
                onViewAll={anime.openViewAll}
                onRemoveFromHistory={anime.removeFromHistory}
                onAnimeHover={anime.prefetchEpisodes}
            />
        </div>
    );
}
