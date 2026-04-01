
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, History, Pencil, Check, X, BookOpen, Cat, Book, ChevronLeft, ChevronRight } from 'lucide-react';
import { useContinueWatching } from '../hooks/useContinueWatching';
import { useContinueReading } from '../hooks/useContinueReading';
import { useWatchList } from '../hooks/useWatchList';
import { useReadList } from '../hooks/useReadList';
import { useFavoriteAnime } from '../hooks/useFavoriteAnime';
import { useFavoriteManga } from '../hooks/useFavoriteManga';
import { slugify } from '../utils/slugify';
import { storage } from '../utils/storage';
import { animeService } from '../services/animeService';
import { mangaService } from '../services/mangaService';
import useEmblaCarousel from 'embla-carousel-react';

type TabType = 'profile' | 'anime-overview' | 'manga-overview';

const isAnimeSessionId = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const getStoredAnimeRouteId = (item: any) => {
    const scraperId = String(item.scraperId || '').trim();
    if (isAnimeSessionId(scraperId)) return `s:${scraperId}`;

    return String(item.anilistId || item.id || '').trim();
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

export default function ProfilePage() {
    const { user, avatar, banner, updateBanner } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);

    const activeTab = (searchParams.get('tab') as TabType) || 'profile';
    const isMangaOverview = activeTab === 'manga-overview';

    const handleTabChange = (tab: TabType) => {
        setSearchParams({ tab });
    };

    // Redirect to home if not logged in
    useEffect(() => {
        if (!user) {
            navigate('/');
        }
    }, [user, navigate]);

    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#0a0a0a] relative">
            {/* Full Width Hero Section */}
            <div className="relative w-full h-[35vh] md:h-[45vh] flex flex-col items-center justify-center overflow-hidden">
                {/* Background Image */}
                <div className="absolute inset-0 z-0">
                    <img
                        src={banner || '/anime-bg.png'}
                        alt="Background"
                        className="w-full h-full object-cover opacity-60"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/30 to-transparent" />
                    <button
                        onClick={() => setIsBannerModalOpen(true)}
                        className="absolute top-4 right-4 z-20 text-white/70 hover:text-white transition-colors"
                        title="Change banner"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                </div>

                {/* Greeting Content */}
                <div className="relative z-10 flex flex-col items-center mt-4 md:mt-10 px-4 text-center">
                    <h1 className="text-4xl md:text-8xl font-black text-white tracking-tight mb-4 drop-shadow-2xl">
                        Hi, <span className={isMangaOverview ? 'text-yorumi-manga' : 'text-yorumi-accent'}>{user.displayName?.split(' ')[0] || 'User'}</span>
                    </h1>
                    <p className="text-gray-200 text-lg md:text-2xl font-medium drop-shadow-lg">
                        Welcome back to your personal hub
                    </p>
                </div>

                {/* Navigation Tabs - Positioned at bottom of hero */}
                <div className="absolute bottom-0 w-full flex justify-center z-20">
                    <div className="flex flex-nowrap overflow-x-auto justify-start md:justify-center gap-6 md:gap-16 border-b border-white/10 w-full max-w-5xl px-4 md:px-8 mx-4 no-scrollbar pb-0.5">
                        <TabButton
                            active={activeTab === 'profile'}
                            onClick={() => handleTabChange('profile')}
                            icon={<User className={activeTab === 'profile' ? "w-5 h-5 fill-current" : "w-5 h-5"} />}
                            label="Profile"
                        />
                        <TabButton
                            active={activeTab === 'anime-overview'}
                            onClick={() => handleTabChange('anime-overview')}
                            icon={<Cat className={activeTab === 'anime-overview' ? "w-5 h-5 fill-current" : "w-5 h-5"} />}
                            label="Anime Overview"
                        />
                        <TabButton
                            active={activeTab === 'manga-overview'}
                            onClick={() => handleTabChange('manga-overview')}
                            icon={<Book className={activeTab === 'manga-overview' ? "w-5 h-5 fill-current" : "w-5 h-5"} />}
                            label="Manga Overview"
                            activeClassName="text-yorumi-manga border-yorumi-manga"
                        />
                    </div>
                </div>
            </div>

            <BannerSelectionModal
                isOpen={isBannerModalOpen}
                onClose={() => setIsBannerModalOpen(false)}
                currentBanner={banner}
                onSelectBanner={async (path) => {
                    await updateBanner(path);
                    setIsBannerModalOpen(false);
                }}
            />

            {/* Content Section */}
            <div className="max-w-7xl mx-auto px-3 md:px-8 py-8 md:py-12 relative z-10">
                {activeTab === 'profile' && <ProfileTab user={user} avatar={avatar} />}
                {activeTab === 'anime-overview' && <AnimeOverviewTab />}
                {activeTab === 'manga-overview' && <MangaOverviewTab />}
            </div>
        </div>
    );
}

// Components

const TabButton = ({
    active,
    onClick,
    icon,
    label,
    activeClassName = 'text-yorumi-accent border-yorumi-accent'
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    activeClassName?: string;
}) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 md:gap-3 pb-3 md:pb-4 text-sm md:text-lg font-bold transition-all duration-300 border-b-2 outline-none whitespace-nowrap shrink-0 ${active
            ? activeClassName
            : 'text-gray-400 border-transparent hover:text-white hover:border-white/20'
            }`}
    >
        {icon}
        {label}
    </button>
);

// Add component import
import AvatarSelectionModal from '../components/modals/AvatarSelectionModal';
import BannerSelectionModal from '../components/modals/BannerSelectionModal';
import AnimeCard from '../features/anime/components/AnimeCard';
import MangaCard from '../features/manga/components/MangaCard';

import { useActivityHistory } from '../hooks/useActivityHistory';

const ActivityOverview = () => {
    const { activityData } = useActivityHistory();
    const weeks = 29; // 29 columns x 7 rows
    const days = 7;

    // Generate dates for a 14-week heatmap ending today
    const grid: React.ReactNode[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let w = 0; w < weeks; w++) {
        for (let d = 0; d < days; d++) {
            // Calculate days ago (backwards from bottom right)
            const daysAgo = (weeks - 1 - w) * days + (6 - d);

            const date = new Date(today);
            date.setDate(date.getDate() - daysAgo);

            // Hide future dates if the offset pushes into the future (not applicable here as we end today, but to be safe)
            if (date > today) {
                grid.push(<div key={`${w}-${d}`} className="w-[7px] h-[7px] md:w-3.5 md:h-3.5 rounded-sm opacity-0"></div>);
                continue;
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;

            const amount = activityData[dateString] || 0;

            let color = 'bg-[#3b3b3b]';
            if (amount >= 5) color = 'bg-[#39d353]';
            else if (amount >= 3) color = 'bg-[#26a641]';
            else if (amount >= 2) color = 'bg-[#006d32]';
            else if (amount >= 1) color = 'bg-[#0e4429]';

            const displayDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

            const tooltipPositionClass =
                w === 0
                    ? 'left-0 translate-x-0'
                    : w === weeks - 1
                        ? 'right-0 translate-x-0'
                        : 'left-1/2 -translate-x-1/2';
            const tooltipArrowClass =
                w === 0
                    ? 'left-4 -translate-x-0'
                    : w === weeks - 1
                        ? 'right-4 -translate-x-0'
                        : 'left-1/2 -translate-x-1/2';
            const placeTooltipAbove = d >= days - 2;
            const tooltipVerticalClass = placeTooltipAbove ? 'bottom-full mb-2' : 'top-full mt-2';
            const tooltipArrowVerticalClass = placeTooltipAbove
                ? 'top-full border-t-[#1a1c23]'
                : 'bottom-full border-b-[#1a1c23]';

            grid.push(
                <div key={`${w}-${d}`} className="relative group/tooltip">
                    <div className={`w-[7px] h-[7px] md:w-3.5 md:h-3.5 rounded-[2px] md:rounded-[3px] ${color} transition-colors hover:ring-1 hover:ring-white/50 cursor-pointer`}></div>

                    {/* Tooltip */}
                    <div className={`absolute ${tooltipVerticalClass} ${tooltipPositionClass} w-max px-3 py-2 bg-[#1a1c23] text-white text-xs rounded-md opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none shadow-xl border border-white/10 flex flex-col items-center`}>
                        <span className="font-bold text-[13px] mb-1">{displayDate}</span>
                        <div className="flex items-center gap-1.5 text-gray-400 font-medium">
                            <div className="w-2 h-2 rounded-full bg-[#518feb]"></div>
                            Amount: <span className="text-white font-bold">{amount}</span>
                        </div>
                        <div className={`absolute ${tooltipArrowVerticalClass} ${tooltipArrowClass} border-4 border-transparent`}></div>
                    </div>
                </div>
            );
        }
    }

    return (
        <div>
            <h3 className="text-xs font-bold text-gray-500 mb-3 px-1">Activity Overview</h3>
            <div className="bg-[#1c1c1c] rounded-2xl p-4 md:p-6 overflow-visible">
                <div className="w-full flex justify-center overflow-visible pt-2 md:pt-4">
                    <div className="grid grid-rows-7 grid-flow-col gap-[2px] md:gap-[4px] overflow-visible">
                        {grid}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-4 text-[11px] text-gray-500 font-medium flex-wrap">
                    <span>Less</span>
                    <div className="flex gap-1">
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#3b3b3b]"></div>
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#0e4429]"></div>
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#006d32]"></div>
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#26a641]"></div>
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#39d353]"></div>
                    </div>
                    <span>More</span>
                </div>
            </div>
        </div>
    );
};

