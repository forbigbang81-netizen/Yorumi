import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Plus, Heart } from 'lucide-react';
import { useManga } from '../hooks/useManga';
import { useReadList } from '../hooks/useReadList';
import { useFavoriteManga } from '../hooks/useFavoriteManga';
import { slugify } from '../utils/slugify';
import MangaCard from '../features/manga/components/MangaCard';
import type { Manga, MangaChapter } from '../types/manga';
import DetailsCharacters from '../features/anime/components/details/DetailsCharacters';
import { useTitleLanguage } from '../context/TitleLanguageContext';
import { getDisplayTitle } from '../utils/titleLanguage';

const normalizeMangaRouteId = (value: unknown) =>
    String(value || '')
        .trim()
        .replace(/^mk:/i, '');

// Chapter Grid for Details Page
const ChapterList = ({
    chapters,
    readChapters,
    onChapterClick
}: {
    chapters: MangaChapter[],
    readChapters: Set<string>,
    onChapterClick: (ch: MangaChapter) => void
}) => {
    // Determine reasonable pagination
    const ITEMS_PER_PAGE = 30;
    const [page, setPage] = useState(1);

    // Sort ascending (Chapter 1 -> Latest) by reversing the array
    const sortedChapters = [...chapters].reverse();

    const totalPages = Math.ceil(sortedChapters.length / ITEMS_PER_PAGE);
    const currentChapters = sortedChapters.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
        <div className="mt-6">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {currentChapters.map((ch, index) => {
                    // Extract just the number or short identifier
                    const match = ch.title.match(/Chapter\s+(\d+[\.]?\d*)/i);
                    const displayNum = match ? match[1] : ch.title.replace('Chapter', '').trim();

                    const isRead = readChapters.has(ch.id);
                    return (
                        <button
                            key={`chapter-${ch.id}-${index}`}
                            onClick={() => onChapterClick(ch)}
                            className={`aspect-square flex items-center justify-center rounded transition-all duration-200 relative group 
                                ${isRead ? 'bg-white/5 text-gray-600 opacity-50' : 'bg-white/10 text-gray-300 hover:bg-yorumi-manga hover:text-white'}
                                hover:scale-105 hover:shadow-lg hover:shadow-yorumi-manga/20 cursor-pointer border border-white/5 hover:border-yorumi-manga overflow-hidden`}
                            title={ch.title}
                        >
                            <span className="text-xs text-center font-bold line-clamp-4 px-1 break-words leading-tight">{displayNum}</span>
                        </button>
                    );
                })}
            </div>

            {totalPages > 1 && (
                <div className="flex flex-col items-center gap-4 mt-8">
                    <div className="flex flex-wrap justify-center gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                            <button
                                key={p}
                                onClick={() => setPage(p)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors flex-shrink-0
                                    ${page === p ? 'bg-yorumi-manga text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                    <span className="text-xs text-gray-500">
                        Showing {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedChapters.length)} of {sortedChapters.length} chapters
                    </span>
                </div>
            )}
        </div>
    );
};

