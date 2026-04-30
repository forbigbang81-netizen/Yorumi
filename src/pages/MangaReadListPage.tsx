import { ArrowLeft, BookOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MangaCard from '../features/manga/components/MangaCard';
import { useReadList } from '../hooks/useReadList';
import type { ReadListItem } from '../utils/storage';

type MangaClassification = 'all' | ReadListItem['status'];

const MANGA_CLASSIFICATIONS: Array<{
    key: MangaClassification;
    label: string;
    color: string;
}> = [
        { key: 'all', label: 'All', color: 'bg-gray-400' },
        { key: 'reading', label: 'Reading', color: 'bg-yorumi-manga' },
        { key: 'completed', label: 'Completed', color: 'bg-[#46c72f]' },
        { key: 'plan_to_read', label: 'Planning', color: 'bg-[#ffbd4a]' },
        { key: 'dropped', label: 'Dropped', color: 'bg-[#dc38d2]' }
    ];

const normalizeReadStatus = (status?: string): ReadListItem['status'] => {
    if (status === 'completed' || status === 'plan_to_read' || status === 'dropped') return status;
    return 'reading';
};

const buildStoredMangaState = (item: ReadListItem) => ({
    mal_id: parseInt(item.id),
    title: item.title,
    images: { jpg: { large_image_url: item.image, image_url: item.image } },
    score: item.score || 0,
    type: item.type || 'Manga',
    status: item.mediaStatus || 'UNKNOWN',
    chapters: item.totalCount || null,
    volumes: null,
    genres: item.genres?.map((g: string) => ({ mal_id: 0, name: g })) || [],
    synopsis: item.synopsis || ''
});

const MangaReadListSection = ({
    label,
    color,
    items,
    onOpen,
    onRemove
}: {
    label: string;
    color: string;
    items: ReadListItem[];
    onOpen: (item: ReadListItem, mangaData: ReturnType<typeof buildStoredMangaState>) => void;
    onRemove: (id: string) => void;
}) => {
    if (items.length === 0) return null;

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 rounded-full ${color}`} />
                <h2 className="text-xl font-black uppercase tracking-wide text-gray-300">{label}</h2>
                <span className="text-sm font-bold text-gray-600">{items.length}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                {items.map((item) => {
                    const mangaData = buildStoredMangaState(item);

                    return (
                        <MangaCard
                            key={item.id}
                            manga={mangaData}
                            onClick={() => onOpen(item, mangaData)}
                            onReadClick={() => onOpen(item, mangaData)}
                            inList={true}
                            onToggleList={() => onRemove(item.id)}
                            disableTilt
                        />
                    );
                })}
            </div>
        </section>
    );
};

export default function MangaReadListPage() {
    const navigate = useNavigate();
    const { readList, removeFromReadList, loading } = useReadList();
    const [activeClassification, setActiveClassification] = useState<MangaClassification>('all');
    const groupedReadList = useMemo(() => {
        return readList.reduce<Record<ReadListItem['status'], ReadListItem[]>>((groups, item) => {
            groups[normalizeReadStatus(item.status)].push(item);
            return groups;
        }, {
            reading: [],
            completed: [],
            plan_to_read: [],
            dropped: []
        });
    }, [readList]);

    const counts = {
        all: readList.length,
        reading: groupedReadList.reading.length,
        completed: groupedReadList.completed.length,
        plan_to_read: groupedReadList.plan_to_read.length,
        dropped: groupedReadList.dropped.length
    };
    const visibleClassifications = MANGA_CLASSIFICATIONS.filter((classification) => classification.key !== 'all');
    const openManga = (item: ReadListItem, mangaData: ReturnType<typeof buildStoredMangaState>) => {
        navigate(`/manga/details/${item.id}`, { state: { manga: mangaData } });
    };

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

                {!loading && readList.length > 0 && (
                    <div className="mb-8 flex flex-wrap gap-3">
                        {MANGA_CLASSIFICATIONS.map((classification) => (
                            <button
                                key={classification.key}
                                onClick={() => setActiveClassification(classification.key)}
                                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition-colors ${activeClassification === classification.key
                                    ? 'bg-[#261d34] text-white'
                                    : 'bg-[#111923] text-gray-400 hover:bg-[#21182e] hover:text-white'
                                    }`}
                            >
                                <span className={`h-3.5 w-3.5 rounded-full ${classification.color}`} />
                                {classification.label}
                                <span className="text-xs text-gray-500">{counts[classification.key]}</span>
                            </button>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div className="text-gray-400">Loading read list...</div>
                ) : readList.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                        <BookOpen className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">Your read list is empty.</p>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {(activeClassification === 'all'
                            ? visibleClassifications
                            : visibleClassifications.filter((classification) => classification.key === activeClassification)
                        ).map((classification) => (
                            <MangaReadListSection
                                key={classification.key}
                                label={classification.label}
                                color={classification.color}
                                items={groupedReadList[classification.key as ReadListItem['status']]}
                                onOpen={openManga}
                                onRemove={removeFromReadList}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
