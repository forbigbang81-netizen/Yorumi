import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AnimeSearchResult, Episode, StreamLink } from './aniwatch';

const ANIMEKAI_BASE = 'https://anikai.to';
const ANIMEKAI_HOME_BASE = 'https://animekai.to';
const ENC_DEC_BASE = 'https://enc-dec.app/api';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

type TopTrendingRange = 'now' | 'day' | 'week' | 'month';

export class AnimeKaiScraper {
    async close() { }

    private getWatchReferer(animeSession: string) {
        return `${ANIMEKAI_BASE}/watch/${animeSession}`;
    }

    private extractBackgroundImage(input: string): string | undefined {
        const match = String(input || '').match(/url\((['"]?)(.*?)\1\)/i);
        const value = String(match?.[2] || '').trim();
        return value || undefined;
    }

    private parseLatestUpdateCard($: any, element: any) {
        const $el = $(element);
        const posterLink = String($el.find('a.poster').attr('href') || '').trim();
        const titleEl = $el.find('a.title').first();
        const title = String(titleEl.attr('title') || titleEl.text() || '').trim();
        const jname = String(titleEl.attr('data-jp') || '').trim();
        const poster =
            String($el.find('img').attr('data-src') || $el.find('img').attr('src') || '').trim();

        const infoSpans = $el.find('.info span');
        const sub = Number(String(infoSpans.eq(0).text() || '').replace(/\D/g, '')) || 0;
        const dub = Number(String(infoSpans.eq(1).text() || '').replace(/\D/g, '')) || 0;
        const numericThird = Number(String(infoSpans.eq(2).text() || '').replace(/\D/g, '')) || 0;
        const episodes = numericThird || undefined;
        const type = String(infoSpans.last().text() || '').trim() || undefined;

        const watchPath = posterLink.split('#')[0].trim();
        const scraperId = watchPath.replace(/^\/watch\//, '').trim();
        if (!title || !watchPath || !scraperId) return null;

        return {
            title,
            jname: jname || undefined,
            poster: poster || undefined,
            type,
            episodes,
            latestEpisode: Math.max(sub, dub, numericThird) || undefined,
            sub: sub || undefined,
            dub: dub || undefined,
            link: `${ANIMEKAI_HOME_BASE}${posterLink}`,
            scraperId,
        };
    }

    async getLatestUpdates(): Promise<Array<{
        title: string;
        jname?: string;
        poster?: string;
        type?: string;
        episodes?: number;
        latestEpisode?: number;
        sub?: number;
        dub?: number;
        link: string;
        scraperId: string;
    }>> {
        try {
            const { data } = await axios.get(`${ANIMEKAI_HOME_BASE}/home`, {
                timeout: 20000,
                proxy: false,
                headers: {
                    'User-Agent': BROWSER_UA,
                    Referer: `${ANIMEKAI_HOME_BASE}/`,
                },
            });

            const $ = cheerio.load(data);
            const items: Array<{
                title: string;
                jname?: string;
                poster?: string;
                type?: string;
                episodes?: number;
                latestEpisode?: number;
                sub?: number;
                dub?: number;
                link: string;
                scraperId: string;
            }> = [];

            $('#latest-updates .aitem').each((_, element) => {
                const item = this.parseLatestUpdateCard($, element);
                if (item) items.push(item);
            });

            return items;
        } catch (error) {
            console.error('AnimeKai latest updates error:', error);
            return [];
        }
    }

    async getNewReleases(page: number = 1, limit: number = 18): Promise<{
        data: Array<{
            title: string;
            jname?: string;
            poster?: string;
            type?: string;
            episodes?: number;
            latestEpisode?: number;
            sub?: number;
            dub?: number;
            link: string;
            scraperId: string;
        }>;
        pagination: {
            current_page: number;
            last_visible_page: number;
            has_next_page: boolean;
        };
    }> {
        try {
            const safePage = Math.max(1, Number(page) || 1);
            const safeLimit = Math.max(1, Number(limit) || 18);
            const { data } = await axios.get(`${ANIMEKAI_HOME_BASE}/new-releases?page=${safePage}`, {
                timeout: 20000,
                proxy: false,
                headers: {
                    'User-Agent': BROWSER_UA,
                    Referer: `${ANIMEKAI_HOME_BASE}/`,
                },
            });

            const $ = cheerio.load(data);
            const parsed: Array<{
                title: string;
                jname?: string;
                poster?: string;
                type?: string;
                episodes?: number;
                latestEpisode?: number;
                sub?: number;
                dub?: number;
                link: string;
                scraperId: string;
            }> = [];

            $('.aitem-wrapper .aitem').each((_, element) => {
                const item = this.parseLatestUpdateCard($, element);
                if (item) parsed.push(item);
            });

            const pageLinks = $('.pagination a.page-link')
                .map((_, element) => {
                    const href = String($(element).attr('href') || '');
                    const match = href.match(/page=(\d+)/i);
                    return match ? Number(match[1]) : null;
                })
                .get()
                .filter((value): value is number => Number.isFinite(value) && value > 0);

            const lastPage = pageLinks.length > 0 ? Math.max(...pageLinks) : safePage;
            const dataSlice = parsed.slice(0, safeLimit);

            return {
                data: dataSlice,
                pagination: {
                    current_page: safePage,
                    last_visible_page: lastPage,
                    has_next_page: safePage < lastPage,
                },
            };
        } catch (error) {
            console.error('AnimeKai new releases error:', error);
            return {
                data: [],
                pagination: {
                    current_page: Math.max(1, Number(page) || 1),
                    last_visible_page: Math.max(1, Number(page) || 1),
                    has_next_page: false,
                },
            };
        }
    }

    async getTopTrending(range: TopTrendingRange): Promise<Array<{
        title: string;
        jname?: string;
        poster?: string;
        type?: string;
        latestEpisode?: number;
        sub?: number;
        dub?: number;
        link: string;
        scraperId: string;
    }>> {
        try {
            const { data } = await axios.get(`${ANIMEKAI_HOME_BASE}/home`, {
                timeout: 20000,
                proxy: false,
                headers: {
                    'User-Agent': BROWSER_UA,
                    Referer: `${ANIMEKAI_HOME_BASE}/`,
                },
            });

            const $ = cheerio.load(data);
            const tabId = range === 'now' ? 'trending' : range;
            const items: Array<{
                title: string;
                jname?: string;
                poster?: string;
                type?: string;
                latestEpisode?: number;
                sub?: number;
                dub?: number;
                link: string;
                scraperId: string;
            }> = [];

            $(`#trending-anime .tab-body[data-id="${tabId}"] > a.aitem`).each((_, element) => {
                const $el = $(element);
                const href = String($el.attr('href') || '').trim();
                const scraperId = href.replace(/^\/watch\//, '').trim();
                const titleEl = $el.find('.detail .title').first();
                const title = String(titleEl.text() || '').trim();
                const jname = String(titleEl.attr('data-jp') || '').trim();
                const poster = this.extractBackgroundImage(String($el.attr('style') || '').trim());
                const infoSpans = $el.find('.detail .info > span');
                const sub = Number(String(infoSpans.filter('.sub').first().text() || '').replace(/\D/g, '')) || 0;
                const dub = Number(String(infoSpans.filter('.dub').first().text() || '').replace(/\D/g, '')) || 0;
                const type = String(infoSpans.last().text() || '').trim() || undefined;

                if (!title || !href || !scraperId) return;

                items.push({
                    title,
                    jname: jname || undefined,
                    poster,
                    type,
                    latestEpisode: Math.max(sub, dub) || undefined,
                    sub: sub || undefined,
                    dub: dub || undefined,
                    link: `${ANIMEKAI_HOME_BASE}${href}`,
                    scraperId,
                });
            });

            return items;
        } catch (error) {
            console.error(`AnimeKai top trending error (${range}):`, error);
            return [];
        }
    }

    private parseEpisodeToken(episodeSession: string) {
        const match = String(episodeSession || '').match(/\$token=([^$]+)/);
        return match?.[1] ? decodeURIComponent(match[1]) : '';
    }

    private async encKai(text: string): Promise<string> {
        const { data } = await axios.get(`${ENC_DEC_BASE}/enc-kai`, {
            params: { text },
            timeout: 15000,
            proxy: false,
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
            proxy: false,
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
            proxy: false,
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
            proxy: false,
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
            proxy: false,
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
            proxy: false,
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
        void query;
        return [];
    }

    async getAnimeInfo(animeSessionId: string): Promise<{
        id: string;
        title: string;
        poster?: string;
        description?: string;
        status?: string;
        episodes?: number;
        type?: string;
        year?: string;
    } | null> {
        try {
            const { data } = await axios.get(`${ANIMEKAI_BASE}/watch/${animeSessionId}`, {
                timeout: 20000,
                proxy: false,
                headers: {
                    'User-Agent': BROWSER_UA,
                    Referer: `${ANIMEKAI_BASE}/`,
                },
            });
            const $ = cheerio.load(data);
            const episodes = Number($('.entity-scroll > .detail').find("div:contains('Episodes') > span").text().trim()) || 0;
            const premiered = $('.entity-scroll > .detail').find("div:contains('Premiered') > span").text().trim();
            const yearMatch = premiered.match(/(\d{4})/);
            return {
                id: animeSessionId,
                title: String($('.entity-scroll > .title').text() || animeSessionId).trim(),
                poster: String($('div.poster > div > img').attr('src') || '').trim() || undefined,
                description: String($('.entity-scroll > .desc').text() || '').trim() || undefined,
                status: String($('.entity-scroll > .detail').find("div:contains('Status') > span").text() || '').trim() || undefined,
                episodes: episodes || undefined,
                type: String($('.entity-scroll > .info').children().last().text() || '').trim().toUpperCase() || undefined,
                year: yearMatch?.[1],
            };
        } catch (error) {
            console.error('AnimeKai getAnimeInfo error:', error);
            return null;
        }
    }

    async getEpisodes(animeSessionId: string): Promise<{ episodes: Episode[]; lastPage: number }> {
        try {
            const { data } = await axios.get(`${ANIMEKAI_BASE}/watch/${animeSessionId}`, {
                timeout: 20000,
                proxy: false,
                headers: {
                    'User-Agent': BROWSER_UA,
                    Referer: `${ANIMEKAI_BASE}/`,
                },
            });
            const $ = cheerio.load(data);
            const aniId = String($('.rate-box#anime-rating').attr('data-id') || '').trim();
            if (!aniId) {
                return { episodes: [], lastPage: 1 };
            }

            const token = await this.encKai(aniId);
            const { data: episodesAjax } = await axios.get(`${ANIMEKAI_BASE}/ajax/episodes/list`, {
                params: { ani_id: aniId, _: token },
                timeout: 20000,
                proxy: false,
                headers: {
                    'User-Agent': BROWSER_UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: `${ANIMEKAI_BASE}/watch/${animeSessionId}`,
                    Accept: 'application/json, text/plain, */*',
                },
            });

            const $$ = cheerio.load(String(episodesAjax?.result || ''));
            const maxSub = Number($('.entity-scroll > .info > span.sub').text().trim()) || 0;
            const maxDub = Number($('.entity-scroll > .info > span.dub').text().trim()) || 0;
            const episodes: Episode[] = [];

            $$('div.eplist > ul > li > a').each((_, el) => {
                const num = Number($$(el).attr('num') || 0);
                const epToken = String($$(el).attr('token') || '').trim();
                if (!num || !epToken) return;

                const href = String($$(el).attr('href') || '').trim();
                episodes.push({
                    id: `${animeSessionId}$ep=${num}$token=${epToken}`,
                    session: `${animeSessionId}$ep=${num}$token=${epToken}`,
                    episodeNumber: num,
                    url: `${ANIMEKAI_BASE}/watch/${animeSessionId}${href}ep=${num}`,
                    title: String($$(el).children('span').text() || `Episode ${num}`).trim(),
                    isSubbed: num <= maxSub,
                    isDubbed: num <= maxDub,
                    isFiller: $$(el).hasClass('filler'),
                });
            });

            return { episodes, lastPage: 1 };
        } catch (error) {
            console.error('AnimeKai getEpisodes error:', error);
            return { episodes: [], lastPage: 1 };
        }
    }

    async getLinks(animeSession: string, episodeSession: string): Promise<StreamLink[]> {
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
