import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://mangakatana.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const axiosInstance = axios.create({
    baseURL: BASE_URL,
    headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': BASE_URL,
    },
    timeout: 15000,
});

const toAbsoluteUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const normalizeMangaId = (input: string): string => {
    let value = String(input || '').trim();
    if (!value) return '';

    if (value.startsWith('mk:')) value = value.slice(3);

    // Handle full URLs (absolute or embedded)
    if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
            const u = new URL(value);
            value = u.pathname;
        } catch {
            // fall through
        }
    }

    // Handle values that include /manga/<id>
    const marker = '/manga/';
    const markerIdx = value.indexOf(marker);
    if (markerIdx !== -1) {
        value = value.slice(markerIdx + marker.length);
    }

    // Trim leading/trailing slashes and query/hash
    value = value.replace(/^\/+|\/+$/g, '');
    value = value.split('?')[0].split('#')[0];

    // If a chapter URL slipped in, keep only manga ID.
    // Example: one-piece.123/c1042  -> one-piece.123
    value = value.split('/')[0];

    return value;
};

const normalizeSearchText = (input: string): string =>
    String(input || '')
        .replace(/['\u2019]s\b/gi, '')
        .replace(/['"\u2019\u2018`]/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const buildSearchQueries = (query: string): string[] => {
    const original = String(query || '').trim();
    const normalized = normalizeSearchText(original);
    const keywordCandidates = normalized
        .split(/\s+/)
        .filter((word) => word.length >= 4)
        .filter((word, index, array) => array.indexOf(word) === index);

    const focusedKeywords = [
        keywordCandidates[0],
        keywordCandidates.find((word) => /san|chan|kun|sama/i.test(word)),
        [...keywordCandidates].sort((a, b) => b.length - a.length)[0],
    ].filter(Boolean) as string[];

    return [...new Set([
        original,
        normalized,
        ...focusedKeywords,
    ].filter((value) => String(value || '').trim().length > 0))];
};

const parseMangaItemsFromList = ($: any): MangaSearchResult[] => {
    const results: MangaSearchResult[] = [];
    $('#book_list .item, .item').each((_: number, element: any) => {
        const $el = $(element);
        const linkEl = $el.find('h3.title a, div.text > h3 > a, .title a').first();
        const title = linkEl.text().trim();
        const url = linkEl.attr('href') || '';
        if (!title || !url.includes('/manga/')) return;

        const imgEl = $el.find('.media .wrap_img img, div.cover img, img');
        const thumbnail = toAbsoluteUrl(imgEl.attr('data-src') || imgEl.attr('src') || '');

        const chapters = $el.find('div.text .chapter a, .chapter a');
        let latestChapter = '';
        if (chapters.length > 0) {
            latestChapter = chapters.first().text().trim();
        }

        const id = url.replace(`${BASE_URL}/manga/`, '').replace(/\/$/, '');
        if (id && !results.some((item) => item.id === id)) {
            results.push({
                id,
                title,
                url,
                thumbnail,
                latestChapter,
                author: '',
                altNames: [],
                source: 'mangakatana'
            });
        }
    });
    return results;
};

export interface HotUpdate {
    id: string;
    title: string;
    chapter: string;
    url: string;
    thumbnail: string;
    source: 'mangakatana';
}

export interface MangaSearchResult {
    id: string;
    title: string;
    url: string;
    thumbnail: string;
    latestChapter?: string;
    author?: string; // New field for matching
    altNames?: string[]; // New field for matching
    source: 'mangakatana';
}

export interface MangaDetails {
    id: string;
    title: string;
    altNames: string[];
    author: string;
    status: string;
    genres: string[];
    synopsis: string;
    coverImage: string;
    url: string;
    source: 'mangakatana';
}

export interface Chapter {
    id: string;
    title: string;
    url: string;
    uploadDate: string;
}

export interface ChapterPage {
    pageNumber: number;
    imageUrl: string;
}

/**
 * Search for manga on MangaKatana
 * Uses Puppeteer to bypass bot protection
 */
export async function searchManga(query: string): Promise<MangaSearchResult[]> {
    const searchQueries = buildSearchQueries(query);
    const searchModes = ['m_name', 'book_name'];

    for (const searchQuery of searchQueries) {
        for (const mode of searchModes) {
            const searchUrl = `${BASE_URL}/?search=${encodeURIComponent(searchQuery)}&search_by=${mode}`;
            const response = await axiosInstance.get(searchUrl);
            const $ = cheerio.load(response.data);
            const quickResults = parseMangaItemsFromList($);
            if (quickResults.length > 0) {
                console.log(`[searchManga:http] Found ${quickResults.length} results for "${query}" via "${searchQuery}" (${mode})`);
                return quickResults;
            }
        }
    }

    console.log(`[searchManga:http] Found 0 results for "${query}"`);
    return [];
}

/**
 * Generic helper to fetch manga list from a specific path (e.g. /latest, /new-manga)
 */
async function getMangaListByPath(path: string, pageNum: number = 1): Promise<{ results: MangaSearchResult[], totalPages: number }> {
    const url = pageNum > 1 ? `${BASE_URL}${path}/page/${pageNum}` : `${BASE_URL}${path}`;

    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);
    const results = parseMangaItemsFromList($);

    let totalPages = 1;
    const lastPageEl = $('a.page-numbers:not(.next)').last();
    if (lastPageEl.length > 0) {
        const numText = lastPageEl.text().replace(/,/g, '').trim();
        const parsedNum = parseInt(numText, 10);
        if (!isNaN(parsedNum)) totalPages = parsedNum;
    }

    return { results, totalPages };
}

export async function getLatestManga(page: number = 1): Promise<{ results: MangaSearchResult[], totalPages: number }> {
    return getMangaListByPath('/latest', page);
}

export async function getNewManga(page: number = 1): Promise<{ results: MangaSearchResult[], totalPages: number }> {
    return getMangaListByPath('/new-manga', page);
}

export async function getMangaDirectory(page: number = 1): Promise<{ results: MangaSearchResult[], totalPages: number }> {
    return getMangaListByPath('/manga', page);
}

/**
 * Get manga details from MangaKatana
 */
export async function getMangaDetails(mangaId: string): Promise<MangaDetails> {
    try {
        const normalizedId = normalizeMangaId(mangaId);
        const url = `${BASE_URL}/manga/${normalizedId}`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);

        const title = $('h1.heading').text().trim();
        const altNames = $('.alt_name').text().split(';').map(s => s.trim()).filter(Boolean);
        const author = $('.author').text().trim();
        const status = $('.value.status').text().trim();
        const genres = $('.genres > a').map((_, el) => $(el).text().trim()).get();
        const synopsis = $('.summary > p').text().trim();
        const coverImage = toAbsoluteUrl(
            $('meta[property="og:image"]').attr('content')
            || $('.cover img').first().attr('data-src')
            || $('.cover img').first().attr('src')
            || $('div.media div.cover img').first().attr('data-src')
            || $('div.media div.cover img').first().attr('src')
            || $('.media .wrap_img img').first().attr('data-src')
            || $('.media .wrap_img img').first().attr('src')
            || ''
        );

        return {
            id: normalizedId,
            title,
            altNames,
            author,
            status,
            genres,
            synopsis,
            coverImage,
            url,
            source: 'mangakatana',
        };
    } catch (error) {
        console.error('Error fetching manga details:', error);
        throw error;
    }
}

/**
 * Get chapter list for a manga
 * Uses Puppeteer to bypass bot protection (same as getHotUpdates)
 */
export async function getChapterList(mangaId: string): Promise<Chapter[]> {
    const parseFromHtml = (html: string) => {
        const $ = cheerio.load(html);
        const chapters: Chapter[] = [];
        $('tr:has(.chapter)').each((_, element) => {
            const $el = $(element);
            const linkEl = $el.find('.chapter a');
            const chapterTitle = linkEl.text().trim();
            const rawChapterUrl = linkEl.attr('href') || '';
            const chapterUrl = rawChapterUrl.startsWith('http')
                ? rawChapterUrl
                : `${BASE_URL}${rawChapterUrl.startsWith('/') ? '' : '/'}${rawChapterUrl}`;
            const uploadDate = $el.find('.update_time').text().trim();
            const chapterId = chapterUrl.replace(/\/$/, '').split('/').pop() || '';
            if (chapterTitle && chapterUrl) {
                chapters.push({
                    id: chapterId,
                    title: chapterTitle,
                    url: chapterUrl,
                    uploadDate,
                });
            }
        });
        return chapters;
    };

    const normalizedId = normalizeMangaId(mangaId);
    const url = `${BASE_URL}/manga/${normalizedId}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const response = await axiosInstance.get(attempt === 0 ? url : `${url}?t=${Date.now()}`);
            const chapters = parseFromHtml(response.data);
            if (chapters.length > 0) {
                console.log(`[getChapterList:http] Found ${chapters.length} chapters (attempt ${attempt + 1})`);
                return chapters;
            }
        } catch (error) {
            if (attempt === 1) {
                console.error('[getChapterList:http] Error fetching chapter list:', error);
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return [];
}

/**
 * Get page images for a chapter
 * First tries fast regex extraction, falls back to Puppeteer if needed
 */
export async function getChapterPages(chapterUrl: string): Promise<ChapterPage[]> {
    const normalizedChapterUrl = chapterUrl.startsWith('http')
        ? chapterUrl
        : `${BASE_URL}${chapterUrl.startsWith('/') ? '' : '/'}${chapterUrl}`;

    // First try fast regex extraction (no browser needed)
    try {
        console.log(`[Fast] Fetching ${normalizedChapterUrl}...`);
        // Use direct axios call like the working test script to avoid instance issues
        const response = await axios.get(normalizedChapterUrl, {
            headers: {
                'User-Agent': USER_AGENT
            },
            timeout: 15000
        });
        const html = response.data;

        // Look for JavaScript array containing image URLs
        // MangaKatana stores images in variables like: var thzq = ['url1', 'url2', ...]
        // The array can span multiple lines and contain many URLs

        // First, try to find common variable names with their full array content
        const varNames = ['thzq', 'ytaw', 'htnc'];
        for (const varName of varNames) {
            const pattern = new RegExp(`var\\s+${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
            const match = html.match(pattern);
            if (match && match[1]) {
                // Extract all URLs from the array content
                const arrayContent = match[1];
                const urlPattern = /['"]([^'"]+)['"]/g;
                const urls: string[] = [];
                let urlMatch;
                while ((urlMatch = urlPattern.exec(arrayContent)) !== null) {
                    const url = urlMatch[1];
                    if (url.includes('http') || url.startsWith('//')) {
                        urls.push(url.startsWith('//') ? `https:${url}` : url);
                    }
                }
                if (urls.length > 0) {
                    console.log(`[Fast] Found ${urls.length} pages via regex (${varName})`);
                    return urls.map((url, index) => ({
                        pageNumber: index + 1,
                        imageUrl: url
                    }));
                }
            }
        }

        // Try finding data-src in img tags
        const $ = cheerio.load(html);
        const imgs: string[] = [];
        $('#imgs img').each((_, el) => {
            const src = $(el).attr('data-src') || $(el).attr('src');
            if (src && (src.includes('http') || src.startsWith('//'))) {
                imgs.push(src.startsWith('//') ? `https:${src}` : src);
            }
        });

        if (imgs.length > 0) {
            console.log(`[Fast] Found ${imgs.length} pages via cheerio`);
            return imgs.map((url, index) => ({
                pageNumber: index + 1,
                imageUrl: url
            }));
        }

        console.log('[Fast] No images found, falling back to Puppeteer...');
    } catch (fastError) {
        console.log('[Fast] Failed, falling back to Puppeteer...', fastError);
    }

    // HTTP-only mode (no Puppeteer fallback)
    console.log('[getChapterPages:http] No pages found via HTML parse');
    return [];
}

