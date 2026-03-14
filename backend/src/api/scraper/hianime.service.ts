import axios from 'axios';
import * as cheerio from 'cheerio';
import { redis } from '../mapping/mapper';
import { anilistService } from '../anilist/anilist.service';

// In-memory cache as fallback when Redis is cold/slow
let inMemorySpotlightCache: any = null;
let isRefreshing = false;
const inMemoryTop10Cache: Record<string, any> = {};
const top10Refreshing: Record<string, boolean> = {};

export class HiAnimeScraper {
    private readonly BASE_URL = 'https://aniwatchtv.to';

    async getSpotlightAnime(): Promise<any[]> {
        try {
            const { data } = await axios.get(`${this.BASE_URL}/home`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.BASE_URL
                },
                timeout: 10000 // 10 seconds timeout
            });

            const $ = cheerio.load(data);
            const spotlight: any[] = [];

            $('#slider .swiper-slide .deslide-item').each((_, element) => {
                const $el = $(element);
                const title = $el.find('.desi-head-title').text().trim();
                const description = $el.find('.desi-description').text().trim();

                // Extract IDs and Links
                const link = $el.find('.desi-buttons a').first().attr('href') || '';
                // link format: /watch/title-id
                const id = link.split('-').pop();

                // Extract Images
                const poster = $el.find('.film-poster-img').attr('data-src') || $el.find('.film-poster-img').attr('src');
                let banner = $el.find('.deslide-cover .film-poster-img').attr('data-src') || $el.find('.deslide-cover .film-poster-img').attr('src');

                // Metadata
                const quality = $el.find('.tick-quality').text().trim();
                const sub = $el.find('.tick-sub').text().trim();
                const dub = $el.find('.tick-dub').text().trim();

                if (title) {
                    spotlight.push({
                        id,
                        title,
                        description,
                        poster,
                        banner,
                        link: this.BASE_URL + link,
                        quality,
                        sub: parseInt(sub) || 0,
                        dub: parseInt(dub) || 0
                    });
                }
            });

