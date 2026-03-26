import axios from 'axios';
import * as cheerio from 'cheerio';

export interface AnimeSearchResult {
    id: string;
    title: string;
    url: string;
    poster?: string;
    status?: string;
    type?: string;
    episodes?: number;
    sub?: number;
    dub?: number;
    year?: string;
    score?: string;
    session: string;
}

export interface Episode {
    id: string;
    episodeNumber: number;
    url: string;
    title?: string;
    duration?: string;
    date?: string;
    snapshot?: string;
    session: string;
    isSubbed?: boolean;
    isDubbed?: boolean;
    isFiller?: boolean;
}

export interface StreamLink {
    quality: string;
    audio: string;
    provider?: string;
    server?: string;
    url: string;
    directUrl?: string;
    isHls: boolean;
    subtitles?: { url: string; lang: string; default?: boolean }[];
}

export class AniwatchScraper {
    private scraperPromise: Promise<any> | null = null;

    constructor() { }

    private async getScraper(): Promise<any> {
        if (!this.scraperPromise) {
            this.scraperPromise = import('aniwatch')
                .then((mod: any) => new mod.HiAnime.Scraper());
        }
        return this.scraperPromise;
    }

    async close() { }

    async search(query: string): Promise<AnimeSearchResult[]> {
        try {
            const scraper = await this.getScraper();
            const res = await scraper.search(query, 1);
            return (res.animes || []).map((item: any) => ({
                id: item.id,
                session: item.id,
                title: item.name,
                url: `/anime/${item.id}`,
                poster: item.poster,
                type: item.type,
                episodes: item.episodes?.sub || item.episodes?.dub || 0,
                sub: item.episodes?.sub ?? undefined,
                dub: item.episodes?.dub ?? undefined,
            }));
        } catch (error) {
            console.error('Aniwatch search error:', error);
            return [];
        }
    }

    async getEpisodes(
        animeSessionId: string
    ): Promise<{ episodes: Episode[]; lastPage: number }> {
        try {
            const scraper = await this.getScraper();
            const res = await scraper.getEpisodes(animeSessionId);
            const eps = (res.episodes || []) as any[];
            return {
                episodes: eps.map((ep: any) => ({
                    id: ep.episodeId,
                    session: ep.episodeId,
                    episodeNumber: ep.number,
                    url: `/play/${animeSessionId}/${ep.episodeId}`,
                    title: ep.title,
                    isFiller: ep.isFiller,
                    isSubbed: true,
                    isDubbed: false,
                })),
                lastPage: 1,
            };
        } catch (error) {
            console.error('Aniwatch getEpisodes error:', error);
            return { episodes: [], lastPage: 1 };
        }
    }