/**
 * Get hot updates from MangaKatana homepage
 * Uses Puppeteer to bypass bot protection
 */
export async function getHotUpdates(): Promise<HotUpdate[]> {
    try {
        const response = await axiosInstance.get(BASE_URL);
        const $ = cheerio.load(response.data);
        const updates: HotUpdate[] = [];

        let container = $('#hot_update');
        if (container.length === 0) {
            container = $('.widget-hot-update');
        }

        container.find('.item').each((_, element) => {
            const $el = $(element);
            const imgEl = $el.find('.wrap_img img');
            const thumbnail = imgEl.attr('data-src') || imgEl.attr('src') || '';
            const titleEl = $el.find('.title a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href') || '';
            if (['hentai', 'adult', 'smut'].some(term => title.toLowerCase().includes(term))) return;
            const chapterEl = $el.find('.chapter a');
            const chapter = chapterEl.first().text().trim();
            if (title && url) {
                const id = url.split('/manga/')[1]?.replace(/\/$/, '') || '';
                updates.push({
                    id,
                    title,
                    chapter,
                    url,
                    thumbnail,
                    source: 'mangakatana'
                });
            }
        });

        return updates.slice(0, 15);
    } catch (error) {
        console.error('Error fetching hot updates:', error);
        return [];
    }
}
