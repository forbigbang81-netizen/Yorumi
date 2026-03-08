import { useNavigate } from 'react-router-dom';
import { useContinueWatching } from '../hooks/useContinueWatching';
import { slugify } from '../utils/slugify';
import ContinueWatching from '../features/anime/components/ContinueWatching';
import type { Anime } from '../types/anime';

export default function ContinueWatchingPage() {
    const navigate = useNavigate();
    const { continueWatchingList, removeFromHistory } = useContinueWatching();

    return (
        <div className="min-h-screen bg-[#07090d] pt-24">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
                <ContinueWatching
                    items={continueWatchingList}
                    variant="page"
                    onBack={() => navigate('/profile?tab=anime-overview')}
                    onRemove={(animeId) => removeFromHistory(animeId)}
                    onWatchClick={(anime: Anime, episodeNumber: number) => {
                        const title = slugify(anime.title || 'anime');
                        const targetId = anime.scraperId || anime.mal_id;
                        navigate(`/anime/watch/${title}/${targetId}?ep=${episodeNumber}`);
                    }}
                />
            </div>
        </div>
    );
}