    async getLinks(_animeSession: string, episodeSession: string): Promise<StreamLink[]> {
        try {
            const scraper = await this.getScraper();
            const candidates: Array<{ server: string; category: 'sub' | 'dub' }> = [
                { server: 'hd-1', category: 'sub' },
                { server: 'hd-2', category: 'sub' },
                { server: 'hd-1', category: 'dub' },
                { server: 'hd-2', category: 'dub' },
            ];

            const normalizeProvider = (server: string, url: string) => {
                const hay = `${server} ${url}`.toLowerCase();
                if (hay.includes('mega')) return 'megacloud';
                if (hay.includes('vidsrc') || hay.includes('vidstream')) return 'vidsrc';
                if (server === 'hd-1') return 'vidsrc';
                if (server === 'hd-2') return 'megacloud';
                return server || 'unknown';
            };
            const normalizeProviderName = (name: string) => {
                const lower = String(name || '').toLowerCase();
                if (lower.includes('mega')) return 'megacloud';
                if (lower.includes('vidsrc') || lower.includes('vidstream')) return 'vidsrc';
                if (lower.includes('t-cloud') || lower.includes('tcloud')) return 'megacloud';
                return lower || 'unknown';
            };
            const isDeadEmbed = async (url: string): Promise<boolean> => {
                try {
                    const resp = await axios.get(url, {
                        timeout: 8000,
                        validateStatus: () => true,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                            Referer: 'https://aniwatchtv.to/',
                            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        },
                    });
                    const body = String(resp?.data || '').toLowerCase();
                    return body.includes('file not found')
                        || body.includes("we're sorry")
                        || body.includes('copyright violation');
                } catch {
                    return true;
                }
            };
            const links: StreamLink[] = [];
            let fallbackSubtitles: { url: string; lang: string; default?: boolean }[] = [];

            const fetchSubtitleList = async (server: string, category: 'sub' | 'dub') => {
                try {
                    const payload = await scraper.getEpisodeSources(
                        episodeSession,
                        server as any,
                        category as any
                    );
                    const referer = payload?.headers?.Referer || 'https://megacloud.blog/';
                    const rawApiBase = String(process.env.API_URL || '/api').replace(/\/+$/, '');
                    const apiBase = rawApiBase === '/api' || rawApiBase.endsWith('/api')
                        ? rawApiBase
                        : `${rawApiBase}/api`;
                    return (Array.isArray(payload?.subtitles) ? payload.subtitles : [])
                        .filter((sub: any) => sub?.url)
                        .map((sub: any) => ({
                            url: `${apiBase}/scraper/proxy?url=${encodeURIComponent(String(sub.url))}&referer=${encodeURIComponent(referer)}`,
                            lang: String(sub.lang || sub.language || 'Unknown'),
                            default: Boolean(sub.default),
                        }));
                } catch {
                    return [];
                }
            };
            for (const candidate of candidates) {
                try {
                    const payload = await scraper.getEpisodeSources(
                        episodeSession,
                        candidate.server as any,
                        candidate.category as any
                    );
                    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
                    if (sources.length === 0) continue;

                    const referer = payload?.headers?.Referer || 'https://megacloud.blog/';
                    const rawApiBase = String(process.env.API_URL || '/api').replace(/\/+$/, '');
                    const apiBase = rawApiBase === '/api' || rawApiBase.endsWith('/api')
                        ? rawApiBase
                        : `${rawApiBase}/api`;
                    const subtitleListRaw = (Array.isArray(payload?.subtitles) ? payload.subtitles : [])
                        .filter((sub: any) => sub?.url)
                        .map((sub: any) => ({
                            url: `${apiBase}/scraper/proxy?url=${encodeURIComponent(String(sub.url))}&referer=${encodeURIComponent(referer)}`,
                            lang: String(sub.lang || sub.language || 'Unknown'),
                            default: Boolean(sub.default),
                        }));
                    if (candidate.category === 'sub' && subtitleListRaw.length > 0) {
                        fallbackSubtitles = subtitleListRaw;
                    }
                    const subtitleList = subtitleListRaw.length > 0
                        ? subtitleListRaw
                        : (candidate.category === 'dub' ? fallbackSubtitles : []);

                    const candidateLinks = sources
                        .filter((source: any) => !!source?.url)
                        .map((source: any) => {
                            const originalUrl = String(source.url);
                            const proxiedUrl = `${apiBase}/scraper/proxy?url=${encodeURIComponent(originalUrl)}&referer=${encodeURIComponent(referer)}`;
                            const qualityRaw = String(source.quality || '1080');
                            const quality = /^\d+$/.test(qualityRaw) ? qualityRaw : '1080';
                            const provider = normalizeProvider(candidate.server, originalUrl);
                            return {
                                quality,
                                audio: candidate.category,
                                provider,
                                server: candidate.server,
                                url: proxiedUrl,
                                directUrl: originalUrl,
                                isHls: Boolean(source.isM3U8 || originalUrl.includes('.m3u8')),
                                subtitles: subtitleList,
                            } satisfies StreamLink;
                        });

                    links.push(...candidateLinks);
                } catch {
                    // try next server/category
                }
            }

            if (links.length === 0) return [];

            // If dub links are present but still lack subtitles, fetch sub subtitles once as fallback.
            const hasDubWithoutSubs = links.some((l) => l.audio === 'dub' && (!Array.isArray(l.subtitles) || l.subtitles.length === 0));
            if (hasDubWithoutSubs && fallbackSubtitles.length === 0) {
                const subHd1 = await fetchSubtitleList('hd-1', 'sub');
                fallbackSubtitles = subHd1.length > 0 ? subHd1 : await fetchSubtitleList('hd-2', 'sub');
            }
            if (fallbackSubtitles.length > 0) {
                links.forEach((l) => {
                    if (l.audio === 'dub' && (!Array.isArray(l.subtitles) || l.subtitles.length === 0)) {
                        l.subtitles = fallbackSubtitles;
                    }
                });
            }

            const deduped = new Map<string, StreamLink>();
            links.forEach((link) => {
                const key = `${link.audio}|${link.provider}|${link.quality}|${link.directUrl || link.url}`;
                if (!deduped.has(key)) deduped.set(key, link);
            });

            return [...deduped.values()];
        } catch (error) {
            console.error('Aniwatch getLinks error:', error);
            return [];
        }
    }
}
