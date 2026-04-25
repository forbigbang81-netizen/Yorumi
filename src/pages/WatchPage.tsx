import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import { usePlayer } from '../features/player/hooks/usePlayer';

// Feature Components
import EpisodeList from '../features/player/components/EpisodeList';
import VideoPlayer from '../features/player/components/VideoPlayer';
import PlayerControls from '../features/player/components/PlayerControls';
import { useTitleLanguage } from '../context/TitleLanguageContext';
import { getDisplayTitle } from '../utils/titleLanguage';
import { getAnimeDetailsRouteId } from '../utils/animeNavigation';

export default function WatchPage() {
    const { id, title } = useParams<{ title: string; id: string }>();
    const { language } = useTitleLanguage();
    const extractDirectScraperSession = (value: unknown): string => {
        const raw = String(value || '').trim();
        const normalized = raw
            .replace(/^s:/i, '')
            .replace(/^https?:\/\/[^/]+/i, '')
            .replace(/^\/+/, '')
            .replace(/^watch\//i, '')
            .trim();
        if (!normalized) return '';
        return /^\d+$/.test(normalized) ? '' : normalized;
    };

    useEffect(() => {
        document.documentElement.classList.add('watch-safe-mode');
        document.body.classList.add('watch-safe-mode');
        return () => {
            document.documentElement.classList.remove('watch-safe-mode');
            document.body.classList.remove('watch-safe-mode');
        };
    }, []);

    const getBackdropImage = (value: unknown): string => {
        const record = (value && typeof value === 'object') ? value as Record<string, unknown> : null;
        return (
            (typeof record?.anilist_banner_image === 'string' ? record.anilist_banner_image : '') ||
            (typeof record?.bannerImage === 'string' ? record.bannerImage : '') ||
            (((record?.main_picture as Record<string, unknown> | undefined)?.large as string | undefined) || '') ||
            (((record?.main_picture as Record<string, unknown> | undefined)?.medium as string | undefined) || '') ||
            ((((record?.images as Record<string, unknown> | undefined)?.jpg as Record<string, unknown> | undefined)?.large_image_url as string | undefined) || '') ||
            ((((record?.images as Record<string, unknown> | undefined)?.jpg as Record<string, unknown> | undefined)?.image_url as string | undefined) || '') ||
            ''
        );
    };

    const {
        anime,
        episodes,
        currentEpisode,
        currentStream,

        streams,
        error,
        watchedEpisodes,
        episodesResolved,
        epNum,
        cleanCurrentTitle,
        resumeAtSeconds,
        epLoading,
        streamLoading,
        streamExhausted,
        isExpanded,
        isAutoQuality,
        selectedAudio,
        availableAudios,
        showQualityMenu,
        selectedStreamIndex,
        toggleExpand,
        reloadPlayer,
        handlePrevEp,
        handleNextEp,
        handleEpisodeClick,
        setShowQualityMenu,
        handleQualityChange,
        setAutoQuality,
        setSelectedAudio,
        setIsPlayerReady,
        handlePlaybackProgress,
        handleStreamError,
        navigate
    } = usePlayer(id, title);

    const routeSession = extractDirectScraperSession(id);
    const animeRecord = anime as Record<string, unknown> | null;
    const animeMatch = !!(
        anime && id && (
            String(anime.id) === String(id) ||
            String(anime.mal_id) === String(id) ||
            (!!routeSession && extractDirectScraperSession(animeRecord?.scraperId) === routeSession)
        )
    );
    const isPageLoading = !anime || !animeMatch;

    if (error) {
        return (
            <div className="watch-viewport flex flex-col items-center justify-center p-12 text-center w-full bg-[#0a0a0a] text-white">
                <h1 className="text-2xl font-bold text-red-400 mb-4">{error}</h1>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all active:scale-95 group"
                >
                    <Home className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                    <span className="font-medium">Back to Home</span>
                </button>
            </div>
        );
    }

    if (isPageLoading) {
        return (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-0 pb-0 pt-0 gap-4 md:px-8 md:pb-8">
                <div className="flex items-center gap-4 shrink-0 px-4 pt-4 md:px-0 md:pt-0">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 -ml-2 text-gray-400 hover:text-white transition-all hover:bg-white/5 rounded-lg active:scale-95"
                    >
                        <Home className="w-5 h-5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
                </div>

                <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-hidden gap-0 md:gap-8">
                    <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden gap-0 md:gap-4">
                        <div className="flex-1 flex items-center justify-center bg-black/40 md:rounded-2xl">
                            <div className="w-40 h-24 bg-white/5 rounded-xl animate-pulse" />
                        </div>
                    </div>

                    <EpisodeList
                        episodes={[]}
                        currentEpNumber={'1'}
                        watchedEpisodes={new Set<number>()}
                        isLoading={true}
                        onEpisodeClick={() => null}
                        reloadPlayer={() => null}
                        anime={null}
                    />
                </div>
            </div>
        );
    }

    // Use any cast to avoid type errors with mismatched interface if needed
    const animeData = animeRecord as Record<string, unknown>;
    const displayTitle = getDisplayTitle(animeData, language);
    const backdropImage = getBackdropImage(animeData);
    const detailsRouteId = getAnimeDetailsRouteId(anime || {});
    const handleDetailsClick = () => {
        const targetId = detailsRouteId || id;
        if (!targetId) return;
        navigate(`/anime/details/${targetId}`, anime ? { state: { anime } } : undefined);
    };

    return (
        <div className="watch-viewport relative flex flex-col w-full bg-[#0a0a0a] text-white overflow-hidden pt-14">
            {backdropImage && (
                <>
                    <div
                        className="absolute inset-0 z-0 scale-110 bg-cover bg-center opacity-30 blur-3xl watch-page-backdrop"
                        style={{ backgroundImage: `url(${backdropImage})` }}
                    />
                    <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(3,3,5,0.4)_0%,rgba(3,3,5,0.82)_32%,rgba(3,3,5,0.96)_100%)]" />
                </>
            )}
            {/* 1. Header Row (Fixed) */}


            <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-0 pb-0 pt-4 gap-4 md:px-10 md:pb-10 md:gap-8 relative z-10">
                <div className="flex items-center gap-3 shrink-0 min-w-0 px-4 md:px-0">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 -ml-2 text-gray-400 hover:text-white transition-all hover:bg-white/5 rounded-lg active:scale-95 group"
                    >
                        <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                    
                    <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                    
                    <div 
                        onClick={handleDetailsClick}
                        className="text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer truncate max-w-[200px]"
                    >
                        {displayTitle}
                    </div>

                    {episodesResolved && (
                        <>
                            <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                            <h1 className="text-sm font-bold text-white tracking-wide truncate">
                                {cleanCurrentTitle || `Episode ${epNum}`}
                            </h1>
                        </>
                    )}
                </div>

                <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-visible md:overflow-hidden gap-0 md:gap-8">
                        <div className="flex-none md:flex-1 min-w-0 relative flex flex-col overflow-visible md:overflow-hidden items-center">
                            {/* Constrained Column - Ensures 16:9 ratio is never broken by viewport height */}
                            <div
                                className={`w-full h-auto md:h-full flex flex-col gap-0 md:gap-6 ${
                                    isExpanded
                                        ? 'md:max-w-[min(96vw,calc((100vh-248px)*1.777))]'
                                        : 'md:max-w-[calc((100vh-252px)*1.777)]'
                                }`}
                            >
                                {/* Video Player Card - Maximized & End-to-End Alignment */}
                                <div className="shrink-0 w-full aspect-video flex items-center justify-center overflow-hidden relative">
                                    <VideoPlayer
                                        streamUrl={currentStream?.url}
                                        episodeSession={currentEpisode?.session ?? epNum}
                                        isHls={currentStream?.isHls}
                                        subtitles={currentStream?.subtitles}
                                        isLoading={streamLoading}
                                        streamExhausted={streamExhausted}
                                        hasPlayableSource={!currentEpisode || Boolean(currentStream?.url) || streamLoading}
                                        onLoad={() => setIsPlayerReady(true)}
                                        onError={handleStreamError}
                                        onProgress={handlePlaybackProgress}
                                        startAtSeconds={resumeAtSeconds}
                                    />
                                </div>

                                {/* Player Controls - Aligned end-to-end with the video player above */}
                                <div className="shrink-0 px-0 md:px-0">
                                    <PlayerControls
                                        isExpanded={isExpanded}
                                        canPrev={epNum !== '1'}
                                        isAutoQuality={isAutoQuality}
                                        selectedStreamIndex={selectedStreamIndex}
                                        streams={streams}
                                        selectedAudio={selectedAudio}
                                        availableAudios={availableAudios}
                                        showQualityMenu={showQualityMenu}
                                        onPrev={handlePrevEp}
                                        onNext={handleNextEp}
                                        onToggleExpand={toggleExpand}
                                        setShowQualityMenu={setShowQualityMenu}
                                        onQualityChange={handleQualityChange}
                                        onSetAutoQuality={setAutoQuality}
                                        onAudioChange={setSelectedAudio}
                                    />
                                </div>
                            </div>
                        </div>

                    {!isExpanded && (
                        <EpisodeList
                            episodes={episodes}
                            currentEpNumber={epNum}
                            watchedEpisodes={watchedEpisodes}
                            isLoading={epLoading || !episodesResolved}
                            onEpisodeClick={handleEpisodeClick}
                            reloadPlayer={reloadPlayer}
                            anime={anime}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
