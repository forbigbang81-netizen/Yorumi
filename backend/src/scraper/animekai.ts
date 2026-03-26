import { ANIME } from '@consumet/extensions';
import type { AnimeSearchResult, Episode, StreamLink } from './aniwatch';

export class AnimeKaiScraper {
    private readonly client = new ANIME.AnimeKai();

    async close() { }

    async search(query: string): Promise<AnimeSearchResult[]> {
        try {
            const response = await this.client.search(query);
            const items = Array.isArray((response as any)?.results)
                ? (response as any).results
                : (Array.isArray(response) ? response : []);

            return items.map((item: any) => ({
                id: String(item.id || ''),
                session: String(item.id || ''),
                title: String(item.title || item.japaneseTitle || 'Unknown'),
                url: String(item.url || ''),
                poster: String(item.image || item.poster || ''),
                type: item.type,
                episodes: Number(item.episodes || item.sub || item.dub || 0) || undefined,
                sub: Number(item.sub || 0) || undefined,
                dub: Number(item.dub || 0) || undefined,
                year: item.releaseDate ? String(item.releaseDate) : undefined,
            })).filter((item: AnimeSearchResult) => Boolean(item.session && item.title));
        } catch (error) {
            console.error('AnimeKai search error:', error);
            return [];
        }
    }

    async getEpisodes(animeSessionId: string): Promise<{ episodes: Episode[]; lastPage: number }> {
        try {
            const info = await this.client.fetchAnimeInfo(animeSessionId);
            const episodesRaw = Array.isArray((info as any)?.episodes) ? (info as any).episodes : [];
            const episodes = episodesRaw.map((ep: any) => ({
                id: String(ep.id || ''),
                session: String(ep.id || ''),
                episodeNumber: Number(ep.number || 0),
                url: String(ep.url || ''),
                title: String(ep.title || `Episode ${ep.number || ''}`).trim(),
                isSubbed: Boolean(ep.isSubbed ?? true),
                isDubbed: Boolean(ep.isDubbed ?? false),
                isFiller: Boolean(ep.isFiller ?? false),
            })).filter((ep: Episode) => Boolean(ep.session) && Number.isFinite(ep.episodeNumber));

            return { episodes, lastPage: 1 };
        } catch (error) {
            console.error('AnimeKai getEpisodes error:', error);
            return { episodes: [], lastPage: 1 };
        }
    }

    async getLinks(_animeSession: string, episodeSession: string): Promise<StreamLink[]> {
        try {
            const payload = await this.client.fetchEpisodeSources(episodeSession);
            const sources = Array.isArray((payload as any)?.sources) ? (payload as any).sources : [];
            const referer = String((payload as any)?.headers?.Referer || 'https://megaup.nl/');
            const subtitles = Array.isArray((payload as any)?.subtitles)
                ? (payload as any).subtitles
                    .filter((sub: any) => sub?.url)
                    .map((sub: any) => ({
                        url: `/api/scraper/proxy?url=${encodeURIComponent(String(sub.url))}&referer=${encodeURIComponent(referer)}`,
                        lang: String(sub.lang || sub.label || 'Unknown'),
                        default: Boolean(sub.default),
                    }))
                : [];

            const links = sources
                .filter((source: any) => source?.url)
                .map((source: any) => {
                    const directUrl = String(source.url);
                    const isHls = Boolean(source.isM3U8 || directUrl.includes('.m3u8'));
                    const quality = /^\d+$/.test(String(source.quality || ''))
                        ? String(source.quality)
                        : '1080';

                    return {
                        quality,
                        audio: 'sub',
                        provider: 'animekai',
                        server: 'animekai',
                        url: isHls
                            ? `/api/scraper/proxy?url=${encodeURIComponent(directUrl)}&referer=${encodeURIComponent(referer)}`
                            : directUrl,
                        directUrl,
                        isHls,
                        subtitles,
                    } satisfies StreamLink;
                });

            const deduped = new Map<string, StreamLink>();
            links.forEach((link: StreamLink) => {
                const key = `${link.audio}|${link.quality}|${link.directUrl || link.url}`;
                if (!deduped.has(key)) deduped.set(key, link);
            });

            return [...deduped.values()];
        } catch (error) {
            console.error('AnimeKai getLinks error:', error);
            return [];
        }
    }
}
