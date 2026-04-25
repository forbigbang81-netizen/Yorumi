import { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';

interface AnimeLogoImageProps {
    anilistId?: number | null;
    title: string;
    year?: number;
    episodes?: number | null;
    format?: string;
    className?: string;
    style?: React.CSSProperties;
    size?: 'small' | 'medium' | 'large'; // small: 80px, medium: 120px, large: 160px
}

const LOGO_CACHE_KEY = 'yorumi_logo_cache_v2';

// Hydrate logo cache from localStorage on module load
function loadCacheFromStorage(): Map<string, string | null> {
    try {
        const stored = localStorage.getItem(LOGO_CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const entries = Object.entries(parsed).map(([k, v]) => [
                k.includes(':') ? k : `id:${parseInt(k, 10)}`,
                typeof v === 'string' ? v : null
            ] as [string, string | null]);
            console.log(`[LogoCache] Hydrated ${entries.length} logos from storage`);
            return new Map(entries);
        }
    } catch (e) {
        console.warn('[LogoCache] Failed to load from storage:', e);
    }
    return new Map();
}

// Shared logo cache - hydrated from localStorage
const logoCache = loadCacheFromStorage();
const pendingRequests = new Map<string, Promise<string | null>>();

const getPositiveId = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getTitleCacheKey = (title: string) => {
    const normalized = title.replace(/\s+/g, ' ').trim().toLowerCase();
    return normalized ? `title:${normalized}` : null;
};

// Debounced save to localStorage
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const obj: Record<string, string | null> = {};
            logoCache.forEach((v, k) => { obj[k] = v; });
            localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(obj));
            console.log('[LogoCache] Persisted to storage');
        } catch (e) {
            console.warn('[LogoCache] Failed to persist:', e);
        }
    }, 1000);
}

/**
 * Preload logos for multiple anime IDs in a single batch request
 * Call this when spotlight/trending anime data loads
 */
export async function preloadLogos(anilistIds: number[]): Promise<void> {
    // Filter out already cached IDs
    const uncachedIds = anilistIds
        .map(getPositiveId)
        .filter((id): id is number => Boolean(id))
        .filter(id => !logoCache.has(`id:${id}`));

    if (uncachedIds.length === 0) {
        return; // All cached, no logging needed
    }

    console.log('[LogoPreload] Fetching', uncachedIds.length, 'logos...');

    try {
        const response = await fetch(`${API_BASE}/logo/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ anilistIds: uncachedIds })
        });

        if (response.ok) {
            const data = await response.json();
            let newCount = 0;
            for (const [id, result] of Object.entries(data)) {
                const logoResult = result as { logo: string | null; source: 'fanart' | 'fallback' };
                if (logoResult.source === 'fanart' && logoResult.logo) {
                    logoCache.set(`id:${parseInt(id, 10)}`, logoResult.logo);
                    newCount++;
                } else {
                    logoCache.set(`id:${parseInt(id, 10)}`, null);
                }
            }
            if (newCount > 0) {
                persistCache();
                console.log('[LogoPreload] ✓', newCount, 'logos cached');
            }
        }
    } catch (error) {
        console.warn('[LogoPreload] Failed:', error);
    }
}

export default function AnimeLogoImage({ anilistId, title, year, episodes, format, className = '', size = 'medium', style }: AnimeLogoImageProps) {
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    // Determine max height based on size prop
    const getMaxHeight = () => {
        switch (size) {
            case 'small': return '80px';
            case 'medium': return '120px';
            case 'large': return '160px';
            default: return '120px';
        }
    };

    useEffect(() => {
        let isMounted = true;
        setLogoUrl(null);
        setHasError(false);
        const resolvedId = getPositiveId(anilistId);
        const cacheKey = resolvedId ? `id:${resolvedId}` : getTitleCacheKey(title);

        if (!cacheKey) {
            setHasError(true);
            return () => {
                isMounted = false;
            };
        }

        const fetchLogo = async () => {
            // Check cache first
            if (logoCache.has(cacheKey)) {
                const cached = logoCache.get(cacheKey);
                if (isMounted) {
                    if (cached) {
                        setLogoUrl(cached);
                        setHasError(false);
                    } else {
                        setHasError(true);
                    }
                }
                return;
            }

            // Check if there's already a pending request for this ID
            if (pendingRequests.has(cacheKey)) {
                const result = await pendingRequests.get(cacheKey);
                if (isMounted) {
                    if (result) {
                        setLogoUrl(result);
                        setHasError(false);
                    } else {
                        setHasError(true);
                    }
                }
                return;
            }

            // Make new request
            const fetchPromise = (async () => {
                try {
                    const params = new URLSearchParams();
                    params.set('title', title);
                    if (year) params.set('year', String(year));
                    if (episodes) params.set('episodes', String(episodes));
                    if (format) params.set('format', format);
                    const logoEndpoint = resolvedId
                        ? `${API_BASE}/logo/${resolvedId}`
                        : `${API_BASE}/logo/resolve?${params.toString()}`;
                    const response = await fetch(logoEndpoint);

                    if (!response.ok) {
                        throw new Error('Failed to fetch logo');
                    }

                    const data = await response.json();

                    if (data.logo && data.source === 'fanart') {
                        logoCache.set(cacheKey, data.logo);
                        if (data.anilistId) {
                            logoCache.set(`id:${data.anilistId}`, data.logo);
                        }
                        persistCache();
                        return data.logo;
                    } else {
                        logoCache.set(cacheKey, null);
                        persistCache();
                        return null;
                    }
                } catch (error) {
                    console.warn('[AnimeLogoImage] Failed to fetch logo:', error);
                    logoCache.set(cacheKey, null);
                    persistCache();
                    return null;
                } finally {
                    pendingRequests.delete(cacheKey);
                }
            })();

            pendingRequests.set(cacheKey, fetchPromise);
            const result = await fetchPromise;

            if (isMounted) {
                if (result) {
                    setLogoUrl(result);
                    setHasError(false);
                } else {
                    setHasError(true);
                }
            }
        };

        fetchLogo();

        return () => {
            isMounted = false;
        };
    }, [anilistId, title, year, episodes, format]);

    // If logo is available and no error, show the logo
    if (logoUrl && !hasError) {
        return (
            <img
                src={logoUrl}
                alt={title}
                className={`max-w-full h-auto object-contain fade-in ${className}`}
                style={{
                    maxHeight: getMaxHeight(),
                    filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.8))',
                    ...style
                }}
                onError={() => {
                    console.warn('[AnimeLogoImage] Image load error, falling back to text');
                    setHasError(true);
                }}
                loading="eager"
            />
        );
    }

    // Default: Show text title immediately while logo is resolving.
    // This provides instant content - user sees title immediately
    return (
        <h1 className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight ${className}`}>
            {title}
        </h1>
    );
}