            return spotlight;

        } catch (error) {
            console.error('Error scraping HiAnime spotlight:', error);
            return [];
        }
    }

    async getEnrichedSpotlight(): Promise<any> {
        const cacheKey = 'spotlight:hianime:enriched';

        // 1. Try Redis Cache
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                // Update in-memory cache with Redis data
                inMemorySpotlightCache = cached;
                return cached;
            }
        } catch (e) {
            console.error('Redis Error (Get Spotlight):', e);
        }

        // 2. If Redis cache miss, check in-memory cache
        if (inMemorySpotlightCache) {
            console.log('📦 Returning stale spotlight from in-memory cache');

            // Trigger background refresh if not already running
            if (!isRefreshing) {
                console.log('🔄 Triggering background spotlight refresh...');
                this.refreshSpotlightInBackground(cacheKey);
            }

            return inMemorySpotlightCache;
        }

        // 3. No cache available - fetch fresh data (blocking only on first ever request)
        console.log('🐢 No cache available. Fetching fresh spotlight data (this may take a while)...');
        return this.fetchAndCacheSpotlight(cacheKey);
    }

    async getTopTen(range: 'day' | 'week' | 'month'): Promise<any[]> {
        try {
            const { data } = await axios.get(`${this.BASE_URL}/home`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.BASE_URL
                },
                timeout: 10000
            });

            const $ = cheerio.load(data);
            const selector = range === 'week'
                ? '#top-viewed-week'
                : range === 'month'
                    ? '#top-viewed-month'
                    : '#top-viewed-day';

            const items: any[] = [];
            $(`${selector} li`).each((_, element) => {
                const $el = $(element);
                const anchor = $el.find('.film-name a').first();
                const title = anchor.text().trim();
                const jname = (anchor.attr('data-jname') || '').trim();
                const link = anchor.attr('href') || '';
                const scraperId = link.replace(/^\//, '');
                const poster = $el.find('.film-poster-img').attr('data-src') || $el.find('.film-poster-img').attr('src');
                const subText = $el.find('.tick-item.tick-sub').text() || '';
                const dubText = $el.find('.tick-item.tick-dub').text() || '';
                const sub = parseInt(subText.replace(/\D/g, '')) || 0;
                const dub = parseInt(dubText.replace(/\D/g, '')) || 0;
                const dataId = $el.find('.film-poster').attr('data-id') || '';

                if (title) {
                    items.push({
                        title,
                        jname,
                        poster,
                        link: link ? `${this.BASE_URL}${link}` : '',
                        scraperId,
                        dataId,
                        sub,
                        dub
                    });
                }
            });

            return items;
        } catch (error) {
            console.error(`Error scraping HiAnime top 10 (${range}):`, error);
            return [];
        }
    }

    async getEnrichedTopTen(range: 'day' | 'week' | 'month'): Promise<any> {
        const cacheKey = `top10:hianime:${range}:enriched`;

        // 1. Try Redis Cache
        try {
            const cached = await redis.get<any>(cacheKey);
            if (cached && Array.isArray(cached.top10) && cached.top10.length >= 10) {
                inMemoryTop10Cache[range] = cached;
                return cached;
            }
        } catch (e) {
            console.error(`Redis Error (Get Top10 ${range}):`, e);
        }

        // 2. If Redis cache miss, check in-memory cache
        if (inMemoryTop10Cache[range] && Array.isArray(inMemoryTop10Cache[range].top10) && inMemoryTop10Cache[range].top10.length >= 10) {
            if (!top10Refreshing[range]) {
                this.refreshTopTenInBackground(range, cacheKey);
            }
            return inMemoryTop10Cache[range];
        }

        // 3. No cache available - fetch fresh data
        return this.fetchAndCacheTopTen(range, cacheKey);
    }

    private async refreshTopTenInBackground(range: 'day' | 'week' | 'month', cacheKey: string): Promise<void> {
        if (top10Refreshing[range]) return;
        top10Refreshing[range] = true;
        try {
            await this.fetchAndCacheTopTen(range, cacheKey);
        } catch (error) {
            console.error(`Background top10 refresh failed (${range}):`, error);
        } finally {
            top10Refreshing[range] = false;
        }
    }

    private async fetchAndCacheTopTen(range: 'day' | 'week' | 'month', cacheKey: string): Promise<any> {
        const topTenItems = await this.getTopTen(range);

        const enrichmentPromises = topTenItems.map(async (item) => {
            try {
                let searchResult = await anilistService.searchAnime(item.title, 1, 1);
                let anilistMedia = searchResult?.media?.[0];

                if (!anilistMedia && item.jname) {
                    searchResult = await anilistService.searchAnime(item.jname, 1, 1);
                    anilistMedia = searchResult?.media?.[0];
                }

                if (anilistMedia) {
                    return {
                        ...item,
                        id: anilistMedia.id,
                        mal_id: anilistMedia.idMal,
                        anilist: anilistMedia
                    };
                }

                return { ...item, anilist: null };
            } catch (err) {
                console.error(`Failed to enrich top10 item: ${item.title}`, err);
                return { ...item, anilist: null };
            }
        });

        const results = await Promise.allSettled(enrichmentPromises);
        const enrichedItems = results.map((r, idx) => r.status === 'fulfilled' ? r.value : { ...topTenItems[idx], anilist: null });

        const result = { top10: enrichedItems };

        if (enrichedItems.length >= 10) {
            inMemoryTop10Cache[range] = result;
            try {
                await redis.set(cacheKey, result, { ex: 1800 }); // 30 min TTL
            } catch (e) {
                console.error(`Redis Error (Set Top10 ${range}):`, e);
            }
        }

        return result;
    }


    private async refreshSpotlightInBackground(cacheKey: string): Promise<void> {
        if (isRefreshing) return;

        isRefreshing = true;
        try {
            await this.fetchAndCacheSpotlight(cacheKey);
            console.log('✅ Background spotlight refresh complete');
        } catch (error) {
            console.error('❌ Background spotlight refresh failed:', error);
        } finally {
            isRefreshing = false;
        }
    }

    private async fetchAndCacheSpotlight(cacheKey: string): Promise<any> {
        const spotlightItems = await this.getSpotlightAnime();

        // Enrich with AniList data in parallel for faster loading
        // AniList has generous rate limits (~90 requests/minute), so parallel is fine for ~10 items
        const enrichmentPromises = spotlightItems.map(async (item) => {
            try {
                const searchResult = await anilistService.searchAnime(item.title, 1, 1);
                const anilistMedia = searchResult?.media?.[0];

                if (anilistMedia) {
                    return {
                        ...item,
                        id: anilistMedia.id,         // AniList ID
                        mal_id: anilistMedia.idMal,  // MAL ID (used for routing)
                        anilist: anilistMedia        // Full AniList object if needed
                    };
                } else {
                    console.warn(`Could not find AniList match for: ${item.title}`);
                    return null;
                }
            } catch (err) {
                console.error(`Failed to enrich item: ${item.title}`, err);
                return null;
            }
        });

        const results = await Promise.allSettled(enrichmentPromises);
        const enrichedItems = results
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        const result = { spotlight: enrichedItems };

        // Update both caches
        if (enrichedItems.length > 0) {
            // Update in-memory cache immediately
            inMemorySpotlightCache = result;

            // Save to Redis (12 hours = 43200 seconds)
            try {
                await redis.set(cacheKey, result, { ex: 43200 });
                console.log('💾 Spotlight Cache Updated (Redis + In-Memory, 12h TTL)');
            } catch (e) {
                console.error('Redis Error (Set Spotlight):', e);
            }
        }

        return result;
    }

    async getAZList(letter: string, page: number = 1): Promise<any> {
        try {
            // HiAnime A-Z List URL structure: /az-list/{letter}?page={page}
            let path = '';
            if (letter.toLowerCase() === 'all') path = '/az-list';
            else if (['#', '0-9'].includes(letter)) path = '/az-list/other';
            else path = `/az-list/${letter.toUpperCase()}`;

            const url = `${this.BASE_URL}${path}?page=${page}`;
            console.log(`Scraping AZ List: ${url}`);

            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.BASE_URL
                }
            });

            const $ = cheerio.load(data);
            const results: any[] = [];

            // Handle pagination
            let lastPage = 1;
            const paginationLast = $('.pagination .page-item:not(.next) a').last().attr('href');
            if (paginationLast) {
                const match = paginationLast.match(/page=(\d+)/);
                if (match) lastPage = parseInt(match[1]);
            }
            const hasNextPage = !!$('.pagination .page-item.next');

            $('.film_list-wrap .flw-item').each((_, element) => {
                const $el = $(element);
                const title = $el.find('.film-name a').text().trim();
                const link = $el.find('.film-name a').attr('href') || '';
                const id = link.split('?')[0].replace('/', '');

                const poster = $el.find('.film-poster-img').attr('data-src') || $el.find('.film-poster-img').attr('src');
                const type = $el.find('.fdi-item.type').text().trim() || 'TV';

                if (title && id) {
                    results.push({
                        id,
                        title,
                        poster,
                        type,
                        link: this.BASE_URL + link
                    });
                }
            });

            return {
                data: results,
                pagination: {
                    last_visible_page: lastPage,
                    has_next_page: hasNextPage,
                    current_page: page
                }
            };

        } catch (error) {
            console.error(`Error scraping AZ list for ${letter}:`, error);
            return { data: [], pagination: { has_next_page: false, last_visible_page: 1 } };
        }
    }

    async getAnimeInfo(id: string): Promise<any> {
        try {
            // Check for /watch/ prefix or direct slug
            const urlPath = id.startsWith('watch/') ? id : `watch/${id}`;
            const url = `${this.BASE_URL}/${urlPath}`;
            console.log(`Scraping Anime Info: ${url}`);

            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.BASE_URL
                }
            });

            const $ = cheerio.load(data);

            // Extract Details
            const title = $('.anisc-detail .film-name').text().trim();
            const poster = $('.anisc-poster .film-poster-img').attr('data-src') || $('.anisc-poster .film-poster-img').attr('src');
            const description = $('.anisc-detail .film-description .text').text().trim();

            // Stats (Episodes, etc)
            const stats: any = {};
            $('.film-stats .item').each((_, el) => {
                const text = $(el).text();
                if (text.includes('Sub')) stats.sub = parseInt(text.replace(/\D/g, ''));
                if (text.includes('Dub')) stats.dub = parseInt(text.replace(/\D/g, ''));
                if (text.includes('Ep')) stats.episodes = { sub: stats.sub || 0, dub: stats.dub || 0 }; // Approx
            });

            // Status
            // Usually in .anisc-info .item-title:contains("Status") + .name
            const status = $('.anisc-info .item-title:contains("Status")').next().text().trim();

            return {
                id,
                title,
                poster,
                description,
                status,
                stats
            };
        } catch (error) {
            console.error(`Error scraping info for ${id}:`, error);
            return null;
        }
    }
}
