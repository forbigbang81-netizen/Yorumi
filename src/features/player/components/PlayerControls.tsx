import { ChevronLeft, ChevronRight, Settings, RotateCw, Maximize, Minimize, Mic, Subtitles } from 'lucide-react';
import type { StreamLink } from '../../../types/stream';

interface PlayerControlsProps {
    isExpanded: boolean;
    canPrev: boolean;
    isAutoQuality: boolean;
    selectedStreamIndex: number;
    streams: StreamLink[];
    selectedAudio: 'sub' | 'dub';
    availableAudios: Array<'sub' | 'dub'>;
    currentEpisodeNumber: string;
    showQualityMenu: boolean;
    onPrev: () => void;
    onNext: () => void;
    onReload: () => void;
    onToggleExpand: () => void;
    setShowQualityMenu: (show: boolean) => void;
    onQualityChange: (index: number) => void;
    onSetAutoQuality: () => void;
    onAudioChange: (audio: 'sub' | 'dub') => void;
}

export default function PlayerControls({
    isExpanded,
    canPrev,
    isAutoQuality,
    selectedStreamIndex,
    streams,
    selectedAudio,
    availableAudios,
    currentEpisodeNumber,
    showQualityMenu,
    onPrev,
    onNext,
    onReload,
    onToggleExpand,
    setShowQualityMenu,
    onQualityChange,
    onSetAutoQuality,
    onAudioChange
}: PlayerControlsProps) {
    const selectedStream = streams[selectedStreamIndex];
    const selectedQualityLabel = isAutoQuality
        ? 'Auto'
        : `${selectedStream?.quality || 'Quality'}`;
    const audioRows = [
        {
            id: 'sub' as const,
            label: 'SUB',
            marker: (
                <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-[3px] bg-yorumi-accent px-1 text-[9px] font-black leading-none text-white">
                    CC
                </span>
            ),
        },
        {
            id: 'dub' as const,
            label: 'DUB',
            marker: (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 fill-current text-yorumi-accent"
                >
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3Zm-5 8a1 1 0 1 1 2 0 3 3 0 1 0 6 0 1 1 0 1 1 2 0 5.002 5.002 0 0 1-4 4.9V18h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-3.1A5.002 5.002 0 0 1 7 10Z" />
                </svg>
            ),
        },
    ];
    return (
        <div className="p-4">
            {/* Controls Row */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
                {/* Previous */}
                <button
                    onClick={onPrev}
                    className="flex-shrink-0 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canPrev}
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Previous</span>
                </button>

                {/* Next */}
                <button
                    onClick={onNext}
                    className="flex-shrink-0 px-4 py-2.5 rounded-lg bg-yorumi-accent hover:bg-yorumi-accent/90 text-white font-bold flex items-center gap-2 transition-colors"
                >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-4 h-4" />
                </button>

                {/* Sub/Dub Toggle */}
                <button
                    onClick={() => {
                        const targetAudio = selectedAudio === 'sub' ? 'dub' : 'sub';
                        if (availableAudios.includes(targetAudio)) {
                            onAudioChange(targetAudio);
                        }
                    }}
                    disabled={availableAudios.length <= 1}
                    className="flex-shrink-0 ml-auto h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                >
                    {selectedAudio === 'dub' ? (
                        <>
                            <Mic className="w-4 h-4" />
                            <span className="hidden sm:inline">Dub</span>
                        </>
                    ) : (
                        <>
                            <Subtitles className="w-4 h-4" />
                            <span className="hidden sm:inline">Sub</span>
                        </>
                    )}
                </button>

                {/* Quality Selector */}
                <div className="relative flex-shrink-0 z-50">
                    <button
                        onClick={() => setShowQualityMenu(!showQualityMenu)}
                        className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center gap-2 transition-colors relative z-10"
                    >
                        <Settings className="w-4 h-4" />
                        <span className="hidden sm:inline">
                            {selectedQualityLabel}
                        </span>
                    </button>
                    {showQualityMenu && (
                        <>
                            <div className="fixed inset-0 z-50" onClick={() => setShowQualityMenu(false)}></div>
                            {/* Mobile: Central Modal */}
                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 min-w-[200px] shadow-2xl flex flex-col gap-1 z-50 sm:hidden">
                                <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 border-b border-white/5">
                                    Select Quality
                                </div>
                                <button
                                    onClick={onSetAutoQuality}
                                    className={`w-full text-left px-4 py-3 text-base rounded-lg transition-colors ${isAutoQuality ? 'bg-yorumi-accent text-white font-bold' : 'text-gray-300 hover:bg-white/10'}`}
                                >
                                    Auto
                                </button>
                                {streams.map((stream, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onQualityChange(idx)}
                                        className={`w-full text-left px-4 py-3 text-base rounded-lg transition-colors ${!isAutoQuality && selectedStreamIndex === idx ? 'bg-yorumi-accent text-white font-bold' : 'text-gray-300 hover:bg-white/10'}`}
                                    >
                                        <span>{stream.quality ? stream.quality.replace(/\s?p$/i, '') : 'Unknown'}P</span>
                                        {stream.isHls && <span className="ml-2 text-xs text-gray-400">(HLS)</span>}
                                    </button>
                                ))}
                            </div>

                            {/* Desktop: Popover */}
                            <div className="hidden sm:flex absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-lg p-1.5 min-w-[140px] shadow-xl flex-col gap-1 z-[60]">
                                <button
                                    onClick={onSetAutoQuality}
                                    className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${isAutoQuality ? 'bg-yorumi-accent/20 text-yorumi-accent' : 'text-gray-300 hover:bg-white/10'}`}
                                >
                                    Auto
                                </button>
                                {streams.map((stream, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onQualityChange(idx)}
                                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${!isAutoQuality && selectedStreamIndex === idx ? 'bg-yorumi-accent/20 text-yorumi-accent' : 'text-gray-300 hover:bg-white/10'}`}
                                    >
                                        <span>{stream.quality ? stream.quality.replace(/\s?p$/i, '') : 'Unknown'}P</span>
                                        {stream.isHls && <span className="ml-2 text-[10px] text-gray-400">(HLS)</span>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Reload */}
                <button
                    onClick={onReload}
                    className="flex-shrink-0 h-10 px-4 rounded-lg bg-transparent hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center gap-2 transition-colors"
                >
                    <RotateCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Reload</span>
                </button>

                {/* Expand */}
                <button
                    onClick={onToggleExpand}
                    className="flex-shrink-0 flex h-10 px-4 rounded-lg bg-transparent hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium items-center gap-2 transition-colors"
                >
                    {isExpanded ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isExpanded ? 'Collapse' : 'Expand'}</span>
                </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl bg-[#14161d] shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                <div className="flex flex-row">
                    <div className="flex min-w-0 shrink-0 basis-[42%] items-center justify-center bg-yorumi-accent px-4 py-3 text-center sm:px-5 lg:min-h-[106px] lg:w-[290px] lg:basis-auto lg:px-5 lg:py-3">
                        <div className="max-w-[220px]">
                            <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-blue-100/90 sm:text-[11px]">You are watching</p>
                            <p className="mt-0.5 text-[1.35rem] font-black tracking-tight text-white leading-none sm:text-[1.65rem]">
                                Episode {currentEpisodeNumber}
                            </p>
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 bg-[#1b1d24]">
                        {audioRows.map(({ id, label, marker }, index) => {
                            const isAvailable = availableAudios.includes(id);
                            const isSelected = selectedAudio === id;

                            return (
                                <div
                                    key={id}
                                    className={`flex items-center gap-2 px-2.5 py-3 sm:gap-3 sm:px-4 ${index === 0 ? 'border-b border-[#5a5f69]' : ''}`}
                                >
                                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                                        <span className="inline-flex h-4 min-w-[18px] shrink-0 items-center justify-center">
                                            {marker}
                                        </span>
                                        <span className="text-[12px] font-black tracking-wide text-white sm:text-[15px]">{label}:</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => onAudioChange(id)}
                                        disabled={!isAvailable || isSelected}
                                        className={`ml-auto w-[120px] rounded-xl px-2.5 py-2 text-[11px] font-bold leading-tight text-center transition-all sm:w-[152px] sm:px-4 sm:py-2.5 sm:text-sm ${isSelected
                                            ? 'bg-yorumi-accent text-white shadow-[0_10px_30px_rgba(54,179,255,0.28)]'
                                            : isAvailable
                                                ? 'bg-[#2a2f3b] text-blue-50 hover:bg-[#324457]'
                                                : 'bg-[#252831] text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        {isSelected ? `Using ${label}` : isAvailable ? `Switch to ${label}` : `${label} Unavailable`}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div >
    );
}