const GenreOverview = () => <OverallGenreOverview theme="both" />;


const RecentActivity = () => {
    const { continueWatchingList } = useContinueWatching();
    const { continueReadingList } = useContinueReading();
    const navigate = useNavigate();

    const [activities, setActivities] = useState<any[]>([]);

    useEffect(() => {
        const watching = continueWatchingList.map(item => {
            const data = item as any;
            const posterImage = data.posterImage || data.animePoster || data.image || item.animeImage;
            const bannerImage = data.bannerImage || data.animeBannerImage || data.animeBanner || item.animeImage || posterImage;

            return {
                ...item,
                id: `w-${item.animeId}`,
                type: 'watching',
                time: item.lastWatched || item.timestamp,
                title: item.animeTitle,
                posterImage,
                bannerImage,
                subtitle: `Watched Episode ${item.episodeNumber} of`,
                titleColor: 'text-[#518feb]'
            };
        });

        const reading = continueReadingList.map(item => {
            const data = item as any;
            const posterImage = data.posterImage || data.mangaPoster || data.image || item.mangaImage;
            const bannerImage = data.bannerImage || data.mangaBannerImage || data.mangaBanner || item.mangaImage || posterImage;

            return {
                ...item,
                id: `r-${item.mangaId}`,
                type: 'reading',
                time: item.lastRead || item.timestamp,
                title: item.mangaTitle,
                posterImage,
                bannerImage,
                subtitle: `Read Chapter ${item.chapterNumber} of`,
                titleColor: 'text-yorumi-manga'
            };
        });

        const combined = [...watching, ...reading].sort((a, b) => b.time - a.time).slice(0, 3);
        setActivities(combined);
    }, [continueWatchingList, continueReadingList]);

    if (activities.length === 0) return null;

    return (
        <div>
            <h3 className="text-xs font-bold text-gray-500 mb-4 px-1">Recent Activity</h3>
            <div className="space-y-3">
                {activities.map((item) => (
                    <div
                        key={item.id}
                        onClick={() => {
                            if (item.type === 'watching') {
                                const title = slugify(item.title || 'anime');
                                const resume = Number.isFinite((item as any).positionSeconds)
                                    ? Math.max(0, Math.floor((item as any).positionSeconds))
                                    : 0;
                                navigate(`/anime/watch/${title}/${item.animeId}?ep=${item.episodeNumber}${resume > 0 ? `&t=${resume}` : ''}`);
                                return;
                            }

                            const title = slugify(item.title || 'manga');
                            navigate(`/manga/read/${title}/${item.mangaId}/c${item.chapterNumber}`);
                        }}
                        className="relative flex rounded-xl overflow-hidden h-24 md:h-28 cursor-pointer"
                        style={{
                            backgroundImage: `linear-gradient(90deg, rgba(17,17,17,0.95) 0%, rgba(17,17,17,0.9) 45%, rgba(17,17,17,0.82) 100%), url(${item.bannerImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }}
                    >
                        <div className="h-full w-20 md:w-28 shrink-0">
                            <img src={item.posterImage} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center relative z-10 px-4 md:px-5 py-3 md:py-4">
                            <p className="text-[13px] md:text-[15px] font-bold text-gray-100 mb-0.5 truncate">{item.subtitle}</p>
                            <p className={`text-[13px] md:text-[15px] font-bold ${item.titleColor} truncate`}>{item.title}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ProfileTab = ({ user, avatar }: { user: any, avatar: string | null }) => {
    const { updateName, updateAvatar, profileCardBackground, updateProfileCardBackground } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [isCardBackgroundModalOpen, setIsCardBackgroundModalOpen] = useState(false);
    const [newName, setNewName] = useState(user.displayName || '');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!newName.trim() || newName === user.displayName) {
            setIsEditing(false);
            return;
        }
        setLoading(true);
        try {
            await updateName(newName);
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to update name", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarSelect = async (path: string) => {
        await updateAvatar(path);
        setIsAvatarModalOpen(false);
    };

    return (
        <div className="w-full max-w-[1180px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 xl:gap-8">
            <div className="space-y-6 md:space-y-8 min-w-0">
                <div
                    className="group relative bg-[#1c1c1c] rounded-2xl p-5 md:p-7 overflow-hidden"
                    style={profileCardBackground
                        ? {
                            backgroundImage: `linear-gradient(90deg, rgba(28,28,28,0.94) 0%, rgba(28,28,28,0.9) 48%, rgba(28,28,28,0.84) 100%), url(${profileCardBackground})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }
                        : undefined}
                >
                    <button
                        onClick={() => setIsCardBackgroundModalOpen(true)}
                        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                        title="Change card background"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <h2 className="text-[20px] md:text-[22px] font-bold mb-6 md:mb-7 flex items-center gap-3 text-white">
                        <User className="w-6 h-6 text-[#518feb] fill-[#518feb]" />
                        Profile Details
                    </h2>

                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                        <div className="flex justify-center sm:justify-start sm:pt-1">
                            <div className="relative w-24 h-24 shrink-0">
                                <div
                                    className="group/avatar w-full h-full rounded-full overflow-hidden border-4 border-[#3cb6ff] shadow-xl bg-yorumi-main cursor-pointer"
                                    onClick={() => setIsAvatarModalOpen(true)}
                                >
                                    {avatar ? (
                                        <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-4xl">
                                            {user.displayName?.charAt(0).toUpperCase()}
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center rounded-full pointer-events-none">
                                        <Pencil className="w-7 h-7 text-white" />
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsAvatarModalOpen(true)}
                                    className="absolute -bottom-1 -right-1 w-8 h-8 flex items-center justify-center bg-[#c37df0] rounded-full text-black shadow-lg transition-colors border-2 border-[#1c1c1c]"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 space-y-5">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Display Name</label>
                                {isEditing ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-yorumi-accent flex-1 font-bold text-base"
                                            placeholder="Enter display name"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSave}
                                            disabled={loading}
                                            className="p-2 bg-yorumi-accent text-black rounded-lg hover:bg-yorumi-accent/80 transition-colors disabled:opacity-50"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setNewName(user.displayName || '');
                                            }}
                                            disabled={loading}
                                            className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="min-w-0">
                                        <div className="inline-flex items-center gap-2 group/name max-w-full">
                                            <div className="text-xl md:text-2xl font-black text-white tracking-tight leading-none truncate">{user.displayName || 'No Name Set'}</div>
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="px-2 py-1 rounded-lg text-gray-400 opacity-0 group-hover/name:opacity-100 hover:text-white hover:bg-white/10 transition-all text-xs font-bold"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Email Address</label>
                                <div className="text-sm md:text-[15px] font-bold text-white break-all">{user.email}</div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Joined On</label>
                                <div className="text-sm md:text-[15px] font-bold text-white">
                                    {user.metadata?.creationTime
                                        ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })
                                        : 'January 18, 2026'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <AvatarSelectionModal
                        isOpen={isAvatarModalOpen}
                        onClose={() => setIsAvatarModalOpen(false)}
                        currentAvatar={avatar}
                        onSelectAvatar={handleAvatarSelect}
                    />
                    <BannerSelectionModal
                        isOpen={isCardBackgroundModalOpen}
                        onClose={() => setIsCardBackgroundModalOpen(false)}
                        currentBanner={profileCardBackground}
                        onSelectBanner={async (path) => {
                            await updateProfileCardBackground(path);
                            setIsCardBackgroundModalOpen(false);
                        }}
                    />
                </div>

                <GenreOverview />
            </div>

            <div className="space-y-6 md:space-y-8 min-w-0">
                <ActivityOverview />
                <RecentActivity />
            </div>
        </div>
    );
};

const AnimeOverviewTab = () => {
    return (
        <div className="space-y-10">
            <div className="w-full max-w-[1180px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 xl:gap-8">
                <div className="space-y-6 md:space-y-8 min-w-0">
                    <AnimeStatsOverview />
                    <AnimeGenreOverview />
                    <FavoriteAnimeBoard />
                </div>
                <div className="space-y-6 md:space-y-8 min-w-0">
                    <AnimeContinueWatchingHighlights showSeeAll />
                    <AnimeWatchListCarousel />
                </div>
            </div>
        </div>
    );
};

const MangaOverviewTab = () => {
    return (
        <div className="space-y-10">
            <div className="w-full max-w-[1180px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 xl:gap-8">
                <div className="space-y-6 md:space-y-8 min-w-0">
                    <MangaStatsOverview />
                    <MangaGenreOverview />
                    <MangaFavoriteBoard />
                </div>
                <div className="space-y-6 md:space-y-8 min-w-0">
                    <MangaContinueReadingHighlights showSeeAll />
                    <MangaReadListCarousel />
                </div>
            </div>
        </div>
    );
};

type CompletionMeta = {
    totalCount: number;
    isFinished: boolean;
};

const normalizeCompletionStatusKey = (value: unknown) =>
    String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');

const isFinishedAnimeStatus = (value: unknown) =>
    new Set(['finished', 'finishedairing', 'completed']).has(normalizeCompletionStatusKey(value));

const isFinishedMangaStatus = (value: unknown) =>
    new Set(['finished', 'finishedpublishing', 'completed']).has(normalizeCompletionStatusKey(value));

const readPositiveCount = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const upsertCompletionMeta = (
    metaMap: Map<string, CompletionMeta>,
    key: string,
    item: any,
    isFinishedStatus: (value: unknown) => boolean
) => {
    const current = metaMap.get(key) || { totalCount: 0, isFinished: false };
    metaMap.set(key, {
        totalCount: Math.max(current.totalCount, readPositiveCount(item?.totalCount)),
        isFinished: current.isFinished || isFinishedStatus(item?.mediaStatus || item?.status)
    });
};

const applyAnimeCompletionSnapshot = (
    animeGroups: Map<string, Set<string>>,
    completionMeta: Map<string, CompletionMeta>,
    animeCompletionCache: Record<string, { title?: string; totalCount?: number; mediaStatus?: string }>,
    normalizeTitleKey: (title?: string) => string
) => {
    Object.entries(animeCompletionCache || {}).forEach(([animeId, snapshot]) => {
        const alreadyGrouped = Array.from(animeGroups.values()).some((ids) => ids.has(animeId));
        if (alreadyGrouped) return;

        const key = normalizeTitleKey(snapshot?.title) || `history:${animeId}`;
        if (!animeGroups.has(key)) {
            animeGroups.set(key, new Set<string>());
        }
        animeGroups.get(key)!.add(animeId);
        upsertCompletionMeta(completionMeta, key, snapshot, isFinishedAnimeStatus);
    });
};

const applyMangaCompletionSnapshot = (
    mangaGroups: Map<string, Set<string>>,
    completionMeta: Map<string, CompletionMeta>,
    mangaCompletionCache: Record<string, { title?: string; totalCount?: number; mediaStatus?: string }>,
    normalizeTitleKey: (title?: string) => string
) => {
    Object.entries(mangaCompletionCache || {}).forEach(([mangaId, snapshot]) => {
        const alreadyGrouped = Array.from(mangaGroups.values()).some((ids) => ids.has(mangaId));
        if (alreadyGrouped) return;

        const key = normalizeTitleKey(snapshot?.title) || `history:${mangaId}`;
        if (!mangaGroups.has(key)) {
            mangaGroups.set(key, new Set<string>());
        }
        mangaGroups.get(key)!.add(mangaId);
        upsertCompletionMeta(completionMeta, key, snapshot, isFinishedMangaStatus);
    });
};

const countCompletedAnimeGroups = (
    animeGroups: Map<string, Set<string>>,
    groupProgressEpisodes: Map<string, Set<number>>,
    episodeHistory: Record<string, number[]>,
    completionMeta: Map<string, CompletionMeta>
) => Array.from(animeGroups.entries()).reduce((sum, [groupKey, ids]) => {
    const meta = completionMeta.get(groupKey);
    if (!meta || !meta.isFinished || meta.totalCount <= 0) return sum;

    const uniqueEpisodes = new Set<number>();
    ids.forEach((id) => {
        (episodeHistory[id] || []).forEach((ep) => {
            const n = typeof ep === 'number' ? ep : Number(ep);
            if (Number.isFinite(n) && n > 0) uniqueEpisodes.add(n);
        });
    });
    (groupProgressEpisodes.get(groupKey) || new Set<number>()).forEach((ep) => uniqueEpisodes.add(ep));

    return sum + (uniqueEpisodes.size >= meta.totalCount ? 1 : 0);
}, 0);

const countCompletedMangaGroups = (
    mangaGroups: Map<string, Set<string>>,
    groupProgressChapters: Map<string, Set<string>>,
    chapterHistory: Record<string, string[]>,
    completionMeta: Map<string, CompletionMeta>
) => Array.from(mangaGroups.entries()).reduce((sum, [groupKey, ids]) => {
    const meta = completionMeta.get(groupKey);
    if (!meta || !meta.isFinished || meta.totalCount <= 0) return sum;

    const uniqueChapters = new Set<string>();
    ids.forEach((id) => {
        (chapterHistory[id] || []).forEach((chapter) => uniqueChapters.add(String(chapter)));
    });
    (groupProgressChapters.get(groupKey) || new Set<string>()).forEach((chapter) => uniqueChapters.add(chapter));

    return sum + (uniqueChapters.size >= meta.totalCount ? 1 : 0);
}, 0);

const MangaStatsOverview = () => {
    const { readList } = useReadList();
    const { continueReadingList } = useContinueReading();
    const { favorites } = useFavoriteManga();
    const [statsTick, setStatsTick] = useState(0);

    useEffect(() => {
        const onStorageUpdated = () => setStatsTick((v) => v + 1);
        window.addEventListener('yorumi-storage-updated', onStorageUpdated as EventListener);
        return () => window.removeEventListener('yorumi-storage-updated', onStorageUpdated as EventListener);
    }, []);
    const hasAccountMangaHistory = readList.length > 0 || continueReadingList.length > 0 || favorites.length > 0;
    const valueClassName = hasAccountMangaHistory ? 'text-yorumi-manga' : 'text-gray-400';
    const chapterHistory = storage.getChapterHistory();
    const mangaCompletionCache = React.useMemo(() => storage.getMangaCompletionCache(), [statsTick]);
    const normalizeTitleKey = (title?: string) =>
        (title || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();

    const mangaGroups = new Map<string, Set<string>>();
    const groupProgressChapters = new Map<string, Set<string>>();
    const mangaCompletionMeta = new Map<string, CompletionMeta>();
    const ensureGroup = (groupKey: string) => {
        if (!mangaGroups.has(groupKey)) mangaGroups.set(groupKey, new Set<string>());
        return mangaGroups.get(groupKey)!;
    };
    const ensureGroupProgress = (groupKey: string) => {
        if (!groupProgressChapters.has(groupKey)) groupProgressChapters.set(groupKey, new Set<string>());
        return groupProgressChapters.get(groupKey)!;
    };

    readList.forEach((item) => {
        const key = normalizeTitleKey(item.title) || `id:${String(item.id)}`;
        ensureGroup(key).add(String(item.id));
        upsertCompletionMeta(mangaCompletionMeta, key, item, isFinishedMangaStatus);
    });

    continueReadingList.forEach((item) => {
        const key = normalizeTitleKey(item.mangaTitle) || `id:${String(item.mangaId)}`;
        ensureGroup(key).add(String(item.mangaId));
        upsertCompletionMeta(mangaCompletionMeta, key, item, isFinishedMangaStatus);
        const chapter = String(item.chapterNumber || '').trim();
        if (chapter) {
            ensureGroupProgress(key).add(chapter);
        }
    });

    favorites.forEach((item) => {
        const key = normalizeTitleKey(item.title) || `id:${String(item.id)}`;
        ensureGroup(key).add(String(item.id));
        upsertCompletionMeta(mangaCompletionMeta, key, item, isFinishedMangaStatus);
    });

    applyMangaCompletionSnapshot(mangaGroups, mangaCompletionMeta, mangaCompletionCache, normalizeTitleKey);

    const totalManga = hasAccountMangaHistory ? mangaGroups.size : 0;

    const totalChaptersRead = hasAccountMangaHistory
        ? Array.from(mangaGroups.entries()).reduce((sum, [groupKey, ids]) => {
            const uniqueChapters = new Set<string>();
            ids.forEach((id) => {
                (chapterHistory[id] || []).forEach((chapter) => uniqueChapters.add(String(chapter)));
            });
            (groupProgressChapters.get(groupKey) || new Set<string>()).forEach((chapter) => uniqueChapters.add(chapter));
            return sum + uniqueChapters.size;
        }, 0)
        : 0;

    const completedManga = hasAccountMangaHistory
        ? countCompletedMangaGroups(mangaGroups, groupProgressChapters, chapterHistory, mangaCompletionMeta)
        : 0;
    const fmt = new Intl.NumberFormat('en-US');

    return (
        <div>
            <h3 className="text-xs font-bold text-gray-500 mb-3 px-1">Manga Stats</h3>
            <div className="bg-[#1c1c1c] rounded-3xl p-5 md:p-6">
                <div className="grid grid-cols-3 gap-4 divide-x divide-white/20">
                    <StatItem value={fmt.format(totalManga)} label="TOTAL MANGA" valueClassName={valueClassName} />
                    <StatItem value={fmt.format(totalChaptersRead)} label="CHAPTERS READ" valueClassName={valueClassName} />
                    <StatItem value={fmt.format(completedManga)} label="COMPLETED MANGA" valueClassName={valueClassName} />
                </div>
            </div>
        </div>
    );
};

const MangaGenreOverview = () => <OverallGenreOverview theme="manga" />;

const MangaFavoriteBoard = () => {
    const { favorites } = useFavoriteManga();
    const navigate = useNavigate();

    return (
        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-bold text-gray-500">Favorite Mangas</h3>
                <button
                    onClick={() => navigate('/manga/favorites')}
                    className="text-xs text-yorumi-manga hover:text-yorumi-manga/80 font-semibold"
                >
                    See All
                </button>
            </div>
            <div className="bg-[#1c1c1c] rounded-3xl p-5 md:p-6">
                {favorites.length === 0 ? (
                    <div className="h-[160px] rounded-xl border border-dashed border-white/15 flex items-center justify-center text-sm text-gray-500">
                        Add favorites using the heart button in manga details.
                    </div>
                ) : (
                    <div className="grid grid-cols-6 gap-3">
                        {favorites.slice(0, 12).map((item) => (
                            <button
                                key={item.id}
                                onClick={() => navigate(`/manga/details/${item.id}`)}
                                className="aspect-[2/3] rounded-lg overflow-hidden border border-white/10 hover:border-yorumi-manga/70 transition-colors"
                            >
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const MangaReadListCarousel = () => {
    const { readList, loading, removeFromReadList } = useReadList();
    const navigate = useNavigate();
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: 'start',
        containScroll: 'trimSnaps',
        dragFree: true
    });

    const previewList = readList.slice(0, 10);

    const scrollByCards = (direction: 'left' | 'right') => {
        if (!emblaApi) return;
        if (direction === 'right') emblaApi.scrollNext();
        else emblaApi.scrollPrev();
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-bold text-gray-500">Read List</h3>
                <div className="flex items-center gap-3">
                    {previewList.length > 3 && (
                        <div className="flex gap-1">
                            <button
                                onClick={() => scrollByCards('left')}
                                className="p-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                                aria-label="Scroll read list left"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-gray-300" />
                            </button>
                            <button
                                onClick={() => scrollByCards('right')}
                                className="p-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                                aria-label="Scroll read list right"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                            </button>
                        </div>
                    )}
                    <button onClick={() => navigate('/manga/read-list')} className="text-xs text-yorumi-manga hover:text-yorumi-manga/80 font-semibold">
                        View All
                    </button>
                </div>
            </div>
            <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex gap-5">
                    {(loading ? [] : previewList).map((item) => {
                        const mangaData: any = {
                            mal_id: parseInt(item.id),
                            title: item.title,
                            images: { jpg: { large_image_url: item.image, image_url: item.image } },
                            score: item.score || 0,
                            type: item.type || 'Manga',
                            status: item.mediaStatus || 'UNKNOWN',
                            chapters: item.totalCount || null,
                            volumes: null,
                            genres: item.genres?.map((g: string) => ({ name: g })) || [],
                            synopsis: item.synopsis || ''
                        };

                        return (
                            <div key={item.id} className="flex-[0_0_165px] min-w-0">
                                <MangaCard
                                    manga={mangaData}
                                    onClick={() => navigate(`/manga/details/${item.id}`, { state: { manga: mangaData } })}
                                    onReadClick={() => navigate(`/manga/details/${item.id}`, { state: { manga: mangaData } })}
                                    inList={true}
                                    onToggleList={() => removeFromReadList(item.id)}
                                    disableTilt
                                />
                            </div>
                        );
                    })}
                    {!loading && readList.length === 0 && (
                        <div className="w-full bg-[#1c1c1c] rounded-xl p-6 text-center text-sm text-gray-500 border border-white/10">
                            Your read list is empty.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const OverallGenreOverview = ({ theme }: { theme: 'anime' | 'manga' | 'both' }) => {
    const { watchList } = useWatchList();
    const { readList } = useReadList();
    const { continueWatchingList } = useContinueWatching();
    const { continueReadingList } = useContinueReading();
    const { favorites: favoriteAnime } = useFavoriteAnime();
    const { favorites: favoriteManga } = useFavoriteManga();

    const [animeGenreCache, setAnimeGenreCache] = useState<Record<string, string[]>>(() => storage.getAnimeGenreCache());
    const [mangaGenreCache, setMangaGenreCache] = useState<Record<string, string[]>>(() => storage.getMangaGenreCache());
    const animeCacheRef = useRef<Record<string, string[]>>(storage.getAnimeGenreCache());
    const mangaCacheRef = useRef<Record<string, string[]>>(storage.getMangaGenreCache());

    const normalizeGenres = (genres: any): string[] => {
        if (!Array.isArray(genres)) return [];
        return genres
            .map((genreObj: any) => (typeof genreObj === 'string' ? genreObj : (genreObj?.name || genreObj)))
            .filter(Boolean);
    };

    useEffect(() => {
        let cancelled = false;

        const loadMissingAnimeGenres = async () => {
            const watchListMap = new Map<string, string[]>(
                watchList.map((item) => [item.id, normalizeGenres(item.genres)])
            );
            const unresolvedAnimeIds = Array.from(new Set([
                ...continueWatchingList.map((item) => String(item.animeId)),
                ...favoriteAnime.map((item) => String(item.id))
            ])).filter((animeId) => !watchListMap.has(animeId) && !animeCacheRef.current[animeId]);

            if (unresolvedAnimeIds.length === 0) {
                if (!cancelled) setAnimeGenreCache({ ...animeCacheRef.current });
                return;
            }

            const updates: Record<string, string[]> = {};
            await Promise.all(
                unresolvedAnimeIds.map(async (animeId) => {
                    try {
                        const res = await animeService.getAnimeDetails(animeId);
                        updates[animeId] = normalizeGenres(res?.data?.genres || []);
                    } catch {
                        updates[animeId] = [];
                    }
                })
            );

            if (!cancelled) {
                animeCacheRef.current = { ...animeCacheRef.current, ...updates };
                storage.setAnimeGenreCache(animeCacheRef.current);
                setAnimeGenreCache({ ...animeCacheRef.current });
            }
        };

        loadMissingAnimeGenres();
        return () => { cancelled = true; };
    }, [watchList, continueWatchingList, favoriteAnime]);

    useEffect(() => {
        let cancelled = false;

        const loadMissingMangaGenres = async () => {
            const readListMap = new Map<string, string[]>(
                readList.map((item) => [item.id, normalizeGenres(item.genres)])
            );
            const unresolvedMangaIds = Array.from(new Set([
                ...continueReadingList.map((item) => String(item.mangaId)),
                ...favoriteManga.map((item) => String(item.id))
            ])).filter((mangaId) => !readListMap.has(mangaId) && !mangaCacheRef.current[mangaId]);

            if (unresolvedMangaIds.length === 0) {
                if (!cancelled) setMangaGenreCache({ ...mangaCacheRef.current });
                return;
            }

            const updates: Record<string, string[]> = {};
            await Promise.all(
                unresolvedMangaIds.map(async (mangaId) => {
                    try {
                        const res = await mangaService.getMangaDetails(mangaId);
                        updates[mangaId] = normalizeGenres(res?.data?.genres || []);
                    } catch {
                        updates[mangaId] = [];
                    }
                })
            );

            if (!cancelled) {
                mangaCacheRef.current = { ...mangaCacheRef.current, ...updates };
                storage.setMangaGenreCache(mangaCacheRef.current);
                setMangaGenreCache({ ...mangaCacheRef.current });
            }
        };

        loadMissingMangaGenres();
        return () => { cancelled = true; };
    }, [readList, continueReadingList, favoriteManga]);

    const genreCounts: Record<string, number> = {};

    if (theme === 'anime' || theme === 'both') {
        // Deduplicate: collect all unique anime IDs from watchList + continueWatchingList + favorites
        const animeGenreMap = new Map<string, string[]>();
        watchList.forEach(item => {
            animeGenreMap.set(item.id, normalizeGenres(item.genres));
        });
        continueWatchingList.forEach(item => {
            const animeId = String(item.animeId);
            if (!animeGenreMap.has(animeId)) {
                // Not in watchList — use cache
                const genres = normalizeGenres(animeGenreCache[animeId] || []);
                animeGenreMap.set(animeId, genres);
            }
        });
        favoriteAnime.forEach(item => {
            const animeId = String(item.id);
            if (!animeGenreMap.has(animeId)) {
                const genres = normalizeGenres(animeGenreCache[animeId] || []);
                animeGenreMap.set(animeId, genres);
            }
        });
        animeGenreMap.forEach(genres => {
            genres.forEach(genreName => {
                genreCounts[genreName] = (genreCounts[genreName] || 0) + 1;
            });
        });
    }

    if (theme === 'manga' || theme === 'both') {
        // Deduplicate: collect all unique manga IDs from readList + continueReadingList + favorites
        const mangaGenreMap = new Map<string, string[]>();
        readList.forEach(item => {
            mangaGenreMap.set(item.id, normalizeGenres(item.genres));
        });
        continueReadingList.forEach(item => {
            const mangaId = String(item.mangaId);
            if (!mangaGenreMap.has(mangaId)) {
                // Not in readList — use cache
                const genres = normalizeGenres(mangaGenreCache[mangaId] || []);
                mangaGenreMap.set(mangaId, genres);
            }
        });
        favoriteManga.forEach(item => {
            const mangaId = String(item.id);
            if (!mangaGenreMap.has(mangaId)) {
                const genres = normalizeGenres(mangaGenreCache[mangaId] || []);
                mangaGenreMap.set(mangaId, genres);
            }
        });
        mangaGenreMap.forEach(genres => {
            genres.forEach(genreName => {
                genreCounts[genreName] = (genreCounts[genreName] || 0) + 1;
            });
        });
    }

    const sortedGenres = Object.entries(genreCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    const hasGenreHistory = sortedGenres.some((g) => g.count > 0);

    const displayGenres = sortedGenres.length > 0 ? sortedGenres : [
        { label: 'Romance', count: 0 },
        { label: 'Action', count: 0 },
        { label: 'Fantasy', count: 0 },
        { label: 'Drama', count: 0 }
    ];

    const top4 = displayGenres.slice(0, 4).map((g, index) => {
        const themeColors = hasGenreHistory
            ? (theme === 'manga'
                ? [
                    { bg: 'bg-[#ff579c]', text: 'text-[#ff579c]' },
                    { bg: 'bg-[#9f7aea]', text: 'text-[#9f7aea]' },
                    { bg: 'bg-[#61ffb8]', text: 'text-[#61ffb8]' },
                    { bg: 'bg-[#ffd768]', text: 'text-[#ffd768]' }
                ]
                : [
                    { bg: 'bg-[#ff579c]', text: 'text-[#ff579c]' },
                    { bg: 'bg-[#518feb]', text: 'text-[#518feb]' },
                    { bg: 'bg-[#61ffb8]', text: 'text-[#61ffb8]' },
                    { bg: 'bg-[#ffd768]', text: 'text-[#ffd768]' }
                ])
            : [
                { bg: 'bg-gray-600', text: 'text-gray-400' },
                { bg: 'bg-gray-600', text: 'text-gray-400' },
                { bg: 'bg-gray-600', text: 'text-gray-400' },
                { bg: 'bg-gray-600', text: 'text-gray-400' }
            ];
        return { ...g, ...themeColors[index % themeColors.length] };
    });

    const barGenres = hasGenreHistory ? sortedGenres : [{ label: 'No history yet', count: 1 }];
    const total = barGenres.reduce((acc, g) => acc + g.count, 0) || 1;
    const allBarColors = hasGenreHistory
        ? (theme === 'manga'
            ? ['bg-[#ff579c]', 'bg-[#9f7aea]', 'bg-[#61ffb8]', 'bg-[#ffd768]', 'bg-[#6d94b0]', 'bg-[#b06d6d]', 'bg-[#986db0]', 'bg-[#6db091]']
            : ['bg-[#ff579c]', 'bg-[#518feb]', 'bg-[#61ffb8]', 'bg-[#ffd768]', 'bg-[#6d94b0]', 'bg-[#b06d6d]', 'bg-[#986db0]', 'bg-[#6db091]'])
        : ['bg-gray-600'];

    return (
        <div>
            <h3 className="text-xs font-bold text-gray-500 mb-3 px-1">Genre Overview</h3>
            <div className="bg-[#1c1c1c] rounded-3xl overflow-visible">
                <div className="p-5 md:p-6 pb-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {top4.map(g => (
                            <div key={g.label} className="flex flex-col items-center">
                                <div className={`w-full py-2.5 ${g.bg} rounded-xl text-center font-bold text-[13px] text-white mb-2 shadow-lg truncate px-3`}>
                                    {g.label}
                                </div>
                                <div className="mt-1.5 -mb-1 translate-y-1 text-[12px] text-gray-500 flex items-center gap-1 font-bold leading-none">
                                    <span className={`font-black ${g.text} text-[14px]`}>{g.count}</span>
                                    <span className="text-gray-500">Entries</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="h-4 flex w-full bg-transparent overflow-visible">
                    {barGenres.map((g, i) => {
                        const tooltipPositionClass =
                            i === 0
                                ? 'left-0'
                                : i === barGenres.length - 1
                                    ? 'right-0'
                                    : 'left-1/2 -translate-x-1/2';
                        const tooltipArrowClass =
                            i === 0
                                ? 'left-4'
                                : i === barGenres.length - 1
                                    ? 'right-4'
                                    : 'left-1/2 -translate-x-1/2';

                        return (
                            <div
                                key={g.label}
                                className={`h-full ${allBarColors[i % allBarColors.length]} relative group/bar cursor-pointer transition-all duration-150 hover:brightness-110 ${i === 0 ? 'rounded-bl-3xl' : ''} ${i === barGenres.length - 1 ? 'rounded-br-3xl' : ''}`}
                                style={{ width: `${Math.max((g.count / total) * 100, 1)}%` }}
                            >
                                <div className={`absolute bottom-full ${tooltipPositionClass} mb-2 w-max px-3 py-1.5 bg-[#1a1c23] text-white text-[13px] font-medium rounded-md ${hasGenreHistory ? 'opacity-0 invisible group-hover/bar:opacity-100 group-hover/bar:visible' : 'opacity-0 invisible'} transition-all z-50 pointer-events-none shadow-xl border border-white/10 flex flex-col items-center`}>
                                    <span className="font-bold">{g.label}</span>
                                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-400">
                                        <span className="text-white font-bold">{g.count}</span> Entries
                                    </div>
                                    <div className={`absolute top-full ${tooltipArrowClass} border-4 border-transparent border-t-[#1a1c23]`}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const MangaContinueReadingHighlights = ({ showSeeAll = false }: { showSeeAll?: boolean }) => {
    const { continueReadingList: history } = useContinueReading();
    const navigate = useNavigate();
    // Deduplicate by title (keep first/most-recent occurrence per title)
    const seen = new Set<string>();
    const dedupedHistory = history.filter(item => {
        const key = (item.mangaTitle || item.mangaId).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const topThree = dedupedHistory.slice(0, 3);

    if (topThree.length === 0) {
        return (
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="text-xs font-bold text-gray-500">Continue Reading</h3>
                    {showSeeAll && (
                        <button onClick={() => navigate('/manga/continue-reading')} className="text-xs text-yorumi-manga hover:text-yorumi-manga/80 font-semibold">
                            View All
                        </button>
                    )}
                </div>
                <div className="bg-[#1c1c1c] rounded-2xl p-8 text-center">
                    <BookOpen className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No recent manga progress yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-xs font-bold text-gray-500">Continue Reading</h3>
                {showSeeAll && (
                    <button onClick={() => navigate('/manga/continue-reading')} className="text-xs text-yorumi-manga hover:text-yorumi-manga/80 font-semibold">
                        View All
                    </button>
                )}
            </div>
            <div className="space-y-3">
                {topThree.map((item) => (
                    <div
                        key={item.mangaId}
                        onClick={() => {
                            const title = slugify(item.mangaTitle || 'manga');
                            navigate(`/manga/read/${title}/${item.mangaId}/c${item.chapterNumber}`);
                        }}
                        className="relative flex rounded-xl overflow-hidden h-24 md:h-28 cursor-pointer"
                        style={{
                            backgroundImage: `linear-gradient(90deg, rgba(17,17,17,0.95) 0%, rgba(17,17,17,0.9) 45%, rgba(17,17,17,0.82) 100%), url(${item.mangaImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }}
                    >
                        <div className="h-full w-20 md:w-28 shrink-0">
                            <img src={item.mangaPoster || item.mangaImage} alt={item.mangaTitle} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center relative z-10 px-4 md:px-5 py-3 md:py-4">
                            <p className="text-[13px] md:text-[15px] font-bold text-gray-100 mb-0.5 truncate">Read Chapter {item.chapterNumber} of</p>
                            <p className="text-[13px] md:text-[15px] font-bold text-yorumi-manga truncate">{item.mangaTitle}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AnimeStatsOverview = () => {
    const { user } = useAuth();
    const { watchList } = useWatchList();
    const { continueWatchingList } = useContinueWatching();
    const { favorites } = useFavoriteAnime();
    const [statsTick, setStatsTick] = useState(0);

    useEffect(() => {
        const onStorageUpdated = () => setStatsTick((v) => v + 1);
        window.addEventListener('yorumi-storage-updated', onStorageUpdated as EventListener);
        return () => window.removeEventListener('yorumi-storage-updated', onStorageUpdated as EventListener);
    }, []);

    const episodeHistory = React.useMemo(() => {
        const merged: Record<string, unknown[]> = {};

        const mergeParsedHistory = (parsed: Record<string, unknown[]>) => {
            Object.entries(parsed || {}).forEach(([id, episodes]) => {
                if (!Array.isArray(episodes)) return;
                if (!merged[id]) merged[id] = [];
                merged[id].push(...episodes);
            });
        };

        const mergeHistoryFromStorage = (raw: string | null) => {
            if (!raw) return;
            try {
                mergeParsedHistory(JSON.parse(raw) as Record<string, unknown[]>);
            } catch {
                // Ignore malformed history payloads.
            }
        };

        // Current scoped getter
        mergeParsedHistory(storage.getEpisodeHistory() as unknown as Record<string, unknown[]>);
        // Explicit scoped and legacy unscoped keys for resilience during auth-race transitions.
        if (user?.uid) mergeHistoryFromStorage(localStorage.getItem(`yorumi_episode_history_${user.uid}`));
        mergeHistoryFromStorage(localStorage.getItem('yorumi_episode_history'));

        return merged;
    }, [user?.uid, statsTick]);
    const animeWatchTime = React.useMemo(() => {
        const merged: Record<string, number> = {};

        const mergeParsedWatchTime = (parsed: Record<string, unknown>) => {
            Object.entries(parsed || {}).forEach(([id, seconds]) => {
                const safeSeconds = Number(seconds) || 0;
                if (safeSeconds <= 0) return;
                merged[id] = Math.max(merged[id] || 0, safeSeconds);
            });
        };

        const mergeWatchTimeFromStorage = (raw: string | null) => {
            if (!raw) return;
            try {
                mergeParsedWatchTime(JSON.parse(raw) as Record<string, unknown>);
            } catch {
                // Ignore malformed watch-time payloads.
            }
        };

        // Current scoped getter
        mergeParsedWatchTime(storage.getAnimeWatchTime() as unknown as Record<string, unknown>);
        // Explicit scoped and legacy unscoped keys for resilience during auth-race transitions.
        if (user?.uid) mergeWatchTimeFromStorage(localStorage.getItem(`yorumi_anime_watch_time_${user.uid}`));
        mergeWatchTimeFromStorage(localStorage.getItem('yorumi_anime_watch_time'));

        return merged;
    }, [user?.uid, statsTick]);
    const animeCompletionCache = React.useMemo(() => storage.getAnimeCompletionCache(), [statsTick]);
    const parseEpisodeNumber = (value: unknown): number => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const raw = String(value ?? '').trim();
        const direct = Number(raw);
        if (Number.isFinite(direct)) return direct;
        const match = raw.match(/(\d+(?:\.\d+)?)/);
        return match ? Number(match[1]) : NaN;
    };
    const normalizeTitleKey = (title?: string) =>
        (title || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();

    const animeGroups = new Map<string, Set<string>>();
    const groupProgressEpisodes = new Map<string, Set<number>>();
    const animeCompletionMeta = new Map<string, CompletionMeta>();
    const ensureGroup = (groupKey: string) => {
        if (!animeGroups.has(groupKey)) animeGroups.set(groupKey, new Set<string>());
        return animeGroups.get(groupKey)!;
    };
    const ensureGroupProgress = (groupKey: string) => {
        if (!groupProgressEpisodes.has(groupKey)) groupProgressEpisodes.set(groupKey, new Set<number>());
        return groupProgressEpisodes.get(groupKey)!;
    };

    watchList.forEach((item) => {
        const key = normalizeTitleKey(item.title) || `id:${String(item.id)}`;
        ensureGroup(key).add(String(item.id));
        upsertCompletionMeta(animeCompletionMeta, key, item, isFinishedAnimeStatus);
    });

    continueWatchingList.forEach((item) => {
        const key = normalizeTitleKey(item.animeTitle) || `id:${String(item.animeId)}`;
        ensureGroup(key).add(String(item.animeId));
        upsertCompletionMeta(animeCompletionMeta, key, item, isFinishedAnimeStatus);
        const epNum = parseEpisodeNumber(item.episodeNumber);
        if (Number.isFinite(epNum) && epNum > 0) {
            ensureGroupProgress(key).add(epNum);
        }
    });

    favorites.forEach((item) => {
        const key = normalizeTitleKey(item.title) || `id:${String(item.id)}`;
        ensureGroup(key).add(String(item.id));
        upsertCompletionMeta(animeCompletionMeta, key, item, isFinishedAnimeStatus);
    });

    applyAnimeCompletionSnapshot(animeGroups, animeCompletionMeta, animeCompletionCache, normalizeTitleKey);

    // Ensure watched-history IDs are represented even if the anime isn't in watchlist/favorites/continue list.
    Object.keys(episodeHistory).forEach((historyId) => {
        const alreadyGrouped = Array.from(animeGroups.values()).some((ids) => ids.has(historyId));
        if (!alreadyGrouped) {
            ensureGroup(`history:${historyId}`).add(historyId);
        }
    });

    // Ensure watch-time-only IDs are also represented.
    Object.keys(animeWatchTime || {}).forEach((historyId) => {
        const alreadyGrouped = Array.from(animeGroups.values()).some((ids) => ids.has(historyId));
        if (!alreadyGrouped) {
            ensureGroup(`time:${historyId}`).add(historyId);
        }
    });

    const totalAnime = animeGroups.size;

    const totalEpisodesWatched = Array.from(animeGroups.entries()).reduce((sum, [groupKey, ids]) => {
        const uniqueEpisodes = new Set<number>();
        ids.forEach((id) => {
            (episodeHistory[id] || []).forEach((ep) => {
                const n = parseEpisodeNumber(ep);
                if (Number.isFinite(n) && n > 0) uniqueEpisodes.add(n);
            });
        });
        (groupProgressEpisodes.get(groupKey) || new Set<number>()).forEach((ep) => uniqueEpisodes.add(ep));
        return sum + uniqueEpisodes.size;
    }, 0);

    const hasAccountAnimeHistory =
        totalAnime > 0 ||
        totalEpisodesWatched > 0 ||
        Object.keys(animeWatchTime || {}).length > 0;
    const valueClassName = hasAccountAnimeHistory ? 'text-[#3cb6ff]' : 'text-gray-400';

    const completedAnime = countCompletedAnimeGroups(animeGroups, groupProgressEpisodes, episodeHistory as Record<string, number[]>, animeCompletionMeta);
    const fmt = new Intl.NumberFormat('en-US');

    return (
        <div>
            <h3 className="text-xs font-bold text-gray-500 mb-3 px-1">Anime Stats</h3>
            <div className="bg-[#1c1c1c] rounded-3xl p-5 md:p-6">
                <div className="grid grid-cols-3 gap-4 divide-x divide-white/20">
                    <StatItem value={fmt.format(totalAnime)} label="TOTAL ANIMES" valueClassName={valueClassName} />
                    <StatItem value={fmt.format(totalEpisodesWatched)} label="EPISODES WATCHED" valueClassName={valueClassName} />
                    <StatItem value={fmt.format(completedAnime)} label="COMPLETED ANIME" valueClassName={valueClassName} />
                </div>
            </div>
        </div>
    );
};

const AnimeGenreOverview = () => <OverallGenreOverview theme="anime" />;

const FavoriteAnimeBoard = () => {
    const { favorites } = useFavoriteAnime();
    const navigate = useNavigate();

    return (
        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-bold text-gray-500">Favorite Animes</h3>
                <button
                    onClick={() => navigate('/anime/favorites')}
                    className="text-xs text-yorumi-accent hover:text-yorumi-accent/80 font-semibold"
                >
                    See All
                </button>
            </div>
            <div className="bg-[#1c1c1c] rounded-3xl p-5 md:p-6">
                {favorites.length === 0 ? (
                    <div className="h-[160px] rounded-xl border border-dashed border-white/15 flex items-center justify-center text-sm text-gray-500">
                        Add favorites using the heart button in anime details.
                    </div>
                ) : (
                    <div className="grid grid-cols-6 gap-3">
                        {favorites.slice(0, 12).map((item) => (
                            <button
                                key={item.id}
                                onClick={() => navigate(`/anime/details/${item.id}`)}
                                className="aspect-[2/3] rounded-lg overflow-hidden border border-white/10 hover:border-yorumi-accent/70 transition-colors"
                            >
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const AnimeWatchListCarousel = () => {
    const { watchList, loading, removeFromWatchList } = useWatchList();
    const navigate = useNavigate();
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: 'start',
        containScroll: 'trimSnaps',
        dragFree: true
    });

    const previewList = watchList.slice(0, 10);

    const scrollByCards = (direction: 'left' | 'right') => {
        if (!emblaApi) return;
        if (direction === 'right') emblaApi.scrollNext();
        else emblaApi.scrollPrev();
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-bold text-gray-500">Watch List</h3>
                <div className="flex items-center gap-3">
                    {previewList.length > 3 && (
                        <div className="flex gap-1">
                            <button
                                onClick={() => scrollByCards('left')}
                                className="p-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                                aria-label="Scroll watch list left"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-gray-300" />
                            </button>
                            <button
                                onClick={() => scrollByCards('right')}
                                className="p-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                                aria-label="Scroll watch list right"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                            </button>
                        </div>
                    )}
                    <button onClick={() => navigate('/anime/watch-list')} className="text-xs text-yorumi-accent hover:text-yorumi-accent/80 font-semibold">
                        View All
                    </button>
                </div>
            </div>
            <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex gap-5">
                    {(loading ? [] : previewList).map((item) => {
                        const animeData: any = buildStoredAnimeState(item);
                        const routeId = getStoredAnimeRouteId(item);

                        return (
                            <div key={item.id} className="flex-[0_0_165px] min-w-0">
                                <AnimeCard
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
                            </div>
                        );
                    })}
                    {!loading && watchList.length === 0 && (
                        <div className="w-full bg-[#1c1c1c] rounded-xl p-6 text-center text-sm text-gray-500 border border-white/10">
                            Your watch list is empty.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AnimeContinueWatchingHighlights = ({ showSeeAll = false }: { showSeeAll?: boolean }) => {
    const { continueWatchingList: history } = useContinueWatching();
    const navigate = useNavigate();
    const formatClock = (seconds?: number) => {
        const safe = Math.max(0, Math.floor(seconds || 0));
        const h = Math.floor(safe / 3600);
        const m = Math.floor((safe % 3600) / 60);
        const s = safe % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    const getProgressPercent = (item: any) => {
        const duration = Number(item.durationSeconds || 0);
        const position = Number(item.positionSeconds || 0);
        if (!duration || duration <= 0) return 0;
        return Math.min(100, Math.max(0, (position / duration) * 100));
    };
    // Deduplicate by title (keep first/most-recent occurrence per title)
    const seen = new Set<string>();
    const dedupedHistory = history.filter(item => {
        const key = (item.animeTitle || item.animeId).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const topThree = dedupedHistory.slice(0, 3);

    if (topThree.length === 0) {
        return (
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="text-xs font-bold text-gray-500">Continue Watching</h3>
                    {showSeeAll && (
                        <button onClick={() => navigate('/anime/continue-watching')} className="text-xs text-yorumi-accent hover:text-yorumi-accent/80 font-semibold">
                            View All
                        </button>
                    )}
                </div>
                <div className="bg-[#1c1c1c] rounded-2xl p-8 text-center">
                    <History className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No recent anime progress yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-xs font-bold text-gray-500">Continue Watching</h3>
                {showSeeAll && (
                    <button onClick={() => navigate('/anime/continue-watching')} className="text-xs text-yorumi-accent hover:text-yorumi-accent/80 font-semibold">
                        View All
                    </button>
                )}
            </div>
            <div className="space-y-3">
                {topThree.map((item) => (
                    <div
                        key={item.animeId}
                        onClick={() => {
                            const title = slugify(item.animeTitle || 'anime');
                            const resume = Number.isFinite((item as any).positionSeconds)
                                ? Math.max(0, Math.floor((item as any).positionSeconds))
                                : 0;
                            navigate(`/anime/watch/${title}/${item.animeId}?ep=${item.episodeNumber}${resume > 0 ? `&t=${resume}` : ''}`);
                        }}
                        className="relative flex rounded-xl overflow-hidden h-24 md:h-28 cursor-pointer"
                        style={{
                            backgroundImage: `linear-gradient(90deg, rgba(17,17,17,0.95) 0%, rgba(17,17,17,0.9) 45%, rgba(17,17,17,0.82) 100%), url(${item.animeImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }}
                    >
                        <div className="h-full w-20 md:w-28 shrink-0">
                            <img src={item.animePoster || item.animeImage} alt={item.animeTitle} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center relative z-10 px-4 md:px-5 py-3 md:py-4">
                            <p className="text-[13px] md:text-[15px] font-bold text-[#518feb] truncate">{item.animeTitle}</p>
                            {(item.durationSeconds || item.positionSeconds) ? (
                                <div className="mt-1">
                                    <div className="flex items-center justify-between text-[12px] font-bold">
                                        <span className="text-gray-100">EP {item.episodeNumber}</span>
                                        <span className="text-yorumi-accent">
                                            {formatClock(item.positionSeconds)} / {formatClock(item.durationSeconds)}
                                        </span>
                                    </div>
                                    <div className="mt-1 h-1 bg-white/15 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-yorumi-accent"
                                            style={{ width: `${getProgressPercent(item)}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[13px] md:text-[15px] font-bold text-gray-100 mb-0.5 truncate">Watched Episode {item.episodeNumber}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const StatItem = ({ value, label, valueClassName = 'text-[#3cb6ff]' }: { value: string; label: string; valueClassName?: string }) => (
    <div className="text-center">
        <div className={`text-3xl md:text-4xl font-black leading-none mb-2 ${valueClassName}`}>{value}</div>
        <div className="text-[10px] md:text-[11px] font-bold text-gray-500 tracking-widest">{label}</div>
    </div>
);
