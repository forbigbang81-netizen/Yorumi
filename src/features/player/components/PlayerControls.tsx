import { ChevronLeft, ChevronRight, Settings, Maximize, Minimize } from 'lucide-react';
import type { StreamLink } from '../../../types/stream';

interface PlayerControlsProps {
    isExpanded: boolean;
    canPrev: boolean;
    isAutoQuality: boolean;
    selectedStreamIndex: number;
    streams: StreamLink[];
    selectedAudio: 'sub' | 'dub';
    availableAudios: Array<'sub' | 'dub'>;
    showQualityMenu: boolean;
    onPrev: () => void;
    onNext: () => void;
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
    showQualityMenu,
    onPrev,
    onNext,
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
    return (
        <div className="hidden md:block watch-safe-bottom bg-[#202020] px-2 py-2 md:bg-transparent md:px-0">
            {/* Controls Row */}
            <div className="flex items-center gap-1.5 pb-1 overflow-x-auto no-scrollbar md:gap-2 md:flex-nowrap md:overflow-visible">
                {/* Previous */}
                <button
                    onClick={onPrev}
                    className="flex-shrink-0 h-8 px-2.5 md:h-9 md:px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium flex items-center gap-1.5 md:gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canPrev}
                >
                    <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="text-[13px] md:text-sm">Previous</span>
                </button>

                {/* Next */}
                <button
                    onClick={onNext}
                    className="flex-shrink-0 h-8 px-2.5 md:h-9 md:px-4 rounded-lg bg-yorumi-accent hover:bg-yorumi-accent/90 text-white font-bold flex items-center gap-1.5 md:gap-2 transition-colors shadow-lg shadow-yorumi-accent/20"
                >
                    <span className="text-[13px] md:text-sm">Next</span>
                    <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>

                {/* Sub/Dub Toggle */}
                <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 h-8 md:h-9 items-center ml-auto">
                    <button 
                        onClick={() => onAudioChange('sub')}
                        disabled={!availableAudios.includes('sub')}
                        className={`px-2.5 md:px-3 h-full rounded-md text-[10px] font-bold tracking-wider transition-all ${selectedAudio === 'sub' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'} disabled:opacity-20`}
                    >SUB</button>
                    <button 
                        onClick={() => onAudioChange('dub')}
                        disabled={!availableAudios.includes('dub')}
                        className={`px-2.5 md:px-3 h-full rounded-md text-[10px] font-bold tracking-wider transition-all ${selectedAudio === 'dub' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'} disabled:opacity-20`}
                    >DUB</button>
                </div>

                {/* Quality Selector */}
                <div className="relative flex-shrink-0 z-50">
                    <button
                        onClick={() => setShowQualityMenu(!showQualityMenu)}
                        className="h-8 px-2.5 md:h-9 md:px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center gap-1.5 md:gap-2 transition-colors relative z-10"
                    >
                        <Settings className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="text-[13px] md:text-sm">
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

                {/* Expand */}
                <button
                    onClick={onToggleExpand}
                    className="hidden md:flex flex-shrink-0 h-9 px-4 rounded-lg bg-transparent hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium items-center gap-2 transition-colors"
                >
                    {isExpanded ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    <span className="text-sm">{isExpanded ? 'Collapse' : 'Expand'}</span>
                </button>
            </div>


        </div >
    );
}
