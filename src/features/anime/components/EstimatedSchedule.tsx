import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { animeService } from '../../../services/animeService';

interface ScheduleItem {
    id: number;
    airingAt: number;
    episode: number;
    media: {
        id: number;
        idMal: number;
        title: { romaji: string; english: string | null };
        coverImage: { large: string };
        format: string;
    };
}

interface EstimatedScheduleProps {
    onAnimeClick?: (animeId: number) => void;
}

const SCHEDULE_CACHE_PREFIX = 'yorumi_schedule_cache_v1';
const SCHEDULE_CACHE_TTL_MS = 10 * 60 * 1000;

const getDayRange = (offset: number) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + offset);

    const startTime = Math.floor(start.getTime() / 1000);
    const endTime = startTime + 86400;
    const dayKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    return { startTime, endTime, dayKey };
};

const readScheduleCache = (dayKey: string): ScheduleItem[] | null => {
    try {
        const raw = localStorage.getItem(`${SCHEDULE_CACHE_PREFIX}:${dayKey}`);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as { timestamp: number; data: ScheduleItem[] };
        if (!parsed || typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.data)) {
            return null;
        }

        if (Date.now() - parsed.timestamp > SCHEDULE_CACHE_TTL_MS) {
            return null;
        }

        return parsed.data;
    } catch {
        return null;
    }
};

const writeScheduleCache = (dayKey: string, data: ScheduleItem[]) => {
    try {
        localStorage.setItem(
            `${SCHEDULE_CACHE_PREFIX}:${dayKey}`,
            JSON.stringify({ timestamp: Date.now(), data })
        );
    } catch {
        // Ignore storage quota issues.
    }
};

export default function EstimatedSchedule({ onAnimeClick }: EstimatedScheduleProps) {
    const [selectedDayOffset, setSelectedDayOffset] = useState(0);
    const [schedule, setSchedule] = useState<ScheduleItem[]>(() => {
        const { dayKey } = getDayRange(0);
        return readScheduleCache(dayKey) ?? [];
    });
    const [loading, setLoading] = useState(() => {
        const { dayKey } = getDayRange(0);
        return !readScheduleCache(dayKey);
    });
    const [showAll, setShowAll] = useState(false);

    // Get days of the week starting from today
    const getDays = () => {
        const days = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            days.push({
                name: dayNames[date.getDay()],
                date: `${monthNames[date.getMonth()]} ${date.getDate()}`,
                offset: i
            });
        }
        return days;
    };

    const days = getDays();

    useEffect(() => {
        const fetchSchedule = async () => {
            const { startTime, endTime, dayKey } = getDayRange(selectedDayOffset);
            const cachedSchedule = readScheduleCache(dayKey);

            if (cachedSchedule) {
                setSchedule(cachedSchedule);
                setLoading(false);
            } else {
                setLoading(true);
                setSchedule([]);
            }

            try {
                const waitForSkeleton = cachedSchedule
                    ? Promise.resolve()
                    : new Promise(resolve => setTimeout(resolve, 300));
                const [data] = await Promise.all([
                    animeService.getAiringSchedule(startTime, endTime),
                    waitForSkeleton
                ]);

                setSchedule(data);
                writeScheduleCache(dayKey, data);
            } catch (error) {
                console.error('Failed to fetch schedule:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [selectedDayOffset]);

    useEffect(() => {
        setShowAll(false);
    }, [selectedDayOffset]);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const displayedSchedule = showAll ? schedule : schedule.slice(0, 7);
    const currentTime = new Date().toLocaleString('en-US', {
        timeZoneName: 'short',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    return (
        <div className="bg-[#1a1a2e] rounded-xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-yorumi-accent">Estimated Schedule</h2>
                <span className="text-xs text-gray-400 bg-[#0a0a0a] px-3 py-1.5 rounded-lg">
                    {currentTime}
                </span>
            </div>

            {/* Day Tabs */}
            <div className="flex items-center gap-2 mb-6">
                <button
                    onClick={() => setSelectedDayOffset(Math.max(0, selectedDayOffset - 1))}
                    className="p-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white transition-colors"
                    disabled={selectedDayOffset === 0}
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex gap-1 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                    {days.map((day) => (
                        <button
                            key={day.offset}
                            onClick={() => setSelectedDayOffset(day.offset)}
                            className={`flex-1 min-w-[70px] py-2 px-3 rounded-lg text-center transition-all ${selectedDayOffset === day.offset
                                ? 'bg-yorumi-accent text-white'
                                : 'bg-[#2a2a4a] text-gray-400 hover:bg-[#3a3a5a]'
                                }`}
                        >
                            <div className="text-sm font-bold">{day.name}</div>
                            <div className="text-xs opacity-80">{day.date}</div>
                        </button>
                    ))}
                </div>

                <button
                    onClick={() => setSelectedDayOffset(Math.min(6, selectedDayOffset + 1))}
                    className="p-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white transition-colors"
                    disabled={selectedDayOffset === 6}
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Schedule List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div
                                key={`schedule-skeleton-${index}`}
                                className="flex items-center gap-4 py-3 border-b border-white/5 rounded-lg px-2"
                            >
                                <div className="h-3 w-12 rounded bg-white/10 animate-pulse" />
                                <div className="h-4 flex-1 rounded bg-white/10 animate-pulse" />
                                <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : displayedSchedule.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        No anime scheduled for this day
                    </div>
                ) : (
                    displayedSchedule.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => onAnimeClick?.(item.media.id)}
                            className="flex items-center gap-4 py-3 border-b border-white/5 hover:bg-white/5 rounded-lg px-2 cursor-pointer transition-colors"
                        >
                            <span className="text-gray-500 text-sm font-mono w-12">
                                {formatTime(item.airingAt)}
                            </span>
                            <span className="flex-1 text-white font-medium truncate hover:text-yorumi-accent transition-colors">
                                {item.media.title.english || item.media.title.romaji}
                            </span>
                            <span className="text-gray-400 text-sm flex items-center gap-1">
                                <Play className="w-3 h-3" />
                                Episode {item.episode}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Show More */}
            {schedule.length > 7 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    {showAll ? 'Show less' : 'Show more'}
                </button>
            )}
        </div>
    );
}
