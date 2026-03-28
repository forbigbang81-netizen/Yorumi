import { useEffect, useRef, useState } from 'react';
import { Bell, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEpisodeNotifications } from '../../../hooks/useEpisodeNotifications';

interface NotificationsBellProps {
    visible: boolean;
    theme: 'anime' | 'manga';
}

export default function NotificationsBell({ visible, theme }: NotificationsBellProps) {
    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const { notifications, unreadCount, isRead, markAsRead, markAllRead } = useEpisodeNotifications();
    const accentTextClass = theme === 'manga' ? 'text-yorumi-manga' : 'text-yorumi-accent';
    const accentBgClass = theme === 'manga' ? 'bg-yorumi-manga' : 'bg-yorumi-accent';
    const accentHoverTextClass = theme === 'manga' ? 'hover:text-yorumi-manga/80' : 'hover:text-yorumi-accent/80';

    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!dropdownRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        window.addEventListener('mousedown', handlePointerDown);
        return () => window.removeEventListener('mousedown', handlePointerDown);
    }, [isOpen]);

    if (!visible) return null;

    return (
        <div ref={dropdownRef} className="relative">
            <button
                onClick={() => setIsOpen((current) => !current)}
                className="relative flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-colors"
                aria-label="Notifications"
            >
                <Bell className="w-4 h-4 md:w-5 md:h-5" />
                {unreadCount > 0 && (
                    <span className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full ${accentBgClass} text-white text-[10px] font-bold flex items-center justify-center`}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-[320px] max-w-[88vw] overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c1c]/95 backdrop-blur-xl shadow-2xl z-[140]">
                    <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <Bell className={`w-5 h-5 ${accentTextClass}`} />
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-white">Notifications</span>
                                {unreadCount > 0 && (
                                    <span className={`min-w-6 h-6 px-1.5 rounded-full ${accentBgClass} text-white text-xs font-bold flex items-center justify-center`}>
                                        {unreadCount}
                                    </span>
                                )}
                            </div>
                        </div>

                        {notifications.length > 0 && (
                            <button
                                onClick={markAllRead}
                                className={`text-sm font-semibold ${accentTextClass} ${accentHoverTextClass} transition-colors`}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {notifications.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-gray-400">
                            {theme === 'manga' ? 'No new chapter notifications.' : 'No new episode notifications.'}
                        </div>
                    ) : (
                        <>
                            <div className="max-h-[360px] overflow-y-auto">
                                {notifications.map((notification) => {
                                    const unread = !isRead(notification.id);
                                    return (
                                        <button
                                            key={notification.id}
                                            onClick={() => {
                                                markAsRead(notification.id);
                                                setIsOpen(false);
                                                navigate(
                                                    notification.mediaType === 'anime'
                                                        ? `/anime/details/${notification.mediaId}`
                                                        : `/manga/details/${notification.mediaId}`
                                                );
                                            }}
                                            className="w-full flex items-start gap-3 px-4 py-4 border-b border-white/5 hover:bg-white/5 transition-colors text-left"
                                        >
                                            <div className="relative shrink-0">
                                                <img
                                                    src={notification.image}
                                                    alt={notification.title}
                                                    className="w-14 h-14 rounded-xl object-cover"
                                                />
                                                {unread && (
                                                    <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${accentBgClass} border-2 border-[#1c1c1c]`} />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                                                    <span className="text-lg font-bold text-white leading-none">
                                                        {notification.mediaType === 'anime' ? 'New Episode' : 'New Chapter'}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-300 truncate">{notification.title}</div>
                                                <div className="text-sm text-gray-400">
                                                    {notification.mediaType === 'anime' ? 'Episode' : 'Chapter'} {notification.availableNumber} is now available
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="px-4 py-3 text-center text-sm text-gray-500 bg-white/[0.03]">
                                Showing {notifications.length} notification{notifications.length === 1 ? '' : 's'}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
