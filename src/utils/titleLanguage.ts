import type { TitleLanguage } from '../context/TitleLanguageContext';

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const isMostlyLatin = (value: string): boolean => {
    const normalized = value.replace(/[\s\d\p{P}]/gu, '');
    if (!normalized) return false;
    const latinChars = (normalized.match(/\p{Script=Latin}/gu) || []).length;
    return latinChars / normalized.length >= 0.6;
};

export const getDisplayTitle = (item: Record<string, unknown>, language: TitleLanguage): string => {
    const synonyms = Array.isArray(item.synonyms) ? item.synonyms.filter(isNonEmptyString) : [];
    const latinSynonyms = synonyms.filter((value) => isMostlyLatin(value));
    const fallbackSynonyms = synonyms.filter((value) => !latinSynonyms.includes(value));

    const englishCandidates = [
        item.title_english,
        item.title_romaji,
        ...latinSynonyms,
        isNonEmptyString(item.title) && isMostlyLatin(item.title) ? item.title : null,
        item.title,
        item.title_native,
        ...fallbackSynonyms,
    ];
    const romajiCandidates = [item.title_romaji, item.title_english, item.title, item.title_native, ...synonyms];
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
