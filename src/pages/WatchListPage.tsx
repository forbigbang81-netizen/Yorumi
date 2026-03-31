import { ArrowLeft, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AnimeCard from '../features/anime/components/AnimeCard';
import { useWatchList } from '../hooks/useWatchList';
import { slugify } from '../utils/slugify';

const isAnimeSessionId = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const getStoredAnimeRouteId = (item: any) => {
    const scraperId = String(item.scraperId || '').trim();
    if (isAnimeSessionId(scraperId)) return `s:${scraperId}`;

    const anilistId = String(item.anilistId || item.id || '').trim();
    return anilistId;
};

const buildStoredAnimeState = (item: any) => {
    const rawId = String(item.anilistId || item.id || '').trim();
    const parsedId = Number.parseInt(rawId, 10);
    const hasNumericId = Number.isFinite(parsedId) && /^\d+$/.test(rawId);

    return {
        id: hasNumericId ? parsedId : 0,
        mal_id: Number.parseInt(String(item.malId || '0'), 10) || 0,
        scraperId: String(item.scraperId || '').trim() || (!hasNumericId && isAnimeSessionId(rawId) ? rawId : undefined),
        title: item.title,
        images: { jpg: { large_image_url: item.image, image_url: item.image } },
        score: item.score || 0,
        type: item.type || 'TV',
        status: item.mediaStatus || 'UNKNOWN',
        episodes: item.totalCount || null,
        genres: item.genres?.map((g: string) => ({ name: g })) || [],
        synopsis: item.synopsis || ''
    };
};

export default function WatchListPage() {
    const navigate = useNavigate();
    const { watchList, removeFromWatchList, loading } = useWatchList();

    return (
        <div className="min-h-screen bg-[#07090d] pt-24 pb-12">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/profile?tab=anime-overview')}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <h1 className="text-2xl font-black text-white tracking-wide uppercase">Watch List</h1>
                </div>

                {loading ? (
                    <div className="text-gray-400">Loading watch list...</div>
                ) : watchList.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                        <Heart className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">Your watch list is empty.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                        {watchList.map((item) => {
                            const animeData: any = buildStoredAnimeState(item);
                            const routeId = getStoredAnimeRouteId(item);

                            return (
                                <AnimeCard
                                    key={item.id}
                                    anime={animeData}
                                    onClick={() => navigate(`/anime/details/${routeId}`, { state: { anime: animeData } })}
                                    onWatchClick={() => {
                                        const title = slugify(item.title || 'anime');
                                        navigate(`/anime/watch/${title}/${routeId}`, { state: { anime: animeData } });
                                    }}
                                    inList={true}
                                    onToggleList={() => removeFromWatchList(item.id)}
                                    disableTilt
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
