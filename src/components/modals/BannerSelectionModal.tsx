import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';

interface BannerSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentBanner: string | null;
    onSelectBanner: (path: string) => void;
}

const presetBanners = [
    '/anime-bg.png'
];

export default function BannerSelectionModal({ isOpen, onClose, currentBanner, onSelectBanner }: BannerSelectionModalProps) {
    const [customUrl, setCustomUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            setCustomUrl('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-black/40 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 ring-1 ring-white/5 flex flex-col max-h-[80vh] m-4">
                <div className="p-6 text-center border-b border-white/5 relative">
                    <h2 className="text-2xl font-bold text-white">Choose Banner</h2>
                    <button onClick={onClose} className="absolute right-6 top-6 text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 mb-3">Presets</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {presetBanners.map((banner) => {
                                const isSelected = currentBanner === banner;
                                return (
                                    <button
                                        key={banner}
                                        onClick={() => onSelectBanner(banner)}
                                        className={`relative h-28 rounded-xl overflow-hidden border transition-all ${isSelected ? 'border-[#d886ff] ring-2 ring-[#d886ff]/30' : 'border-white/10 hover:border-white/30'}`}
                                    >
                                        <img src={banner} alt="Banner preset" className="w-full h-full object-cover" />
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 bg-[#d886ff] rounded-full p-1">
                                                <Check className="w-4 h-4 text-black" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-gray-400 mb-3">Custom URL</h3>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                value={customUrl}
                                onChange={(e) => setCustomUrl(e.target.value)}
                                placeholder="https://example.com/banner.jpg"
                                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-yorumi-accent"
                            />
                            <button
                                onClick={() => {
                                    if (customUrl.trim()) onSelectBanner(customUrl.trim());
                                }}
                                className="px-4 py-2 bg-yorumi-accent text-black font-bold rounded-lg hover:bg-yorumi-accent/80 transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
