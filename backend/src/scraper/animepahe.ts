
import { Browser, Page } from 'puppeteer-core';
import { getBrowserInstance } from '../utils/browser';
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://animepahe.si';
const API_URL = 'https://animepahe.si/api';

export interface AnimeSearchResult {
    id: string;
    title: string;
    url: string;
    poster?: string;
    status?: string;
    type?: string;
    episodes?: number;
    year?: string;
    score?: string;
    session: string; // Unified ID
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
}

export interface StreamLink {
    quality: string;
    audio: string;
    provider?: string;
    server?: string;
    url: string; // The original embed URL
    directUrl?: string; // The resolved .m3u8 URL
    isHls: boolean;
}

export interface AnimeInfo {
    title: string;
    poster?: string;
    description?: string;
    status?: string;
    type?: string;
    episodes?: number | null;
    year?: number | null;
}

export class AnimePaheScraper {
    private browser: Browser | null = null;
    private readonly requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': BASE_URL,
    };

    private async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await getBrowserInstance();
        }
        return this.browser;
    }

    private async fetchApiJson(url: string): Promise<any | null> {
        try {
            const response = await axios.get(url, {
                headers: this.requestHeaders,
                timeout: 10000,
                responseType: 'json',
            });
            return response.data ?? null;
        } catch (error) {
            return null;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async search(query: string): Promise<AnimeSearchResult[]> {
        const searchUrl = `${API_URL}?m=search&q=${encodeURIComponent(query)}`;

        // Fast path: direct API call via axios (no browser spin-up)
        const apiResponse = await this.fetchApiJson(searchUrl);
        if (apiResponse && Array.isArray(apiResponse.data)) {
            return apiResponse.data.map((item: any) => ({
                id: item.id,
                session: item.session,
                title: item.title,
                url: `/anime/${item.session}`,
                poster: item.poster,
                status: item.status,
                type: item.type,
                episodes: item.episodes,
                year: item.year,
                score: item.score
            }));
        }

        // Fallback: Puppeteer path for protected responses
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setUserAgent(this.requestHeaders['User-Agent']);

        try {
            console.log(`Searching: ${searchUrl}`);

            // Go directly to search URL
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Wait for potential DDoS guard to resolve
            // We check if the body looks like JSON (starts with {)
            try {
                await page.waitForFunction(
                    () => document.body.innerText.trim().startsWith('{'),
                    { timeout: 8000 } // Give it 8s max to resolve
                );
            } catch (e) {
                console.log('Timeout waiting for JSON expectation, trying to parse anyway...');
            }

            const responseText = await page.evaluate(() => document.body.innerText);

            let response: any;
            try {
                response = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse search JSON:", responseText);
                return [];
            }

            console.log("Search Response:", JSON.stringify(response));

            if (response && response.data) {
                return response.data.map((item: any) => ({
                    id: item.id,
                    session: item.session,
                    title: item.title,
                    url: `/anime/${item.session}`,
                    poster: item.poster,
                    status: item.status,
                    type: item.type,
                    episodes: item.episodes,
                    year: item.year,
                    score: item.score
                }));
            }
            return [];
        } catch (error) {
            console.error('Error during search:', error);
            return [];
        } finally {
            await page.close();
        }
    }

    private parseAnimeInfoFromHtml(html: string): AnimeInfo | null {
        const $ = cheerio.load(String(html || ''));
        const rawTitle =
            $('div.title-wrapper h1').first().text().trim() ||
            $('h1').first().text().trim() ||
            $('meta[property="og:title"]').attr('content')?.trim() ||
            $('title').text().replace(/\s*-\s*AnimePahe.*$/i, '').trim();
        const title =
            rawTitle && rawTitle.length % 2 === 0 && rawTitle.slice(0, rawTitle.length / 2) === rawTitle.slice(rawTitle.length / 2)
                ? rawTitle.slice(0, rawTitle.length / 2).trim()
                : rawTitle;

        if (!title) return null;

        const description =
            $('meta[property="og:description"]').attr('content')?.trim() ||
            $('.anime-synopsis').first().text().trim() ||
            $('div.anime-synopsis').first().text().trim() ||
            undefined;

        const poster =
            $('meta[property="og:image"]').attr('content')?.trim() ||
            $('img').filter((_, el) => String($(el).attr('src') || '').includes('/posters/')).first().attr('src')?.trim() ||
            undefined;

        const statsText = $('body').text();
        const episodesMatch = statsText.match(/Episodes:\s*(\d+)/i);
        const yearMatch = statsText.match(/Season:\s*[A-Za-z]+\s+(\d{4})/i) || statsText.match(/Aired:\s*.*?(\d{4})/i);
        const statusMatch = statsText.match(/Status:\s*([A-Za-z ]+)/i);
        const typeMatch = statsText.match(/Type:\s*([A-Za-z]+)/i);

        return {
            title,
            poster,
            description,
            status: statusMatch?.[1]?.trim(),
            type: typeMatch?.[1]?.trim(),
            episodes: episodesMatch?.[1] ? Number(episodesMatch[1]) : null,
            year: yearMatch?.[1] ? Number(yearMatch[1]) : null,
        };
    }

    async getAnimeInfo(session: string): Promise<AnimeInfo | null> {
        const animeUrl = `${BASE_URL}/anime/${session}`;

        try {
            const response = await axios.get(animeUrl, {
                headers: {
                    ...this.requestHeaders,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                },
                timeout: 15000,
                responseType: 'text',
            });

            const html = String(response.data || '');
            return this.parseAnimeInfoFromHtml(html);
        } catch (error) {
            const browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setUserAgent(this.requestHeaders['User-Agent']);

            try {
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    const resourceType = req.resourceType();
                    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });

                await page.goto(animeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                try {
                    await page.waitForFunction(
                        () => !/checking your browser/i.test(document.title) && !/ddos-guard/i.test(document.body.innerText),
                        { timeout: 12000 }
                    );
                } catch {
                    await new Promise((resolve) => setTimeout(resolve, 8000));
                }
                const html = await page.content();
                return this.parseAnimeInfoFromHtml(html);
            } catch (fallbackError) {
                console.error('Error getting AnimePahe info:', fallbackError);
                return null;
            } finally {
                await page.close();
            }
        }
    }

    async getEpisodes(animeSessionId: string, pageNum: number = 1): Promise<{ episodes: Episode[], lastPage: number }> {
        const htmlFirst = await this.getEpisodesFromHtml(null as any, animeSessionId);
        if (htmlFirst.episodes.length > 0) {
            return htmlFirst;
        }

        const apiUrl = `${API_URL}?m=release&id=${animeSessionId}&sort=episode_asc&page=${pageNum}`;

        // Fast path: direct API call via axios (no browser spin-up)
        const apiResponse = await this.fetchApiJson(apiUrl);
        if (apiResponse && Array.isArray(apiResponse.data)) {
            const episodes: Episode[] = apiResponse.data.map((item: any) => ({
                id: item.id.toString(),
                session: item.session,
                episodeNumber: item.episode,
                url: `/play/${animeSessionId}/${item.session}`,
                title: item.title,
                duration: item.duration,
                snapshot: item.snapshot
            }));

            return {
                episodes,
                lastPage: apiResponse.last_page || 1
            };
        }

        // Fallback: Puppeteer path for protected responses
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setUserAgent(this.requestHeaders['User-Agent']);

        try {
            console.log(`Fetching episodes: ${apiUrl}`);

            // Optimize: Block heavy resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Direct navigation
            await page.goto(apiUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Wait for JSON body
            try {
                await page.waitForFunction(
                    () => document.body.innerText.trim().startsWith('{'),
                    { timeout: 8000 }
                );
            } catch (e) {
                console.log('Timeout waiting for JSON in getEpisodes, parsing anyway...');
            }

            const responseText = await page.evaluate(() => document.body.innerText);

            let response: any;
            try {
                response = JSON.parse(responseText);
            } catch (e) {
                console.warn("Failed to parse episodes JSON, falling back to HTML page scrape");
                return await this.getEpisodesFromHtml(page, animeSessionId);
            }

            if (response && response.data) {
                const episodes: Episode[] = response.data.map((item: any) => ({
                    id: item.id.toString(),
                    session: item.session,
                    episodeNumber: item.episode,
                    url: `/play/${animeSessionId}/${item.session}`,
                    title: item.title,
                    duration: item.duration,
                    snapshot: item.snapshot
                }));

                return {
                    episodes,
                    lastPage: response.last_page
                };
            }

            return { episodes: [], lastPage: 1 };
        } catch (error) {
            console.error('Error getting episodes:', error);
            return { episodes: [], lastPage: 1 };
        } finally {
            await page.close();
        }
    }

    private async getEpisodesFromHtml(_page: Page | null, animeSessionId: string): Promise<{ episodes: Episode[], lastPage: number }> {
        const animeUrl = `${BASE_URL}/anime/${animeSessionId}`;
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setUserAgent(this.requestHeaders['User-Agent']);
        try {
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.goto(animeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise((resolve) => setTimeout(resolve, 10000));
            const html = await page.content();
            const $ = cheerio.load(html);
            const episodes: Episode[] = [];

            $('a.play').each((_, element) => {
                const href = String($(element).attr('href') || '').trim();
                if (!href.startsWith('/play/')) return;

                const title = $(element).text().trim().replace(/^Watch\s*-\s*/i, '').replace(/\s+Online$/i, '').trim();
                const parts = href.split('/').filter(Boolean);
                const episodeSession = parts[parts.length - 1];
                const animeSession = parts[parts.length - 2];
                if (!episodeSession || !animeSession) return;

                const epMatch = title.match(/(\d+(?:\.\d+)?)/);
                const episodeNumber = epMatch ? Number(epMatch[1]) : NaN;
                if (!Number.isFinite(episodeNumber)) return;

                episodes.push({
                    id: episodeSession,
                    session: episodeSession,
                    episodeNumber,
                    url: href,
                    title: `Episode ${episodeNumber}`,
                });
            });

            episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
            return { episodes, lastPage: 1 };
        } catch (error) {
            console.error('Error getting AnimePahe episodes from HTML:', error);
            return { episodes: [], lastPage: 1 };
        } finally {
            await page.close();
        }
    }

    async getLinks(animeSession: string, episodeSession: string): Promise<StreamLink[]> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setUserAgent(this.requestHeaders['User-Agent']);

        const fullUrl = `${BASE_URL}/play/${animeSession}/${episodeSession}`;

        try {
            await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

            // Wait for buttons to load
            await page.waitForSelector('#resolutionMenu button', { timeout: 10000 });

            // Extract Kwik links
            const buttons = await page.$$('#resolutionMenu button');
            const links: { kwik: string, quality: string, audio: string }[] = [];

            for (const btn of buttons) {
                const kwik = await btn.evaluate(el => el.getAttribute('data-src'));
                const quality = await btn.evaluate(el => el.getAttribute('data-resolution'));
                const audio = await btn.evaluate(el => el.getAttribute('data-audio'));
                if (kwik) links.push({ kwik, quality: quality || '', audio: audio || '' });
            }

            // Resolve links lazily: iframe playback only needs kwik URL, so avoid
            // expensive per-quality deep-resolution for much faster startup.
            return links.map((link) => ({
                quality: link.quality,
                audio: link.audio,
                url: link.kwik,
                isHls: false
            }));

        } catch (error) {
            console.error('Error getting links:', error);
            return [];
        } finally {
            await page.close();
        }
    }

    private async resolveKwik(url: string): Promise<string | null> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // Kwik needs referer
        await page.setExtraHTTPHeaders({
            'referer': 'https://kwik.cx/',
            'origin': 'https://kwik.cx'
        });

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });

            // The direct link is usually inside a packed script.
            // We can wait for the page to evaluate it or extract and solve.
            // Let's try to find potential source from content first.
            const content = await page.content();

            // Logic to handle kwik's eval(p,a,c,k,e,d)
            // Or just wait for the video tag to appear?
            // Usually kwik loads a script that then creates the video/source.

            const directUrl = await page.evaluate(() => {
                // Try to find the script and execute a modified version to get the URL?
                // Actually, kwik's script usually sets a variable or just creates the player.
                // Let's try to extract it from the source code directly using regex if it's there.
                const scripts = Array.from(document.querySelectorAll('script'));
                for (const script of scripts) {
                    const text = script.textContent || '';
                    if (text.includes('eval(function(p,a,c,k,e,d)')) {
                        // This is the one. We could try to decode it, 
                        // but maybe it's already in a variable after execution?
                        // Let's check common variables.
                    }
                }

                // Often kwik has a "source" variable or similar in the window
                return (window as any).source || (document.querySelector('source') as any)?.src || null;
            });

            if (directUrl) return directUrl;

            // If not found, use regex on the content
            const packedMatch = content.match(/eval\(function\(p,a,c,k,e,d\)\{.*\}\(.*\)\)/);
            if (packedMatch) {
                // We can't easily unpack in Node without a library, but we can try to evaluate it in the browser!
                const solved = await page.evaluate((packed) => {
                    try {
                        // Override eval to capture the result
                        let result = '';
                        const originalEval = window.eval;
                        (window as any).eval = (s: string) => { result = s; return originalEval(s); };
                        originalEval(packed);
                        (window as any).eval = originalEval;
                        return result;
                    } catch (e) {
                        return null;
                    }
                }, packedMatch[0]);

                if (solved) {
                    const urlMatch = solved.match(/source=['"](.*?)['"]/);
                    if (urlMatch) return urlMatch[1];
                }
            }

            return null;
        } catch (e) {
            return null;
        } finally {
            await page.close();
        }
    }
}
