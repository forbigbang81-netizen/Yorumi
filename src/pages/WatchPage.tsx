import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePlayer } from '../features/player/hooks/usePlayer';

// Feature Components
import EpisodeList from '../features/player/components/EpisodeList';
import VideoPlayer from '../features/player/components/VideoPlayer';
import PlayerControls from '../features/player/components/PlayerControls';
import AnimeDetailsSidebar from '../features/anime/components/AnimeDetailsSidebar';
import { useTitleLanguage } from '../context/TitleLanguageContext';
import { getDisplayTitle } from '../utils/titleLanguage';

export default function WatchPage() {
    const { id, title } = useParams<{ title: string; id: string }>();
    const { language } = useTitleLanguage();
    const extractAnimePaheSession = (value: unknown): string => {
        const raw = String(value || '').trim();
        const normalized = raw.startsWith('s:') ? raw.slice(2) : raw;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
            ? normalized
            : '';
    };

    useEffect(() => {
        document.documentElement.classList.add('watch-safe-mode');
        document.body.classList.add('watch-safe-mode');
        return () => {
            document.documentElement.classList.remove('watch-safe-mode');
            document.body.classList.remove('watch-safe-mode');
        };
    }, []);

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
        resumeAtSeconds,
        epLoading,
        streamLoading,
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

    const routeSession = extractAnimePaheSession(id);
    const animeMatch = !!(
        anime && id && (
            String(anime.id) === String(id) ||
            String(anime.mal_id) === String(id) ||
            (!!routeSession && extractAnimePaheSession((anime as any)?.scraperId) === routeSession)
        )
    );
    const isPageLoading = !anime || !animeMatch;

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-screen w-full bg-[#0a0a0a] text-white">
                <h1 className="text-2xl font-bold text-red-400 mb-4">{error}</h1>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Home
                </button>
            </div>
        );
    }

    if (isPageLoading) {
        return (
            <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white overflow-hidden pt-[60px]">
                <header className="h-14 shrink-0 flex items-center px-6 border-b border-white/10 bg-black/40 backdrop-blur-md z-40">
                    <button
                        onClick={() => navigate('/')}
                        className="mr-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-sm font-medium">Back</span>
                    </button>
                    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
                </header>

                <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-y-auto md:overflow-hidden">
                    <EpisodeList
                        episodes={[]}
                        currentEpNumber={'1'}
                        watchedEpisodes={new Set<number>()}
                        isLoading={true}
                        onEpisodeClick={() => null}
                    />

                    <div className="flex-1 min-w-0 relative bg-black flex flex-col order-1 md:order-2">
                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-40 h-24 bg-white/5 rounded-xl animate-pulse" />
                        </div>
                        <div className="h-16 border-t border-white/10 bg-black/40" />
                    </div>
                </div>
            </div>
        );
    }

    // Use any cast to avoid type errors with mismatched interface if needed
    const animeData: any = anime;
    const displayTitle = getDisplayTitle(animeData as Record<string, unknown>, language);

    return (
        <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white overflow-hidden pt-[60px]">
            {/* 1. Header Row (Fixed) */}
            <header className="h-14 shrink-0 flex items-center px-6 border-b border-white/10 bg-black/40 backdrop-blur-md z-40">
                <button
                    onClick={() => navigate('/')}
                    className="mr-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="text-sm font-medium">Back</span>
                </button>
                <h1 className="text-lg font-bold text-white tracking-wide truncate">
                    {displayTitle}
                </h1>
            </header>

            {/* 2. Main Layout (3 Columns) */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-y-auto md:overflow-hidden">

                {/* COLUMN 1: Episode List (Left Sidebar) */}
                <EpisodeList
                    episodes={episodes}
                    currentEpNumber={epNum}
                    watchedEpisodes={watchedEpisodes}
                    isLoading={epLoading || !episodesResolved}
                    onEpisodeClick={handleEpisodeClick}
                />

                {/* COLUMN 2: Player (Center) */}
                <div className="flex-1 min-w-0 relative bg-black flex flex-col order-1 md:order-2">
                    {/* Video Player Container */}
                    <VideoPlayer
                        streamUrl={currentStream?.url}
                        isHls={currentStream?.isHls}
                        subtitles={currentStream?.subtitles}
                        isLoading={streamLoading}
                        isExpanded={isExpanded}
                        hasPlayableSource={!currentEpisode || Boolean(currentStream?.url) || streamLoading}
                        onLoad={() => setIsPlayerReady(true)}
                        onError={handleStreamError}
                        onProgress={handlePlaybackProgress}
                        startAtSeconds={resumeAtSeconds}
                    />

                    {/* Metadata & Controls Bar (Below Player) */}
                    <PlayerControls
                        isExpanded={isExpanded}
                        canPrev={epNum !== '1'}
                        isAutoQuality={isAutoQuality}
                        selectedStreamIndex={selectedStreamIndex}
                        streams={streams}
                        selectedAudio={selectedAudio}
                        availableAudios={availableAudios}
                        currentEpisodeNumber={epNum}
                        showQualityMenu={showQualityMenu}
                        onPrev={handlePrevEp}
                        onNext={handleNextEp}
                        onReload={reloadPlayer}
                        onToggleExpand={toggleExpand}
                        setShowQualityMenu={setShowQualityMenu}
                        onQualityChange={handleQualityChange}
                        onSetAutoQuality={setAutoQuality}
                        onAudioChange={setSelectedAudio}
                    />
                </div>

                {/* COLUMN 3: Anime Details (Right Sidebar) */}
                {!isExpanded && (
                    <AnimeDetailsSidebar
                        anime={anime}
                        currentId={id || ''}
                    />
                )}

            </div>
        </div>
    );
}
