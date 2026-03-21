import { useNavigate } from 'react-router-dom';
import { useContinueReading } from '../hooks/useContinueReading';
import { slugify } from '../utils/slugify';
import MangaContinueReading from '../features/manga/components/MangaContinueReading';

export default function MangaContinueReadingPage() {
    const navigate = useNavigate();
    const { continueReadingList, removeFromHistory } = useContinueReading();

    const handleReadClick = (mangaId: string, mangaTitle: string, chapterNumber: string) => {
        const titleSlug = slugify(mangaTitle || 'manga');
        navigate(`/manga/read/${titleSlug}/${mangaId}/c${chapterNumber}`);
    };

    const handleRemove = (mangaId: string) => {
        removeFromHistory(mangaId);
    };

    const handleBack = () => {
        navigate('/manga');
    };

    return (
        <div className="min-h-screen bg-[#07090d] pt-24 pb-12">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
                <MangaContinueReading
                    items={continueReadingList}
                    variant="page"
                    onReadClick={handleReadClick}
                    onRemove={handleRemove}
                    onBack={handleBack}
                />
            </div>
        </div>
    );
}
