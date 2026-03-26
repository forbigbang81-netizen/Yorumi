import { ANIME } from '@consumet/extensions';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AnimeSearchResult, Episode, StreamLink } from './aniwatch';

const ANIMEKAI_BASE = 'https://anikai.to';
const ENC_DEC_BASE = 'https://enc-dec.app/api';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export class AnimeKaiScraper {
    private readonly client = new ANIME.AnimeKai();

    async close() { }

    private getWatchReferer(animeSession: string) {
        return `${ANIMEKAI_BASE}/watch/${animeSession}`;
    }

    private parseEpisodeToken(episodeSession: string) {
        const match = String(episodeSession || '').match(/\$token=([^$]+)/);
        return match?.[1] ? decodeURIComponent(match[1]) : '';
    }

    private async encKai(text: string): Promise<string> {
        const { data } = await axios.get(`${ENC_DEC_BASE}/enc-kai`, {
            params: { text },
            timeout: 15000,
            headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'application/json, text/plain, */*',
            },
        });
        if (!data?.result) {
            throw new Error('enc-kai returned no result');
        }
        return String(data.result);
    }

    private async decKai(text: string): Promise<{ url?: string; skip?: any }> {
        const { data } = await axios.post(`${ENC_DEC_BASE}/dec-kai`, { text }, {
            timeout: 15000,
            headers: {
                'User-Agent': BROWSER_UA,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
            },
        });
        if (!data?.result || typeof data.result !== 'object') {
            throw new Error(`dec-kai returned invalid payload: ${JSON.stringify(data)}`);
        }
        return data.result;
    }

    private async decMega(text: string) {
        const { data } = await axios.post(`${ENC_DEC_BASE}/dec-mega`, {
            text,
            agent: BROWSER_UA,
        }, {
            timeout: 15000,
            headers: {
                'User-Agent': BROWSER_UA,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
            },
        });
        if (!data?.result || !Array.isArray(data.result.sources)) {
            throw new Error(`dec-mega returned invalid payload: ${JSON.stringify(data)}`);
        }
        return data.result;
    }

    private async resolveEmbedUrl(animeSession: string, episodeSession: string): Promise<string> {
        const token = this.parseEpisodeToken(episodeSession);
        if (!token) {
            throw new Error(`Invalid AnimeKai episode session: ${episodeSession}`);
        }

        const referer = this.getWatchReferer(animeSession);
        const listKey = await this.encKai(token);
        const { data: listPayload } = await axios.get(`${ANIMEKAI_BASE}/ajax/links/list`, {
            params: { token, _: listKey },
            timeout: 15000,
            headers: {
                'User-Agent': BROWSER_UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: referer,
                Accept: 'application/json, text/plain, */*',
            },
        });

        const html = String(listPayload?.result || '');
        if (!html) {
            throw new Error('AnimeKai links/list returned empty HTML');
        }

        const $ = cheerio.load(html);
        const server =
            $('.server-items[data-id="sub"] .server').first() ||
            $('.server-items[data-id="softsub"] .server').first() ||
            $('.server').first();
        const lid = String(server.attr('data-lid') || '').trim();
        if (!lid) {
            throw new Error('AnimeKai links/list returned no server lid');
        }

        const viewKey = await this.encKai(lid);
        const { data: viewPayload } = await axios.get(`${ANIMEKAI_BASE}/ajax/links/view`, {
            params: { id: lid, _: viewKey },
            timeout: 15000,
            headers: {
                'User-Agent': BROWSER_UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: referer,
                Accept: 'application/json, text/plain, */*',
            },
        });

        const decrypted = await this.decKai(String(viewPayload?.result || ''));
        const embedUrl = String(decrypted?.url || '').trim();
        if (!embedUrl) {
            throw new Error('AnimeKai links/view returned no embed URL');
        }
        return embedUrl;
    }

    private async fetchLinksManual(animeSession: string, episodeSession: string): Promise<StreamLink[]> {
        const referer = await this.resolveEmbedUrl(animeSession, episodeSession);
        const mediaUrl = referer.replace('/e/', '/media/');
        const { data: mediaPayload } = await axios.get(mediaUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'application/json, text/plain, */*',
            },
        });

        const encrypted = String(mediaPayload?.result || '').trim();
        if (!encrypted) {
            throw new Error('MegaUp media returned no encrypted result');
        }

        const decrypted = await this.decMega(encrypted);
        const subtitles = Array.isArray(decrypted?.tracks)
            ? decrypted.tracks
                .filter((sub: any) => sub?.file)
                .map((sub: any) => ({
                    url: `/api/scraper/proxy?url=${encodeURIComponent(String(sub.file))}&referer=${encodeURIComponent(referer)}`,
                    lang: String(sub.label || sub.lang || 'Unknown'),
                    default: Boolean(sub.default),
                }))
            : [];

        return (Array.isArray(decrypted?.sources) ? decrypted.sources : [])
            .filter((source: any) => source?.file)
            .map((source: any) => {
                const directUrl = String(source.file);
                const isHls = directUrl.includes('.m3u8');
                return {
                    quality: '1080',
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
    }

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

    async getLinks(animeSession: string, episodeSession: string): Promise<StreamLink[]> {
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

            const resolved = [...deduped.values()];
            if (resolved.length > 0) {
                return resolved;
            }
        } catch (error) {
            console.error('AnimeKai getLinks package path failed:', {
                animeSession,
                episodeSession,
                error: error instanceof Error ? error.message : error,
            });
        }

        try {
            const manual = await this.fetchLinksManual(animeSession, episodeSession);
            if (manual.length > 0) {
                return manual;
            }
        } catch (error) {
            console.error('AnimeKai getLinks manual path failed:', {
                animeSession,
                episodeSession,
                error: error instanceof Error ? error.message : error,
            });
        }

        return [];
    }
}
