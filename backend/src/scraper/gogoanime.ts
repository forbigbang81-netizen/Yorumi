import { getBrowserInstance } from '../utils/browser';
import * as cheerio from 'cheerio';
import { StreamLink } from './animepahe';
import axios from 'axios';

interface Episode {
    id: string;
    session: string;
    episodeNumber: number;
    url: string;
    title: string;
}

export class GogoanimeScraper {
    private readonly BASE_URL = 'https://anitaku.io';
    private readonly requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://anitaku.io/',
    };

    private normalizePath(input: string): string {
        const value = String(input || '').trim();
        if (!value) return '';
        if (/^https?:\/\//i.test(value)) {
            try {
                const parsed = new URL(value);
                return parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
            } catch {
                return value.replace(this.BASE_URL, '').replace(/^\/+/, '').replace(/\/+$/, '');
            }
        }
        return value.replace(/^\/+/, '').replace(/\/+$/, '');
    }

    private toAbsoluteUrl(input: string): string {
        const trimmed = String(input || '').trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if (trimmed.startsWith('//')) return `https:${trimmed}`;
        if (trimmed.startsWith('/')) return `${this.BASE_URL}${trimmed}`;
        return `${this.BASE_URL}/${trimmed}`;
    }

    private async fetchHtml(url: string): Promise<string> {
        const response = await axios.get(url, {
            headers: this.requestHeaders,
            timeout: 20000,
            maxRedirects: 5,
            responseType: 'text',
        });
        return String(response.data || '');
    }

    private parseSearchResults(html: string): any[] {
        const $ = cheerio.load(html);
        const results: any[] = [];

        $('.listupd .bsx').each((_, el) => {
            const $link = $(el).find('a').first();
            const href = this.toAbsoluteUrl($link.attr('href') || '');
            const title = $link.attr('title') || $(el).find('.tt').text().trim();
            const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
            if (!href || !title) return;

            const id = this.normalizePath(href);
            results.push({
                id,
                session: id,
                title,
                url: href,
                image,
            });
        });

        if (results.length > 0) return results;

        $('.last_episodes ul.items li').each((_, el) => {
            const href = this.toAbsoluteUrl($(el).find('p.name a').attr('href') || '');
            const title = $(el).find('p.name a').text().trim();
            const image = $(el).find('.img a img').attr('src') || $(el).find('.img a img').attr('data-src');
            if (!href || !title) return;

            const id = this.normalizePath(href);
            results.push({
                id,
                session: id,
                title,
                url: href,
                image,
            });
        });

        return results;
    }

    private parseEpisodesFromHtml(html: string): Episode[] {
        const $ = cheerio.load(html);
        const episodes: Episode[] = [];

        $('.eplister li a, .eplister a').each((_, el) => {
            const $el = $(el);
            const href = this.toAbsoluteUrl($el.attr('href') || '');
            if (!href) return;

            const epNumText =
                $el.find('.epl-num').text().trim() ||
                $el.clone().children().remove().end().text().trim();
            const episodeNumber = parseFloat((epNumText.match(/\d+(?:\.\d+)?/) || [])[0] || '');
            if (!Number.isFinite(episodeNumber)) return;

            const title =
                $el.find('.epl-title').text().trim() ||
                $el.text().replace(/\s+/g, ' ').trim() ||
                `Episode ${episodeNumber}`;

            const session = this.normalizePath(href);
            episodes.push({
                id: session,
                session,
                episodeNumber,
                url: href,
                title,
            });
        });

        const deduped = new Map<string, Episode>();
        episodes.forEach((episode) => {
            if (!deduped.has(episode.session)) {
                deduped.set(episode.session, episode);
            }
        });

        return [...deduped.values()].sort((a, b) => a.episodeNumber - b.episodeNumber);
    }

    private extractEmbedUrls(html: string): string[] {
        const $ = cheerio.load(html);
        const urls = new Set<string>();

        const directIframe = $('#pembed iframe').attr('src') || $('iframe').first().attr('src');
        if (directIframe) {
            urls.add(this.toAbsoluteUrl(directIframe));
        }

        $('.mirror option').each((_, el) => {
            const value = String($(el).attr('value') || '').trim();
            if (!value) return;
            try {
                const decoded = Buffer.from(value, 'base64').toString('utf8');
                const match = decoded.match(/src=["']([^"']+)["']/i);
                if (match?.[1]) {
                    urls.add(this.toAbsoluteUrl(match[1]));
                }
            } catch {
                // Ignore malformed mirror payloads.
            }
        });

        return [...urls];
    }

    private async resolveEmbedToStream(embedUrl: string): Promise<StreamLink | null> {
        const browser = await getBrowserInstance();
        const page = await browser.newPage();
        const candidates = new Set<string>();
        let pageLooksBroken = false;

        try {
            await page.setUserAgent(this.requestHeaders['User-Agent']);
            await page.setExtraHTTPHeaders({ Referer: `${this.BASE_URL}/` });

            page.on('request', (req) => {
                const url = req.url();
                if (/\.m3u8($|\?)/i.test(url) || /videoplayback/i.test(url) || /\.mp4($|\?)/i.test(url)) {
                    candidates.add(url);
                }
            });
            page.on('response', (res) => {
                const url = res.url();
                const contentType = String(res.headers()['content-type'] || '');
                if (
                    /\.m3u8($|\?)/i.test(url) ||
                    /\.mp4($|\?)/i.test(url) ||
                    contentType.includes('mpegurl') ||
                    contentType.startsWith('video/')
                ) {
                    candidates.add(url);
                }
            });

            await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 45000 });
            await new Promise((resolve) => setTimeout(resolve, 3500));

            const pageState = await page.evaluate(() => {
                const video = document.querySelector('video');
                const source = document.querySelector('video source');
                return {
                    title: document.title || '',
                    text: document.body?.innerText?.slice(0, 1200) || '',
                    mediaSrc:
                        (video as HTMLVideoElement | null)?.currentSrc ||
                        (video as HTMLVideoElement | null)?.src ||
                        (source as HTMLSourceElement | null)?.src ||
                        null,
                };
            });

            pageLooksBroken =
                /error\s*-\s*megaplay/i.test(pageState.title) ||
                /error code:\s*410/i.test(pageState.text) ||
                /can['’]t find the file you are looking for/i.test(pageState.text);

            if (pageState.mediaSrc) {
                candidates.add(pageState.mediaSrc);
            }
        } catch (error) {
            console.warn('Failed to resolve embed stream:', embedUrl, error);
        } finally {
            await page.close();
        }

        if (pageLooksBroken) {
            return null;
        }

        const directUrl = [...candidates].find((url) => /\.m3u8($|\?)/i.test(url));
        if (directUrl) {
            return {
                url: `/api/scraper/proxy?url=${encodeURIComponent(directUrl)}&referer=${encodeURIComponent(embedUrl)}`,
                directUrl,
                quality: 'auto',
                audio: 'sub',
                provider: 'hls',
                isHls: true,
            };
        }

        const fallbackVideo = [...candidates].find((url) => /videoplayback|\.mp4($|\?)/i.test(url));
        if (fallbackVideo) {
            return {
                url: fallbackVideo,
                directUrl: fallbackVideo,
                quality: 'auto',
                audio: 'sub',
                provider: 'direct',
                isHls: false,
            };
        }

        return null;
    }

    async search(query: string): Promise<any[]> {
        try {
            const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}`;
            console.log('Searching Gogoanime (Themesia):', searchUrl);
            const html = await this.fetchHtml(searchUrl);
            const results = this.parseSearchResults(html);
            console.log(`Found ${results.length} results for: ${query}`);
            return results;
        } catch (e) {
            console.error('Gogoanime search error:', e);
            return [];
        }
    }

    async getEpisodes(session: string): Promise<{ episodes: Episode[], lastPage: number }> {
        try {
            const normalized = this.normalizePath(session);
            const url = this.toAbsoluteUrl(normalized.startsWith('series/') ? normalized : `series/${normalized}`);
            console.log('Fetching episodes from:', url);
            const html = await this.fetchHtml(url);
            const episodes = this.parseEpisodesFromHtml(html);

            console.log(`Extracted ${episodes.length} episodes for session: ${session}`);
            return { episodes, lastPage: 1 };
        } catch (e) {
            console.error('Gogoanime getEpisodes error:', e);
            return { episodes: [], lastPage: 1 };
        }
    }

    async getLinks(animeSession: string, episodeSession: string): Promise<StreamLink[]> {
        try {
            const epUrl = this.toAbsoluteUrl(episodeSession);
            console.log('Navigating to episode page:', epUrl);
            const html = await this.fetchHtml(epUrl);
            const embeds = this.extractEmbedUrls(html);

            for (const embedUrl of embeds) {
                const resolved = await this.resolveEmbedToStream(embedUrl);
                if (resolved) {
                    return [resolved];
                }
            }

            console.error('Failed to extract any embed or HLS stream for episode:', episodeSession, animeSession);
            return [];
        } catch (e) {
            console.error('Gogoanime getLinks error:', e);
            return [];
        }
    }
}
