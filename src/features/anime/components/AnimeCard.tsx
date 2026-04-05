import React from 'react';
import type { Anime } from '../../../types/anime';
import { useTitleLanguage } from '../../../context/TitleLanguageContext';
import { getDisplayTitle } from '../../../utils/titleLanguage';
import { getDisplayImageUrl } from '../../../utils/image';

interface AnimeCardProps {
    anime: Anime;
    onClick: (anime: Anime) => void;
    onWatchClick?: (anime: Anime) => void;
    onMouseEnter?: (anime: Anime) => void;
    inList?: boolean;
    onToggleList?: (anime: Anime) => void;
    disableTilt?: boolean;
}

const AnimeCard: React.FC<AnimeCardProps> = ({
    anime,
    onClick,
    onMouseEnter,
    inList,
    onToggleList,
    disableTilt = false
}) => {
    const { language } = useTitleLanguage();
    const cardRef = React.useRef<HTMLDivElement>(null);
    const [rotation, setRotation] = React.useState({ x: 0, y: 0 });
    const [glare, setGlare] = React.useState({ x: 50, y: 50, opacity: 0 });
    const [isHovered, setIsHovered] = React.useState(false);
    const [popupSide, setPopupSide] = React.useState<'left' | 'right'>('right');

    const isUnreleased = anime.status === 'NOT_YET_RELEASED';
    const episodeCount = isUnreleased ? null : (anime.latestEpisode || anime.episodes);
    const totalEpisodeCount = isUnreleased ? null : anime.episodes;
    const displayTitle = getDisplayTitle(anime as unknown as Record<string, unknown>, language);
    const posterUrl = getDisplayImageUrl(anime.images.jpg.large_image_url || anime.images.jpg.image_url);
    const studioName = anime.studios?.[0]?.name || anime.producers?.[0]?.name || null;
    const displayType = formatDisplayType(anime.type);
    const hoverHeading = anime.nextAiringEpisode
        ? `Ep ${anime.nextAiringEpisode.episode} airing ${formatTimeUntil(anime.nextAiringEpisode.timeUntilAiring)}`
        : formatSeasonLabel(anime, displayType);
    const metaLine = [displayType, totalEpisodeCount ? `${totalEpisodeCount} episodes` : getStatusLabel(anime.status)].filter(Boolean);

    const updatePopupSide = React.useCallback(() => {
        if (typeof window === 'undefined' || !cardRef.current) {
            setPopupSide('right');
            return;
        }

        const rect = cardRef.current.getBoundingClientRect();
        const boundary = cardRef.current.closest('[data-hover-boundary]');
        const boundaryRect = boundary instanceof HTMLElement
            ? boundary.getBoundingClientRect()
            : { right: window.innerWidth - 16 };
        const availableRight = Math.min(window.innerWidth - 16, boundaryRect.right);
        const popupWidth = 260;
        const gap = 16;

        setPopupSide(rect.right + gap + popupWidth > availableRight ? 'left' : 'right');
    }, []);

    React.useEffect(() => {
        if (!isHovered) return;

        updatePopupSide();
        window.addEventListener('resize', updatePopupSide);

        return () => {
            window.removeEventListener('resize', updatePopupSide);
        };
    }, [isHovered, updatePopupSide]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (disableTilt) {
            return;
        }
        if (!cardRef.current) return;

        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;

        setRotation({ x: rotateX, y: rotateY });
        setGlare({
            x: (x / rect.width) * 100,
            y: (y / rect.height) * 100,
            opacity: 1
        });
    };

    const handleMouseLeave = () => {
        setIsHovered(false);

        if (disableTilt) {
            return;
        }

        setRotation({ x: 0, y: 0 });
        setGlare(prev => ({ ...prev, opacity: 0 }));
    };

    return (
        <div
            ref={cardRef}
            className="select-none cursor-pointer group relative z-0 hover:z-50"
            style={{ perspective: '1000px' }}
            onClick={() => onClick(anime)}
            onMouseEnter={(e) => {
                setIsHovered(true);
                updatePopupSide();
                onMouseEnter?.(anime);
                handleMouseMove(e);
            }}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
        >
            <div
                className="relative aspect-[2/3] rounded-lg overflow-visible mb-3 shadow-lg ring-0 outline-none transition-all duration-75 ease-out"
                style={{
                    transform: disableTilt
                        ? 'none'
                        : `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale3d(${isHovered ? 1.05 : 1}, ${isHovered ? 1.05 : 1}, 1)`,
                    transformStyle: 'preserve-3d',
                    boxShadow: isHovered
                        ? '0 20px 40px -5px rgba(0,0,0,0.4), 0 10px 20px -5px rgba(0,0,0,0.2)'
                        : 'none'
                }}
            >
                <div className="relative h-full w-full overflow-hidden rounded-lg">
                    <div
                        className="absolute inset-0 z-30 pointer-events-none mix-blend-overlay transition-opacity duration-300"
                        style={{
                            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.3) 0%, transparent 80%)`,
                            opacity: disableTilt ? 0 : glare.opacity
                        }}
                    />

                    <img
                        src={posterUrl}
                        alt={displayTitle}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />

                    <div className="absolute bottom-2 left-2 flex gap-1.5 z-10">
                        <span className="bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-bold">
                            {anime.type || 'TV'}
                        </span>
                        {episodeCount && (
                            <span className="bg-[#22c55e] text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 4H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v2H6V9h5v2zm7 0h-1.5v-.5h-2v3h2V13H18v2h-5V9h5v2z" /></svg>
                                {episodeCount}
                            </span>
                        )}
                    </div>

                    {onToggleList && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleList(anime);
                            }}
                            className={`absolute bottom-2 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${inList ? 'bg-yorumi-accent text-black hover:bg-yorumi-accent/80' : 'bg-[#1c2433]/90 text-white hover:bg-[#2b364a]'}`}
                            title={inList ? 'Remove from List' : 'Add to List'}
                        >
                            {inList ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            )}
                        </button>
                    )}
                </div>

                {isHovered && (
                    <div className={`pointer-events-none absolute top-2 z-[60] hidden w-[260px] rounded-2xl bg-[#14233a] p-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.45)] lg:block ${popupSide === 'left' ? 'right-[calc(100%+16px)]' : 'left-[calc(100%+16px)]'}`}>
                        <div
                            className="absolute top-7 h-3 w-3 bg-[#14233a]"
                            style={popupSide === 'left'
                                ? { right: -8, clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }
                                : { left: -8, clipPath: 'polygon(100% 0, 0 50%, 100% 100%)' }}
                        />

                        <div className="space-y-3">
                            <p className="text-sm font-extrabold tracking-wide text-[#dbe8ff]">
                                {hoverHeading}
                            </p>

                            {studioName && (
                                <p className="text-sm font-bold text-[#7fd5ff]">
                                    {studioName}
                                </p>
                            )}

                            <p className="text-sm font-semibold text-[#9fb5d5]">
                                {metaLine.join(' • ')}
                            </p>

                            {anime.genres && anime.genres.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {anime.genres.slice(0, 2).map((genre) => (
                                        <span key={genre.mal_id} className="rounded-full bg-[#22d3ee] px-3 py-1 text-[11px] font-extrabold lowercase tracking-wide text-[#083d49]">
                                            {genre.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 leading-tight group-hover:text-yorumi-accent transition-colors">
                {displayTitle}
            </h3>
        </div>
    );
};

function formatTimeUntil(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return 'soon';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);

    if (days > 0) {
        return `in ${days} day${days === 1 ? '' : 's'}`;
    }

    if (hours > 0) {
        return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    const minutes = Math.max(1, Math.floor((seconds % 3600) / 60));
    return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function formatSeasonLabel(item: Anime, displayType: string) {
    if (item.season && item.year) {
        return `${capitalize(item.season)} ${item.year}`;
    }

    if (item.season) {
        return capitalize(item.season);
    }

    if (item.year) {
        return String(item.year);
    }

    return displayType;
}

function formatDisplayType(value?: string | null) {
    if (!value) return 'TV Show';
    if (value === 'TV') return 'TV Show';
    return value.replaceAll('_', ' ');
}

function getStatusLabel(value?: string | null) {
    if (!value) return 'Details unavailable';

    switch (value) {
        case 'RELEASING':
            return 'Airing now';
        case 'FINISHED':
            return 'Completed';
        case 'NOT_YET_RELEASED':
            return 'Not yet released';
        default:
            return value.replaceAll('_', ' ').toLowerCase();
    }
}

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export default AnimeCard;
