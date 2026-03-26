import { useNavigate } from 'react-router-dom';
import { useContinueWatching } from '../hooks/useContinueWatching';
import { slugify } from '../utils/slugify';
import ContinueWatching from '../features/anime/components/ContinueWatching';
import type { Anime } from '../types/anime';

export default function ContinueWatchingPage() {
    const navigate = useNavigate();
    const { continueWatchingList, removeFromHistory } = useContinueWatching();
    const isAnimePaheSession = (value: unknown) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

    return (
        <div className="min-h-screen bg-[#07090d] pt-24">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
                <ContinueWatching
                    items={continueWatchingList}
                    variant="page"
                    onBack={() => navigate('/profile?tab=anime-overview')}
                    onRemove={(animeId) => removeFromHistory(animeId)}
                    onWatchClick={(anime: Anime, episodeNumber: number, startSeconds?: number) => {
                        const title = slugify(anime.title || 'anime');
                        const rawScraperId = String(anime.scraperId || '').trim();
                        const targetId = rawScraperId && isAnimePaheSession(rawScraperId)
                            ? (rawScraperId.startsWith('s:') ? rawScraperId : `s:${rawScraperId}`)
                            : anime.mal_id;
                        if (!targetId) return;
                        const resume = Number.isFinite(startSeconds) ? Math.max(0, Math.floor(startSeconds || 0)) : 0;
                        navigate(`/anime/watch/${title}/${targetId}?ep=${episodeNumber}${resume > 0 ? `&t=${resume}` : ''}`);
                    }}
                />
            </div>
        </div>
    );
}
