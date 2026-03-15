import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useManga } from '../hooks/useManga';
import { slugify } from '../utils/slugify';
import MangaReaderModal from '../features/manga/components/MangaReaderModal';

const MangaReaderSkeleton = () => {
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 backdrop-blur-md pt-[60px]">
            <div className="w-full h-full flex flex-col bg-[#0a0a0a] relative">
                <header className="h-14 shrink-0 flex items-center px-6 border-b border-white/10 bg-black/40 backdrop-blur-md">
                    <div className="h-6 w-24 bg-white/10 rounded animate-pulse" />
                    <div className="ml-4 h-5 w-56 bg-white/10 rounded animate-pulse" />
                    <div className="ml-auto flex items-center gap-2">
                        <div className="h-8 w-20 bg-white/10 rounded-full animate-pulse" />
                        <div className="h-8 w-20 bg-white/10 rounded-full animate-pulse" />
                        <div className="h-8 w-10 bg-white/10 rounded-full animate-pulse" />
                    </div>
                </header>

                <div className="flex-1 flex min-h-0 relative overflow-hidden">
                    <aside className="w-full md:w-[350px] shrink-0 flex flex-col border-r border-white/10 bg-black/20">
                        <div className="p-4 border-b border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <div className="h-4 w-28 bg-white/10 rounded animate-pulse" />
                                <div className="h-8 w-16 bg-white/10 rounded-lg animate-pulse" />
                            </div>
                            <div className="h-9 w-full bg-white/10 rounded-lg animate-pulse" />
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            <div className="grid grid-cols-5 gap-2">
                                {Array.from({ length: 20 }).map((_, idx) => (
                                    <div key={`chapter-skeleton-${idx}`} className="aspect-square rounded bg-white/10 animate-pulse" />
                                ))}
                            </div>
                        </div>
                    </aside>

                    <div className="flex-1 min-w-0 bg-[#050505] relative flex items-center justify-center">
                        <div className="w-[70%] h-[70%] bg-white/10 rounded-xl animate-pulse" />
                    </div>

                    <aside className="hidden lg:flex w-[280px] shrink-0 border-l border-white/10 bg-black/20 p-4">
                        <div className="w-full space-y-4">
                            <div className="w-full aspect-[2/3] bg-white/10 rounded-xl animate-pulse" />
                            <div className="h-4 w-3/4 bg-white/10 rounded animate-pulse" />
                            <div className="h-3 w-1/2 bg-white/10 rounded animate-pulse" />
                            <div className="space-y-2">
                                <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
                                <div className="h-3 w-5/6 bg-white/10 rounded animate-pulse" />
                                <div className="h-3 w-4/6 bg-white/10 rounded animate-pulse" />
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default function MangaReaderPage() {
    const { id, chapter } = useParams<{ title: string; id: string; chapter: string }>();
    const navigate = useNavigate();

    const {
        selectedManga,
        mangaChapters,
        currentMangaChapter,
        chapterPages,
        mangaChaptersLoading,
        mangaPagesLoading,
        chapterSearchQuery,
        zoomLevel,
        mangaLoading,
        setChapterSearchQuery,
        fetchMangaDetails,
        loadMangaChapter,
        prefetchChapter,
        zoomIn,
        zoomOut,
        readChapters
    } = useManga();

    // Fetch manga details on mount
    useEffect(() => {
        if (id) {
            fetchMangaDetails(id);
        }
    }, [id, fetchMangaDetails]);

    // Auto-load chapter when chapters are available
    useEffect(() => {
        if (mangaChapters.length > 0 && chapter && !currentMangaChapter) {
            // Find chapter by number (chapter param is like "c4" from URL, strip the 'c' prefix)
            const chapterNumStr = chapter.startsWith('c') ? chapter.slice(1) : chapter;
            const chapterNum = parseInt(chapterNumStr);
            const targetChapter = mangaChapters.find(ch => {
                const match = ch.title.match(/Chapter\s+(\d+)/i);
                return match && parseInt(match[1]) === chapterNum;
            });

            if (targetChapter) {
                loadMangaChapter(targetChapter);
            } else if (mangaChapters.length > 0) {
                // Fallback: load first chapter if target not found
                console.warn(`Chapter ${chapter} not found, loading first available`);
                loadMangaChapter(mangaChapters[mangaChapters.length - 1]);
            }
        }
    }, [mangaChapters, chapter, currentMangaChapter, loadMangaChapter]);

    // Handle chapter navigation - update URL
    const handleLoadChapter = (ch: any) => {
        if (selectedManga) {
            const title = slugify(selectedManga.title || 'manga');
            const chapterMatch = ch.title.match(/Chapter\s+(\d+)/i);
            const chapterNum = chapterMatch ? chapterMatch[1] : '1';
            navigate(`/manga/read/${title}/${id}/c${chapterNum}`, { replace: true });
        }
        loadMangaChapter(ch);
    };

    // Handle close - go back to details
    // Don't call closeMangaReader() as it uses history.back() which conflicts with navigate()
    const handleClose = () => {
        if (id) {
            navigate(`/manga/details/${id}`);
        } else {
            navigate('/manga');
        }
    };

    // Show loading while manga or chapters are loading
    if (mangaLoading || mangaChaptersLoading || !selectedManga) {
        return <MangaReaderSkeleton />;
    }

    // Show loading while waiting for chapter to load
    if (!currentMangaChapter && mangaChapters.length > 0) {
        return <MangaReaderSkeleton />;
    }

    // Handle case where no chapters exist
    if (mangaChapters.length === 0) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white gap-4">
                <div className="text-6xl font-black text-white/10">!</div>
                <h1 className="text-2xl font-bold">No Chapters Available</h1>
                <p className="text-gray-400">This manga doesn't have any chapters on MangaKatana.</p>
                <button
                    onClick={() => navigate(`/manga/details/${id}`)}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-colors mt-4"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <MangaReaderModal
            isOpen={true}
            onClose={handleClose}
            manga={selectedManga}
            chapters={mangaChapters}
            currentChapter={currentMangaChapter}
            pages={chapterPages}
            chapterSearchQuery={chapterSearchQuery}
            chaptersLoading={mangaChaptersLoading}
            pagesLoading={mangaPagesLoading}
            zoomLevel={zoomLevel}
            onChapterSearchChange={setChapterSearchQuery}
            onLoadChapter={handleLoadChapter}
            onPrefetchChapter={prefetchChapter}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            readChapters={readChapters}
        />
    );
}
