import { ArrowLeft, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MangaCard from '../features/manga/components/MangaCard';
import { useReadList } from '../hooks/useReadList';

export default function MangaReadListPage() {
    const navigate = useNavigate();
    const { readList, removeFromReadList, loading } = useReadList();

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
                    <h1 className="text-2xl font-black text-white tracking-wide uppercase">Read List</h1>
                </div>

                {loading ? (
                    <div className="text-gray-400">Loading read list...</div>
                ) : readList.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                        <BookOpen className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">Your read list is empty.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                        {readList.map((item) => {
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
                                <MangaCard
                                    key={item.id}
                                    manga={mangaData}
                                    onClick={() => navigate(`/manga/details/${item.id}`, { state: { manga: mangaData } })}
                                    onReadClick={() => navigate(`/manga/details/${item.id}`, { state: { manga: mangaData } })}
                                    inList={true}
                                    onToggleList={() => removeFromReadList(item.id)}
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
