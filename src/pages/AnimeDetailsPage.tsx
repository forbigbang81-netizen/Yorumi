import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAnime } from '../hooks/useAnime';
import { useWatchList } from '../hooks/useWatchList';
import { useFavoriteAnime } from '../hooks/useFavoriteAnime';
import { slugify } from '../utils/slugify';
import type { Anime } from '../types/anime';

// Feature Components
import DetailsHero from '../features/anime/components/details/DetailsHero';
import DetailsInfo from '../features/anime/components/details/DetailsInfo';
import DetailsEpisodeGrid from '../features/anime/components/details/DetailsEpisodeGrid';
import DetailsCharacters from '../features/anime/components/details/DetailsCharacters';
import DetailsTrailers from '../features/anime/components/details/DetailsTrailers';
import DetailsRelations from '../features/anime/components/details/DetailsRelations';

const EpisodesSkeleton = ({ count = 10 }: { count?: number }) => (
    <div className="py-6 border-t border-white/10 mt-6">
        <h3 className="text-xl font-bold text-white mb-4">Episodes</h3>
        <div className="mt-6 grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 animate-pulse">
            {Array.from({ length: count }).map((_, idx) => (
                <div key={idx} className="aspect-square rounded bg-white/10" />
            ))}
        </div>
    </div>
);

