import { ChevronLeft, ChevronRight, Settings, RotateCw, Maximize, Minimize, Captions, Mic } from 'lucide-react';
import type { StreamLink } from '../../../types/stream';

interface PlayerControlsProps {
    episodeNumber: string;
    isExpanded: boolean;
    canPrev: boolean;
    isAutoQuality: boolean;
    selectedStreamIndex: number;
    streams: StreamLink[];
    showQualityMenu: boolean;
    selectedAudio: 'sub' | 'dub';
    selectedProvider: 'vidsrc' | 'megacloud';
    availableAudios: Array<'sub' | 'dub'>;
    availableProviders: Array<'vidsrc' | 'megacloud'>;
    onPrev: () => void;
    onNext: () => void;
    onReload: () => void;
    onToggleExpand: () => void;
    setShowQualityMenu: (show: boolean) => void;
    onQualityChange: (index: number) => void;
    onSetAutoQuality: () => void;
    onAudioChange: (audio: 'sub' | 'dub') => void;
    onProviderChange: (provider: 'vidsrc' | 'megacloud') => void;
}

export default function PlayerControls({
    episodeNumber,
    isExpanded,
    canPrev,
    isAutoQuality,
    selectedStreamIndex,
    streams,
    showQualityMenu,
    selectedAudio,
    selectedProvider,
    availableAudios,
    availableProviders,
    onPrev,
    onNext,
    onReload,
    onToggleExpand,
    setShowQualityMenu,
    onQualityChange,
    onSetAutoQuality,
    onAudioChange,
    onProviderChange
}: PlayerControlsProps) {
    const hasSub = availableAudios.includes('sub');
    const hasDub = availableAudios.includes('dub');
    const hasVidSrc = availableProviders.includes('vidsrc');
    const hasMegaCloud = availableProviders.includes('megacloud');

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

                {/* Quality Selector */}
                <div className="relative flex-shrink-0 ml-auto z-50">
                    <button
                        onClick={() => setShowQualityMenu(!showQualityMenu)}
                        className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center gap-2 transition-colors relative z-10"
                    >
                        <Settings className="w-4 h-4" />
                        <span className="hidden sm:inline">
                            {isAutoQuality ? 'Auto' : streams[selectedStreamIndex]?.quality || 'Quality'}
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
                                        {stream.quality ? stream.quality.replace(/\s?p$/i, '') : 'Unknown'}P {stream.isHls && '(HLS)'}
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
                                        {stream.quality ? stream.quality.replace(/\s?p$/i, '') : 'Unknown'}P {stream.isHls && '(HLS)'}
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

            <div className="mt-3 rounded-xl overflow-hidden border border-yorumi-accent/30 bg-[#1d2028] flex flex-col md:flex-row">
                <div className="md:w-[290px] bg-yorumi-accent text-white px-4 py-3 flex items-center justify-center text-center font-semibold leading-tight">
                    <div>
                        <p>You are watching</p>
                        <p className="text-[30px] font-extrabold leading-none my-1">Episode {episodeNumber}</p>
                        <p>If current server doesn't work</p>
                        <p>please try other servers beside.</p>
                    </div>
                </div>

                <div className="flex-1 p-4">
                    <div className="flex items-center gap-3">
                        <Captions className="w-4 h-4 text-yorumi-accent" />
                        <span className="font-bold text-yorumi-accent min-w-12">SUB:</span>
                        <button
                            onClick={() => {
                                onAudioChange('sub');
                                onProviderChange('vidsrc');
                            }}
                            disabled={!hasSub || !hasVidSrc}
                            className={`px-6 py-2 rounded-md text-sm font-semibold transition-colors ${selectedAudio === 'sub' && selectedProvider === 'vidsrc' ? 'bg-yorumi-accent text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            VidSrc
                        </button>
                        <button
                            onClick={() => {
                                onAudioChange('sub');
                                onProviderChange('megacloud');
                            }}
                            disabled={!hasSub || !hasMegaCloud}
                            className={`px-6 py-2 rounded-md text-sm font-semibold transition-colors ${selectedAudio === 'sub' && selectedProvider === 'megacloud' ? 'bg-yorumi-accent text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            MegaCloud
                        </button>
                    </div>

                    <div className="my-3 border-t border-white/10" />

                    <div className="flex items-center gap-3">
                        <Mic className="w-4 h-4 text-yorumi-accent" />
                        <span className="font-bold text-yorumi-accent min-w-12">DUB:</span>
                        <button
                            onClick={() => {
                                onAudioChange('dub');
                                onProviderChange('vidsrc');
                            }}
                            disabled={!hasDub || !hasVidSrc}
                            className={`px-6 py-2 rounded-md text-sm font-semibold transition-colors ${selectedAudio === 'dub' && selectedProvider === 'vidsrc' ? 'bg-yorumi-accent text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            VidSrc
                        </button>
                        <button
                            onClick={() => {
                                onAudioChange('dub');
                                onProviderChange('megacloud');
                            }}
                            disabled={!hasDub || !hasMegaCloud}
                            className={`px-6 py-2 rounded-md text-sm font-semibold transition-colors ${selectedAudio === 'dub' && selectedProvider === 'megacloud' ? 'bg-yorumi-accent text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            MegaCloud
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
}
