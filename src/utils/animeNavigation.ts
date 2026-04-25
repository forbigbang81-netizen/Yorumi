type AnimeRouteTarget = {
    id?: unknown;
    mal_id?: unknown;
    scraperId?: unknown;
};

const toPositiveNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const isAnimePaheSessionId = (value: unknown): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

export const getDirectScraperRouteId = (value: unknown): string => {
    const raw = String(value || '')
        .trim()
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/^\/+/, '')
        .replace(/^watch\//i, '');

    if (!raw) return '';

    const normalized = raw.startsWith('s:') ? raw : `s:${raw}`;
    const session = normalized.slice(2).trim();
    return isAnimePaheSessionId(session) ? normalized : '';
};

export const getAnimeDetailsRouteId = (item: AnimeRouteTarget): string | number | '' => {
    const anilistId = toPositiveNumber(item.id);
    if (anilistId > 0) return anilistId;

    const malId = toPositiveNumber(item.mal_id);
    if (malId > 0) return malId;

    return getDirectScraperRouteId(item.scraperId);
};

export const getAnimeWatchRouteId = (item: AnimeRouteTarget): string | number | '' => {
    const scraperRouteId = getDirectScraperRouteId(item.scraperId);
    if (scraperRouteId) return scraperRouteId;

    const malId = toPositiveNumber(item.mal_id);
    if (malId > 0) return malId;

    return toPositiveNumber(item.id);
};
