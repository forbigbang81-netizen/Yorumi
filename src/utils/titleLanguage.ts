import type { TitleLanguage } from '../context/TitleLanguageContext';

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

export const getDisplayTitle = (item: Record<string, unknown>, language: TitleLanguage): string => {
    const englishCandidates = [item.title_english, item.title_romaji, item.title];
    const romajiCandidates = [item.title_romaji, item.title_english, item.title];
    const candidates = language === 'jpy' ? romajiCandidates : englishCandidates;

    for (const candidate of candidates) {
        if (isNonEmptyString(candidate)) return candidate;
    }

    return 'Unknown';
};

export const getSecondaryTitle = (item: Record<string, unknown>, language: TitleLanguage): string => {
    const primary = getDisplayTitle(item, language);
    const alternateLanguage: TitleLanguage = language === 'eng' ? 'jpy' : 'eng';
    const secondary = getDisplayTitle(item, alternateLanguage);
    return secondary !== primary ? secondary : '';
};
