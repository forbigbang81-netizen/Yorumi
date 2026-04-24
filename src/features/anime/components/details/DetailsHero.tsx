import { ChevronRight, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Anime } from '../../../../types/anime';
import { useTitleLanguage } from '../../../../context/TitleLanguageContext';
import { getDisplayTitle } from '../../../../utils/titleLanguage';

interface DetailsHeroProps {
    anime: Anime;
}

export default function DetailsHero({ anime }: DetailsHeroProps) {
    const navigate = useNavigate();
    const { language } = useTitleLanguage();
    const bannerImage = anime.anilist_banner_image || anime.images.jpg.large_image_url;
    const displayTitle = getDisplayTitle(anime as unknown as Record<string, unknown>, language);

    return (
        <div className="relative h-[40vh] md:h-[50vh] w-full overflow-hidden">
            <div className="absolute inset-0">
                <img
                    src={bannerImage}
                    alt={displayTitle}
                    className={`w-full h-full object-cover ${!anime.anilist_banner_image ? 'blur-xl opacity-50 scale-110' : ''}`}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
            </div>

            <div className="absolute inset-x-0 top-[72px] z-10 px-4 md:px-10">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 -ml-2 text-white/70 hover:text-white transition-all hover:bg-white/10 rounded-lg active:scale-95 group"
                        aria-label="Go Home"
                    >
                        <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
                    <h1 className="text-sm font-bold text-white tracking-wide truncate drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]">
                        {displayTitle}
                    </h1>
                </div>
            </div>
        </div>
    );
}