export default function MangaDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const routeManga = (location.state as { manga?: Manga } | null)?.manga ?? null;

    // Use the useManga hook logic locally for this page
    const {
        selectedManga,
        mangaChapters,
        mangaChaptersLoading,
        fetchMangaDetails,
        loadMangaChapter,
        readChapters
    } = useManga();

    const { isInReadList, addToReadList, removeFromReadList } = useReadList();
    const { isFavorite, addFavorite, removeFavorite } = useFavoriteManga();
    const { language } = useTitleLanguage();

    const [activeTab, setActiveTab] = useState<'summary' | 'relations'>('summary');



    // Fetch details on mount or ID change
    // Scroll to top on mount
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [id]);

    // Auto-open reader if navigated from "Continue Reading"
    useEffect(() => {
        if (mangaChapters.length > 0) {
            if (location.state?.chapterId) {
                const targetChapter = mangaChapters.find(c => c.id === location.state.chapterId);
                if (targetChapter) {
                    setTimeout(() => {
                        loadMangaChapter(targetChapter);
                    }, 100);
                }
            } else if (location.state?.autoRead) {
                // Auto-read: Start from the first chapter (oldest)
                const firstChapter = mangaChapters[mangaChapters.length - 1];
                if (firstChapter) {
                    setTimeout(() => {
                        // We use handleChapterClick to ensure URL update + load
                        handleChapterClick(firstChapter);
                    }, 100);
                }
            }
        }
    }, [location.state, mangaChapters, loadMangaChapter]);

    // Fetch details on ID change
    useEffect(() => {
        if (id) {
            console.log(`[MangaDetailsPage] Fetching details for ID: ${id}`);
            fetchMangaDetails(id, routeManga);
        }
    }, [id, routeManga, fetchMangaDetails]);

    console.log('[MangaDetailsPage] Rendered with ID:', id);

    const handleBack = () => {
        if (location.state?.from) {
            navigate(-1);
        } else {
            navigate('/manga');
        }
    };

    const currentRouteId = normalizeMangaRouteId(id);
    const selectedMatchesCurrentRoute = Boolean(selectedManga) && [
        selectedManga?.scraper_id,
        selectedManga?.id,
        selectedManga?.mal_id
    ].some((candidate) => normalizeMangaRouteId(candidate) === currentRouteId);
    const routeMatchesCurrentRoute = Boolean(routeManga) && [
        routeManga?.scraper_id,
        routeManga?.id,
        routeManga?.mal_id
    ].some((candidate) => normalizeMangaRouteId(candidate) === currentRouteId);

    const displayManga = selectedMatchesCurrentRoute
        ? selectedManga
        : routeMatchesCurrentRoute
            ? routeManga
            : selectedManga || routeManga;

    if (!displayManga) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] pb-20 animate-pulse">
                <div className="relative h-[40vh] md:h-[50vh] w-full overflow-hidden bg-white/10" />
                <div className="container mx-auto px-4 md:px-6 -mt-24 md:-mt-32 relative z-10">
                    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                        <div className="flex-shrink-0 mx-auto md:mx-0 w-48 sm:w-64 md:w-72">
                            <div className="rounded-xl aspect-[2/3] bg-white/10" />
                        </div>
                        <div className="flex-1 pt-4 md:pt-8 space-y-4">
                            <div className="h-10 w-3/4 rounded bg-white/10" />
                            <div className="h-6 w-1/2 rounded bg-white/10" />
                            <div className="h-12 w-56 rounded-full bg-white/10" />
                            <div className="h-6 w-40 rounded bg-white/10 mt-8" />
                            <div className="space-y-2">
                                <div className="h-4 w-full rounded bg-white/10" />
                                <div className="h-4 w-5/6 rounded bg-white/10" />
                                <div className="h-4 w-4/6 rounded bg-white/10" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Navigate to reader page with path-based URL
    const handleChapterClick = (chapter: MangaChapter) => {
        const title = slugify(displayManga.title || 'manga');
        const chapterMatch = chapter.title.match(/Chapter\s+(\d+)/i);
        const chapterNum = chapterMatch ? chapterMatch[1] : '1';
        navigate(`/manga/read/${title}/${id}/c${chapterNum}`);
    };

    // Determine banner
    // If we have no banner, use the large cover logic or a blur
    const bannerImage = displayManga.images.jpg.large_image_url;
    const displayTitle = getDisplayTitle(displayManga as unknown as Record<string, unknown>, language);
    const hasReadableChapters = mangaChapters.length > 0;
    const metadataChapterCount = Number(displayManga.chapters || 0);
    const hasResolvedChapterSource = Boolean(String(displayManga.scraper_id || '').trim()) || hasReadableChapters;

    const mangaId = displayManga.mal_id.toString();
    const inFavorites = isFavorite(mangaId);

    return (
        <div className="min-h-screen bg-[#0a0a0a] pb-20 fade-in animate-in duration-300">
            {/* 1. Header Hero */}
            <div className="relative h-[40vh] md:h-[50vh] w-full overflow-hidden">
                {/* Background Image with Blur */}
                <div className="absolute inset-0">
                    <img
                        src={bannerImage}
                        alt={displayTitle}
                        className="w-full h-full object-cover blur-xl opacity-40 scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                </div>

                <button
                    onClick={handleBack}
                    className="absolute top-20 md:top-24 left-4 md:left-6 z-50 p-3 bg-black/50 hover:bg-white/20 rounded-full backdrop-blur-sm transition-colors text-white"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
            </div>

            {/* 2. Content */}
            <div className="container mx-auto px-4 md:px-6 -mt-24 md:-mt-32 relative z-10">
                <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                    {/* Poster */}
                    <div className="flex-shrink-0 mx-auto md:mx-0 w-48 sm:w-64 md:w-72 group">
                        <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/50 aspect-[2/3]">
                            <img
                                src={displayManga.images.jpg.large_image_url}
                                alt={displayTitle}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        </div>
                    </div>

                    {/* Meta Data */}
                    <div className="flex-1 pt-4 md:pt-8 text-center md:text-left space-y-4">
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight">
                            {displayTitle}
                        </h1>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm">
                            <span className="bg-[#facc15] text-black px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                                {displayManga.score}
                            </span>

                            {/* Origin / Type Badge */}
                            <span className={`px-2.5 py-1 rounded text-xs font-bold ${displayManga.countryOfOrigin === 'KR' ? 'bg-blue-500 text-white' :
                                displayManga.countryOfOrigin === 'CN' ? 'bg-red-500 text-white' :
                                    'bg-white/10 text-gray-300'
                                }`}>
                                {displayManga.countryOfOrigin === 'KR' ? 'Manhwa' :
                                    displayManga.countryOfOrigin === 'CN' ? 'Manhua' :
                                        'Manga'}
                            </span>

                            {/* Status */}
                            <span className="px-2.5 py-1 bg-white/10 rounded text-gray-300 text-xs">
                                {displayManga.status}
                            </span>

                            {/* Chapter Count */}
                            {(hasReadableChapters || metadataChapterCount > 0) && (
                                <span className="bg-[#22c55e] text-white px-2.5 py-1 rounded text-xs font-bold">
                                    {hasReadableChapters
                                        ? `${mangaChapters.length} Chapters`
                                        : `${metadataChapterCount} Total`}
                                </span>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-row items-center justify-center md:justify-start gap-4 py-2">
                            <button
                                onClick={() => {
                                    // Start reading first chapter (last in array since MK returns newest-first)
                                    if (mangaChapters.length > 0) {
                                        const firstChapter = mangaChapters[mangaChapters.length - 1];
                                        handleChapterClick(firstChapter);
                                    }
                                }}
                                disabled={mangaChaptersLoading}
                                className="h-12 px-8 bg-yorumi-manga hover:bg-yorumi-manga/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold rounded-full transition-transform active:scale-95 flex items-center gap-3 shadow-lg shadow-yorumi-manga/20"
                            >
                                {mangaChaptersLoading ? 'Loading Chapters...' : 'Read Now'}
                            </button>
                            <button
                                onClick={() => {
                                    if (!displayManga) return;
                                    if (isInReadList(mangaId)) {
                                        removeFromReadList(mangaId);
                                    } else {
                                        addToReadList({
                                            id: mangaId,
                                            title: displayManga.title,
                                            image: displayManga.images.jpg.large_image_url,
                                            score: displayManga.score,
                                            type: displayManga.type,
                                            totalCount: displayManga.chapters || mangaChapters.length,
                                            genres: displayManga.genres?.map((g: any) => g.name),
                                            mediaStatus: displayManga.status,
                                            synopsis: displayManga.synopsis,
                                            status: 'reading' // Default status
                                        });
                                    }
                                }}
                                className={`h-12 px-8 text-lg font-bold rounded-full transition-colors border flex items-center gap-2 ${isInReadList(mangaId)
                                    ? 'bg-yorumi-manga text-white border-yorumi-manga'
                                    : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                    }`}
                            >
                                {isInReadList(mangaId) ? (
                                    <>
                                        <Check className="w-5 h-5" />
                                        In List
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        Add to List
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    if (inFavorites) {
                                        removeFavorite(mangaId);
                                    } else {
                                        addFavorite({
                                            id: mangaId,
                                            title: displayManga.title,
                                            image: displayManga.images.jpg.large_image_url
                                        });
                                    }
                                }}
                                className={`h-12 w-12 rounded-full transition-all border flex items-center justify-center ${inFavorites
                                    ? 'bg-red-500/20 text-red-400 border-red-400/40'
                                    : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                    }`}
                                title={inFavorites ? 'Remove Favorite' : 'Add Favorite'}
                            >
                                <Heart className={`w-5 h-5 ${inFavorites ? 'fill-current' : ''}`} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex items-center gap-8 border-b border-white/10 mb-6">
                            <button
                                onClick={() => setActiveTab('summary')}
                                className={`pb-3 text-lg font-bold transition-colors relative ${activeTab === 'summary' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                Summary
                                {activeTab === 'summary' && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-yorumi-manga" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('relations')}
                                className={`pb-3 text-lg font-bold transition-colors relative ${activeTab === 'relations' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                Relations
                                {activeTab === 'relations' && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-yorumi-manga" />}
                            </button>
                        </div>

                        {activeTab === 'summary' && (
                            <>
                                <p className="text-gray-300 text-base leading-relaxed max-w-3xl">
                                    {displayManga.synopsis || 'No synopsis available.'}
                                </p>

                                {/* Synonyms Section - English only */}
                                {(() => {
                                    // Only pure English: Latin chars without accents
                                    const isEnglishOnly = (s: string) => /^[a-zA-Z0-9\s\-':!?.,"()]+$/.test(s);
                                    const englishSynonyms = (displayManga.synonyms || []).filter(isEnglishOnly);
                                    return englishSynonyms.length > 0 ? (
                                        <div className="py-4 mt-4">
                                            <h4 className="text-sm font-bold text-gray-400 mb-2">Also Known As</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {englishSynonyms.map((syn, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-2 py-1 bg-white/5 rounded text-gray-400 text-xs hover:bg-white/10 transition-colors"
                                                    >
                                                        {syn}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null;
                                })()}

                                {/* Chapters Section */}
                                <div id="chapters-section" className="py-6 border-t border-white/10 mt-6">
                                    <h3 className="text-xl font-bold text-white mb-4">Chapters</h3>
                                    {mangaChaptersLoading ? (
                                        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 mt-6 animate-pulse">
                                            {Array.from({ length: 30 }).map((_, idx) => (
                                                <div key={idx} className="aspect-square rounded bg-white/10" />
                                            ))}
                                        </div>
                                    ) : mangaChapters.length > 0 ? (
                                        <ChapterList
                                            chapters={mangaChapters}
                                            readChapters={readChapters}
                                            onChapterClick={handleChapterClick}
                                        />
                                    ) : (
                                        <div className="text-gray-500 text-center py-4 space-y-2">
                                            <div>
                                                {hasResolvedChapterSource
                                                    ? 'No readable chapters were returned from MangaKatana.'
                                                    : 'Chapter source for this title was not resolved yet.'}
                                            </div>
                                            {!hasResolvedChapterSource && metadataChapterCount > 0 && (
                                                <div className="text-xs text-gray-600">
                                                    AniList has metadata for {metadataChapterCount} total chapters, but the readable chapter source still needs a match.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Characters Section (if available) */}
                                {/* Characters Section */}
                                {displayManga.characters && (
                                    <DetailsCharacters
                                        characters={displayManga.characters as any}
                                        title="Characters"
                                    />
                                )}
                            </>
                        )}

                        {activeTab === 'relations' && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {/* Use `relations` from enriched data */}
                                {(displayManga as any).relations?.edges?.map((edge: any) => (
                                    <MangaCard
                                        key={edge.node.id}
                                        manga={{
                                            mal_id: edge.node.id,
                                            title: edge.node.title.romaji,
                                            images: { jpg: { large_image_url: edge.node.coverImage.large, image_url: edge.node.coverImage.large } },
                                            type: edge.node.format,
                                            status: 'Unknown',
                                            chapters: 0,
                                            volumes: 0,
                                            score: 0
                                        }}
                                        onClick={() => navigate(`/manga/details/${edge.node.id}`, { state: { manga: {
                                            mal_id: edge.node.id,
                                            title: edge.node.title.romaji,
                                            title_english: edge.node.title.english,
                                            title_native: edge.node.title.native,
                                            images: { jpg: { large_image_url: edge.node.coverImage.large, image_url: edge.node.coverImage.large } },
                                            type: edge.node.format,
                                            status: 'Unknown',
                                            chapters: 0,
                                            volumes: 0,
                                            score: 0
                                        } } })}
                                    />
                                )) || <div className="text-gray-500">No relations found.</div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