const CharactersSkeleton = () => (
    <div className="py-6 border-t border-white/10 mt-6">
        <h3 className="text-xl font-bold text-white mb-4">Characters & Voice Actors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex bg-[#1a1a1a] rounded-lg overflow-hidden border border-white/5">
                    <div className="w-16 h-24 bg-white/10" />
                    <div className="flex-1 p-2 space-y-2">
                        <div className="h-3 w-24 bg-white/10 rounded" />
                        <div className="h-3 w-16 bg-white/10 rounded" />
                    </div>
                    <div className="w-16 h-24 bg-white/10" />
                    <div className="flex-1 p-2 space-y-2">
                        <div className="h-3 w-24 bg-white/10 rounded" />
                        <div className="h-3 w-16 bg-white/10 rounded" />
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const TrailersSkeleton = () => (
    <div className="py-6 border-t border-white/10 mt-6">
        <h3 className="text-xl font-bold text-white mb-4">Trailers & PVs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 animate-pulse">
            <div className="relative aspect-video bg-white/10 rounded-lg overflow-hidden border border-white/10">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/10" />
                </div>
                <div className="absolute bottom-0 inset-x-0 p-3">
                    <div className="h-3 w-28 bg-white/10 rounded" />
                </div>
            </div>
        </div>
    </div>
);

const DetailsPageSkeleton = () => (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 fade-in animate-in duration-300">
        {/* Banner Skeleton */}
        <div className="h-[40vh] md:h-[60vh] relative bg-white/5 animate-pulse" />
        
        {/* Content Skeleton */}
        <div className="container mx-auto px-4 md:px-6 -mt-24 md:-mt-32 relative z-10">
            <div className="flex flex-col md:flex-row gap-8">
                {/* Poster Skeleton */}
                <div className="w-48 h-72 md:w-64 md:h-96 shrink-0 bg-white/10 rounded-xl shadow-2xl border border-white/10 animate-pulse self-center md:self-start" />
                
                <div className="flex-1 mt-4 md:mt-32 space-y-4">
                    <div className="h-8 w-3/4 bg-white/10 rounded animate-pulse" />
                    <div className="flex gap-4">
                        <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                        <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                    </div>
                    <div className="space-y-2 pt-4">
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export default function AnimeDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const animeHook = useAnime();
    const isAnimePaheSession = (value: unknown) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

    // We need to sync the URL ID with the hook's selectedAnime
    useEffect(() => {
        // Scroll to top on mount
        window.scrollTo({ top: 0, behavior: 'auto' });

        if (location.state?.anime) {
            // Instant load from navigation state
            animeHook.handleAnimeClick(location.state.anime);
        } else if (id) {
            // Deep link / Refresh - fetch using ID
            if (id.startsWith('s:')) {
                const scraperSession = id.substring(2).trim();
                if (!isAnimePaheSession(scraperSession)) {
                    navigate('/', { replace: true });
                    return;
                }
                // Scraper ID
                animeHook.handleAnimeClick({
                    mal_id: 0,
                    id: 0,
                    scraperId: scraperSession,
                    title: '', // Title unknown on deep link, might fail identification if not mapped
                    images: { jpg: { image_url: '', large_image_url: '' } } // Placeholder
                } as Anime);
            } else {
                const parsedId = Number.parseInt(id, 10);
                if (Number.isFinite(parsedId) && parsedId > 0) {
                    animeHook.handleAnimeClick({ mal_id: parsedId } as Anime);
                } else {
                    navigate('/', { replace: true });
                }
            }
        }
    }, [id, location.state, navigate]);

    const { selectedAnime, episodes, epLoading, episodesResolved, detailsLoading, error, watchedEpisodes, markEpisodeComplete } = animeHook;
    const { isInWatchList, addToWatchList, removeFromWatchList } = useWatchList();
    const { isFavorite, addFavorite, removeFavorite } = useFavoriteAnime();
    const [activeTab, setActiveTab] = useState<'summary' | 'relations'>('summary');

    // Derived state for button, but useWatchList is reactive so we can just use isInWatchList(id)
    const animeId = selectedAnime
        ? (
            isAnimePaheSession(selectedAnime.scraperId)
                ? selectedAnime.scraperId
                : (selectedAnime.id || selectedAnime.mal_id)
        )?.toString() || ''
        : '';
    const inList = isInWatchList(animeId);
    const inFavorites = isFavorite(animeId);

    const handleToggleList = () => {
        if (!selectedAnime || !animeId) return;

        if (inList) {
            removeFromWatchList(animeId);
        } else {
            addToWatchList({
                id: animeId,
                anilistId: selectedAnime.id ? String(selectedAnime.id) : undefined,
                malId: selectedAnime.mal_id ? String(selectedAnime.mal_id) : undefined,
                scraperId: isAnimePaheSession(selectedAnime.scraperId) ? selectedAnime.scraperId : undefined,
                title: selectedAnime.title,
                image: selectedAnime.images.jpg.large_image_url,
                score: selectedAnime.score,
                type: selectedAnime.type,
                totalCount: selectedAnime.episodes || episodes.length,
                genres: selectedAnime.genres?.map(g => g.name),
                mediaStatus: selectedAnime.status,
                synopsis: selectedAnime.synopsis,
                status: 'watching'
            });
        }
    };

    const handleToggleFavorite = () => {
        if (!selectedAnime || !animeId) return;

        if (inFavorites) {
            removeFavorite(animeId);
        } else {
            addFavorite({
                id: animeId,
                title: selectedAnime.title,
                image: selectedAnime.images.jpg.large_image_url,
                synopsis: selectedAnime.synopsis || ''
            });
        }
    };

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-red-500 gap-4">
                <p className="text-xl font-bold">Error loading anime</p>
                <p className="text-sm text-gray-400">{error}</p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                >
                    Go Home
                </button>
            </div>
        );
    }

    if (!selectedAnime) {
        return <DetailsPageSkeleton />;
    }

    const isUnreleased = selectedAnime.status === 'NOT_YET_RELEASED';
    const hasEpisodes = episodes.length > 0;
    const hasCharacters = Boolean(selectedAnime.characters?.edges?.length);
    const hasTrailers = Boolean(selectedAnime.trailer);
    const isEpisodesResolving = !hasEpisodes && (!episodesResolved || epLoading);
    const expectedEpisodeCount = Number(selectedAnime.episodes || 0);
    const episodeSkeletonCount = Math.min(
        20,
        Math.max(10, Number.isFinite(expectedEpisodeCount) && expectedEpisodeCount > 0 ? expectedEpisodeCount : 10)
    );

    return (
        <div className="min-h-screen bg-[#0a0a0a] pb-20 fade-in animate-in duration-300">
            {/* Banner Section */}
            <DetailsHero
                anime={selectedAnime}
                onBack={() => {
                    if (location.state?.fromRandom) {
                        navigate('/', { replace: true });
                    } else {
                        navigate(-1);
                    }
                }}
            />

            {/* Content Section */}
            <div className="container mx-auto px-4 md:px-6 -mt-24 md:-mt-32 relative z-10">
                <DetailsInfo
                    anime={selectedAnime}
                    episodesCount={episodes.length}
                    isLoading={isEpisodesResolving}
                    inList={inList}
                    inFavorites={inFavorites}
                    onWatch={() => {
                        const title = slugify(selectedAnime.title || selectedAnime.title_english || 'anime');

                        let targetEp: number | undefined;
                        // Smart Logic:
                        if (selectedAnime.status === 'Finished Airing') {
                            targetEp = 1;
                        } else if (selectedAnime.status === 'Currently Airing') {
                            // Use 'latest' keyword
                            targetEp = 'latest' as any;
                        } else {
                            targetEp = 1;
                        }

                        navigate(`/anime/watch/${title}/${id}?ep=${targetEp}`);
                    }}
                    onToggleList={handleToggleList}
                    onToggleFavorite={handleToggleFavorite}
                >
                    {/* Tabs */}
                    <div className="flex items-center gap-8 border-b border-white/10 mb-6 mt-4">
                        <button
                            onClick={() => setActiveTab('summary')}
                            className={`pb-3 text-lg font-bold transition-colors relative ${activeTab === 'summary' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                        >
                            Summary
                            {activeTab === 'summary' && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-yorumi-accent" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('relations')}
                            className={`pb-3 text-lg font-bold transition-colors relative ${activeTab === 'relations' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                        >
                            Relations
                            {activeTab === 'relations' && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-yorumi-accent" />}
                        </button>
                    </div>

                    <div className="">
                        {activeTab === 'summary' && (
                            <>
                                <p className="text-gray-300 text-base leading-relaxed max-w-3xl">
                                    {selectedAnime.synopsis || 'No synopsis.'}
                                </p>
                            </>
                        )}
                    </div>

                    {activeTab === 'summary' && (
                        <>
                            {/* Episodes Section */}
                            {!isUnreleased && (
                                isEpisodesResolving ? (
                                    <EpisodesSkeleton count={episodeSkeletonCount} />
                                ) : episodes.length > 0 ? (
                                    <DetailsEpisodeGrid
                                        episodes={episodes}
                                        watchedEpisodes={watchedEpisodes}
                                        onEpisodeClick={(ep) => {
                                            const raw = String(ep.episodeNumber ?? '').trim();
                                            const direct = Number(raw);
                                            const matched = raw.match(/(\d+(?:\.\d+)?)/);
                                            const episodeNumber = Number.isFinite(direct) ? direct : (matched ? Number(matched[1]) : NaN);
                                            if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
                                                markEpisodeComplete(episodeNumber);
                                            }
                                            const title = slugify(selectedAnime.title || selectedAnime.title_english || 'anime');
                                            navigate(`/anime/watch/${title}/${id}?ep=${ep.episodeNumber}`);
                                        }}
                                    />
                                ) : (
                                    <div className="py-6 border-t border-white/10 mt-6 text-gray-500 text-center">No episodes found.</div>
                                )
                            )}

                            {/* Characters Section */}
                            {detailsLoading && !hasCharacters ? (
                                <CharactersSkeleton />
                            ) : (
                                <DetailsCharacters characters={selectedAnime.characters} />
                            )}

                            {/* Trailers Section */}
                            {detailsLoading && !hasTrailers ? (
                                <TrailersSkeleton />
                            ) : (
                                <DetailsTrailers trailer={selectedAnime.trailer} />
                            )}
                        </>
                    )}

                    {activeTab === 'relations' && (
                        <div className="mt-6">
                            <DetailsRelations
                                relations={selectedAnime.relations}
                                onAnimeClick={(id) => navigate(`/anime/details/${id}`)}
                            />
                        </div>
                    )}
                </DetailsInfo>
            </div>
        </div>
    );
}
