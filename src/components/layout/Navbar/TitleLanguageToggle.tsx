import { useTitleLanguage } from '../../../context/TitleLanguageContext';

interface TitleLanguageToggleProps {
    variant?: 'desktop' | 'mobile';
    onClose?: () => void;
    theme?: 'anime' | 'manga';
}

export default function TitleLanguageToggle({ variant = 'desktop', onClose, theme = 'anime' }: TitleLanguageToggleProps) {
    const { language, setLanguage } = useTitleLanguage();
    const activeClass = theme === 'manga'
        ? 'bg-yorumi-manga text-white'
        : 'bg-yorumi-accent text-[#0a0a0a]';

    const handleChange = (next: 'eng' | 'jpy') => {
        setLanguage(next);
        onClose?.();
    };

    if (variant === 'mobile') {
        return (
            <div className="flex items-center rounded bg-[#1c1c1c] overflow-hidden border border-transparent">
                <button
                    onClick={() => handleChange('eng')}
                    className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all ${language === 'eng'
                        ? activeClass
                        : 'text-gray-500'
                        }`}
                >
                    EN
                </button>
                <button
                    onClick={() => handleChange('jpy')}
                    className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all ${language === 'jpy'
                        ? activeClass
                        : 'text-gray-500'
                        }`}
                >
                    JPY
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center rounded bg-[#1c1c1c] overflow-hidden border border-transparent hover:border-white/10 transition-colors">
            <button
                onClick={() => handleChange('eng')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${language === 'eng'
                    ? activeClass
                    : 'text-gray-500 hover:text-white'
                    }`}
            >
                EN
            </button>
            <button
                onClick={() => handleChange('jpy')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${language === 'jpy'
                    ? activeClass
                    : 'text-gray-500 hover:text-white'
                    }`}
            >
                JPY
            </button>
        </div>
    );
}
