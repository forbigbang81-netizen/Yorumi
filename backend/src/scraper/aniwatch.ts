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

            let sourcePayload: any = null;
            for (const candidate of candidates) {
                try {
                    const payload = await scraper.getEpisodeSources(
                        episodeSession,
                        candidate.server as any,
                        candidate.category as any
                    );
                    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
                    if (sources.length > 0) {
                        sourcePayload = payload;
                        break;
                    }
                } catch {
                    // try next server/category
                }
            }

            const sources = Array.isArray(sourcePayload?.sources) ? sourcePayload.sources : [];
            if (sources.length === 0) return [];

            const referer = sourcePayload?.headers?.Referer || 'https://megacloud.blog/';
            const apiBase = process.env.API_URL || 'http://localhost:3001/api';
            const subtitleList = (Array.isArray(sourcePayload?.subtitles) ? sourcePayload.subtitles : [])
                .filter((sub: any) => sub?.url)
                .map((sub: any) => ({
                    url: `${apiBase}/scraper/proxy?url=${encodeURIComponent(String(sub.url))}&referer=${encodeURIComponent(referer)}`,
                    lang: String(sub.lang || sub.language || 'Unknown'),
                    default: Boolean(sub.default),
                }));

            const links = sources
                .filter((source: any) => !!source?.url)
                .map((source: any) => {
                    const originalUrl = String(source.url);
                    const proxiedUrl = `${apiBase}/scraper/proxy?url=${encodeURIComponent(originalUrl)}&referer=${encodeURIComponent(referer)}`;
                    const qualityRaw = String(source.quality || '1080');
                    const quality = /^\d+$/.test(qualityRaw) ? qualityRaw : '1080';
                    return {
                        quality,
                        audio: 'sub',
                        url: proxiedUrl,
                        directUrl: originalUrl,
                        isHls: Boolean(source.isM3U8 || originalUrl.includes('.m3u8')),
                        subtitles: subtitleList,
                    } satisfies StreamLink;
                });

            return links;
        } catch (error) {
            console.error('Aniwatch getLinks error:', error);
            return [];
        }
    }
}
