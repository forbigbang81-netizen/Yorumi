import { animeService } from '../../services/animeService';
import { mangaService } from '../../services/mangaService';
import type { TitleLanguage } from '../../context/TitleLanguageContext';
import { getDisplayTitle, getSecondaryTitle } from '../../utils/titleLanguage';

const isAnimePaheSession = (value: unknown) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

export interface SearchPreviewItem {
    id: string | number;
    title: string;
    subtitle: string;
    image: string;
    date: string | number | undefined;
    type: string | undefined;
    duration: string | null;
    url: string;
}

export const searchApi = {
    async getAnimePreview(query: string, language: TitleLanguage) {
        const { data } = await animeService.searchAnimeScraper(query, 1, 6);
        return data.slice(0, 4).map((item: any) => ({
            id: item.scraperId || item.id,
            title: getDisplayTitle(item, language),
            subtitle: getSecondaryTitle(item, language),
            image: item.images.jpg.image_url,
            date: item.aired?.string ? item.aired.string : item.year,
            type: item.type,
            duration: item.duration || null,
            url: item.scraperId && isAnimePaheSession(item.scraperId)
                ? `/anime/details/s:${item.scraperId}`
                : `/anime/details/${item.id}`,
        })) as SearchPreviewItem[];
    },

    async getMangaPreview(query: string, language: TitleLanguage) {
        const { data } = await mangaService.searchMangaScraper(query, 1, 6);
        return data.slice(0, 4).map((item: any) => ({
            id: item.id || item.mal_id,
            title: getDisplayTitle(item, language),
            subtitle: item.latestChapter || getSecondaryTitle(item, language),
            image: item.images.jpg.image_url,
            date: item.published?.string
                ? new Date(item.published.string).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                })
                : '',
            type: item.type,
            duration: null,
            url: `/manga/details/${item.id || item.mal_id}`,
        })) as SearchPreviewItem[];
    },
};
