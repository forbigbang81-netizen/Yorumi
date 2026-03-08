import { ArrowLeft, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useContinueReading } from '../hooks/useContinueReading';
import { slugify } from '../utils/slugify';

export default function MangaContinueReadingPage() {
    const navigate = useNavigate();
    const { continueReadingList } = useContinueReading();

    const seen = new Set<string>();
    const dedupedHistory = continueReadingList.filter((item) => {
        const key = (item.mangaTitle || item.mangaId).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return (
        <div className="min-h-screen bg-[#07090d] pt-24 pb-12">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/profile?tab=manga-overview')}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <h1 className="text-2xl font-black text-white tracking-wide uppercase">Continue Reading</h1>
                </div>

                {dedupedHistory.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                        <BookOpen className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">No continue reading items yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        {dedupedHistory.map((item) => (
                            <button
                                key={item.mangaId}
                                onClick={() => {
                                    const title = slugify(item.mangaTitle || 'manga');
                                    navigate(`/manga/read/${title}/${item.mangaId}/c${item.chapterNumber}`);
                                }}
                                className="relative h-52 rounded-2xl overflow-hidden text-left group border border-white/10"
                                style={{
                                    backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.85) 100%), url(${item.mangaImage})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center'
                                }}
                            >
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                                <div className="absolute bottom-0 left-0 right-0 p-5">
                                    <h3 className="text-2xl font-black text-white/90 mb-1 leading-none line-clamp-2">{item.mangaTitle}</h3>
                                    <p className="text-yorumi-manga font-semibold text-lg">Chapter {item.chapterNumber}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

