import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import type { SubtitleTrack } from '../../../types/stream';

interface VideoPlayerProps {
    streamUrl?: string;
    isHls?: boolean;
    subtitles?: SubtitleTrack[];
    isLoading: boolean;
    isExpanded: boolean;
    onLoad?: () => void;
    onError?: () => void;
    onProgress?: (progress: { currentTime: number; duration: number; ended?: boolean }) => void;
    startAtSeconds?: number;
}

export default function VideoPlayer({
    streamUrl,
    isHls = false,
    subtitles = [],
    isLoading,
    isExpanded,
    onLoad,
    onError,
    onProgress,
    startAtSeconds = 0
}: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const onLoadRef = useRef(onLoad);
    const startAtRef = useRef(startAtSeconds);
    const hasAppliedStartRef = useRef(false);
    onLoadRef.current = onLoad;
    startAtRef.current = startAtSeconds;

    const isHlsStream = isHls || (() => {
        if (!streamUrl) return false;
        if (streamUrl.includes('.m3u8')) return true;
        try {
            return decodeURIComponent(streamUrl).includes('.m3u8');
        } catch {
            return false;
        }
    })();

    useEffect(() => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        hasAppliedStartRef.current = false;

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        Array.from(video.querySelectorAll('track[data-yorumi-subtitle="1"]')).forEach((track) => track.remove());

        if (!streamUrl) {
            video.removeAttribute('src');
            video.load();
            return;
        }

        if (!isHlsStream) return;

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => undefined);
                onLoadRef.current?.();
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data?.fatal) {
                    onError?.();
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.play().catch(() => undefined);
            onLoadRef.current?.();
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [streamUrl, isHlsStream]);

    useEffect(() => {
        if (!videoRef.current || !isHlsStream) return;
        const video = videoRef.current;

        const applyStart = () => {
            if (hasAppliedStartRef.current) return;
            const target = Number(startAtRef.current || 0);
            if (!Number.isFinite(target) || target <= 0) return;

            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            const clamped = duration > 0
                ? Math.min(target, Math.max(0, Math.floor(duration) - 2))
                : target;

            try {
                video.currentTime = Math.max(0, clamped);
                hasAppliedStartRef.current = true;
            } catch {
                // Ignore seek timing errors; we'll retry on metadata events.
            }
        };

        applyStart();
        video.addEventListener('loadedmetadata', applyStart);
        video.addEventListener('canplay', applyStart);
        return () => {
            video.removeEventListener('loadedmetadata', applyStart);
            video.removeEventListener('canplay', applyStart);
        };
    }, [streamUrl, isHlsStream, startAtSeconds]);

    useEffect(() => {
        if (!videoRef.current || !isHlsStream || !streamUrl) return;
        const video = videoRef.current;

        Array.from(video.querySelectorAll('track[data-yorumi-subtitle="1"]')).forEach((track) => track.remove());

        const preferred =
            subtitles.find((sub) => Boolean(sub.default)) ||
            subtitles.find((sub) => {
                const lang = String(sub.lang || '').trim().toLowerCase();
                return lang === 'english' || lang === 'eng' || lang === 'en' || lang.startsWith('en-');
            }) ||
            subtitles[0];
        if (!preferred?.url) return;

        const track = document.createElement('track');
        track.setAttribute('data-yorumi-subtitle', '1');
        track.kind = 'subtitles';
        track.label = preferred.lang || 'Subtitle';
        track.src = preferred.url;
        const lang = String(preferred.lang || '').trim().toLowerCase();
        track.srclang = (lang === 'english' || lang === 'eng') ? 'en' : (lang || 'en');
        // Don't force default at append time; wait until file is loaded to avoid
        // browser caption-loading UI lingering while video is already playing.
        track.default = false;
        video.appendChild(track);

        const disableAllTracks = () => {
            for (let i = 0; i < video.textTracks.length; i += 1) {
                video.textTracks[i].mode = 'disabled';
            }
        };

        const applyMode = () => {
            for (let i = 0; i < video.textTracks.length; i += 1) {
                const t = video.textTracks[i];
                const isEnglish = t.language?.toLowerCase().startsWith('en') || /english/i.test(t.label || '');
                t.mode = isEnglish ? 'showing' : 'disabled';
            }
        };

        // Keep captions disabled until subtitle cues are ready.
        disableAllTracks();
        const handleTrackLoaded = () => applyMode();
        const handleTrackError = () => {
            // If subtitle source fails, remove it so it doesn't keep a loading state.
            track.remove();
            disableAllTracks();
        };
        track.addEventListener('load', handleTrackLoaded);
        track.addEventListener('error', handleTrackError);

        // Fallback in case some browsers don't fire the load event reliably.
        const fallbackTimer = window.setTimeout(applyMode, 600);

        return () => {
            window.clearTimeout(fallbackTimer);
            track.removeEventListener('load', handleTrackLoaded);
            track.removeEventListener('error', handleTrackError);
        };
    }, [subtitles, isHlsStream, streamUrl]);

    return (
        <div className={`relative w-full aspect-video shrink-0 ${isExpanded ? 'max-h-[78vh]' : ''} bg-black group transition-all duration-300 overflow-hidden`}>
            <div className="absolute inset-0 bg-black" />
            {isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
                    <LoadingSpinner />
                    <p className="mt-4 text-gray-400 animate-pulse">Loading Stream...</p>
                </div>
            ) : streamUrl && isHlsStream ? (
                <div className="relative w-full h-full z-10 flex items-center justify-center">
                    <video
                        ref={videoRef}
                        className="max-w-full max-h-full w-auto h-auto object-contain object-center [color-scheme:dark] bg-black"
                        controls
                        playsInline
                        autoPlay
                        crossOrigin="anonymous"
                        preload="auto"
                        onLoadedData={onLoad}
                        onError={onError}
                        onTimeUpdate={(e) => {
                            const el = e.currentTarget;
                            onProgress?.({
                                currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0,
                                duration: Number.isFinite(el.duration) ? el.duration : 0
                            });
                        }}
                        onDurationChange={(e) => {
                            const el = e.currentTarget;
                            onProgress?.({
                                currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0,
                                duration: Number.isFinite(el.duration) ? el.duration : 0
                            });
                        }}
                        onEnded={(e) => {
                            const el = e.currentTarget;
                            onProgress?.({
                                currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0,
                                duration: Number.isFinite(el.duration) ? el.duration : 0,
                                ended: true
                            });
                        }}
                    />
                </div>
            ) : streamUrl ? (
                <div className="relative w-full h-full bg-black flex items-center justify-center z-10">
                    <div className="w-full h-full max-w-full max-h-full flex items-center justify-center bg-black">
                        <iframe
                            key={streamUrl}
                            src={streamUrl}
                            className="w-full h-full border-0 bg-black"
                            allowFullScreen
                            allow="autoplay"
                            title="Video Player"
                            onLoad={onLoad}
                            onError={onError}
                        />
                    </div>
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                    <span className="mb-2 text-6xl opacity-20">▶</span>
                    <p>Select an episode</p>
                </div>
            )}
        </div>
    );
}
