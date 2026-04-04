import { useEffect, useMemo, useState } from 'react';
import AnimeCard from '../AnimeCard';
import type { Anime } from '../../../../types/anime';
import { animeService } from '../../../../services/animeService';

interface DetailsRelationsProps {
    anime: Anime;
    relations: Anime['relations'];
    onAnimeClick: (id: number) => void;
}

const ANIME_FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA']);
const EXTRA_FORMAT_ORDER: Record<string, number> = {
    MOVIE: 1,
    OVA: 2,
    ONA: 3,
    SPECIAL: 4,
    TV_SHORT: 5,
};

const getDisplayTitle = (item: Partial<Anime>) =>
    item.title_english || item.title || item.title_romaji || item.title_japanese || 'Unknown';

const getSeasonNumber = (item: Partial<Anime>) => {
    const title = getDisplayTitle(item);
    const match =
        title.match(/\bseason\s*(\d+)\b/i) ||
        title.match(/\b(\d+)(st|nd|rd|th)\s*season\b/i);
    return match ? Number(match[1]) : 0;
};

const isMainSeason = (item: Partial<Anime>) => {
    const format = String(item.type || '').toUpperCase();
    return format === 'TV' || format === 'TV_SHORT';
};

const sortFranchise = (items: Anime[]) => {
    const deduped = Array.from(
        items.reduce((map, item) => {
            const id = Number(item.id || item.mal_id || 0);
            if (id > 0 && !map.has(id)) map.set(id, item);
            return map;
        }, new Map<number, Anime>()).values()
    );

    const mainSeasons = deduped
        .filter((item) => isMainSeason(item))
        .sort((a, b) => {
            const aSeason = getSeasonNumber(a);
            const bSeason = getSeasonNumber(b);
            if (aSeason !== bSeason) {
                if (aSeason === 0) return -1;
                if (bSeason === 0) return 1;
                return aSeason - bSeason;
            }
            const yearDiff = Number(a.year || 0) - Number(b.year || 0);
            if (yearDiff !== 0) return yearDiff;
            return getDisplayTitle(a).localeCompare(getDisplayTitle(b));
        });

    const extras = deduped
        .filter((item) => !isMainSeason(item))
        .sort((a, b) => {
            const yearDiff = Number(a.year || 0) - Number(b.year || 0);
            if (yearDiff !== 0) return yearDiff;
            const formatDiff =
                (EXTRA_FORMAT_ORDER[String(a.type || '').toUpperCase()] || 99) -
                (EXTRA_FORMAT_ORDER[String(b.type || '').toUpperCase()] || 99);
            if (formatDiff !== 0) return formatDiff;
            return getDisplayTitle(a).localeCompare(getDisplayTitle(b));
        });

    return [...mainSeasons, ...extras];
};

const mapRelationNodeToAnime = (node: NonNullable<Anime['relations']>['edges'][number]['node']): Anime => ({
    mal_id: node.id,
    id: node.id,
    title: node.title.english || node.title.romaji || 'Unknown',
    title_english: node.title.english,
    title_romaji: node.title.romaji,
    title_japanese: node.title.native,
    images: {
        jpg: {
            image_url: node.coverImage.large,
            large_image_url: node.coverImage.large,
        },
    },
    score: 0,
    status: 'Unknown',
    type: node.format,
    episodes: null,
});

export default function DetailsRelations({ anime, relations, onAnimeClick }: DetailsRelationsProps) {
    const immediateRelations = useMemo(
        () => (relations?.edges || [])
            .filter((edge) => ANIME_FORMATS.has(String(edge.node.format || '').toUpperCase()))
            .map((edge) => mapRelationNodeToAnime(edge.node)),
        [relations]
    );
    const [franchise, setFranchise] = useState<Anime[]>(() => sortFranchise([anime, ...immediateRelations]));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadFranchise = async () => {
            if (!anime?.id) {
                setFranchise(sortFranchise([anime, ...immediateRelations]));
                return;
            }

            setLoading(true);
            const queue: number[] = [anime.id];
            const seen = new Set<number>();
            const collected = new Map<number, Anime>();

            while (queue.length > 0 && seen.size < 18) {
                const currentId = queue.shift();
                if (!currentId || seen.has(currentId)) continue;
                seen.add(currentId);

                const result = await animeService.getAnimeDetails(currentId).catch(() => ({ data: null }));
                const currentAnime = result?.data || null;
                if (!currentAnime) continue;

                collected.set(currentId, currentAnime);
                (currentAnime.relations?.edges || []).forEach((edge: NonNullable<Anime['relations']>['edges'][number]) => {
                    const format = String(edge.node.format || '').toUpperCase();
                    const relationId = Number(edge.node.id || 0);
                    if (!ANIME_FORMATS.has(format) || !relationId || seen.has(relationId)) return;
                    queue.push(relationId);
                });
            }

            const ordered = sortFranchise([anime, ...immediateRelations, ...Array.from(collected.values())]);
            if (!cancelled) {
                setFranchise(ordered);
                setLoading(false);
            }
        };

        loadFranchise().catch(() => {
            if (!cancelled) {
                setFranchise(sortFranchise([anime, ...immediateRelations]));
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [anime, immediateRelations]);

    if (franchise.length === 0) {
        return <div className="text-gray-500 py-4">No related anime found.</div>;
    }

    return (
        <div className="space-y-4">
            {loading && (
                <div className="text-sm text-gray-500">Building franchise order...</div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {franchise.map((item) => (
                    <AnimeCard
                        key={item.id || item.mal_id}
                        anime={item}
                        onClick={() => onAnimeClick(Number(item.id || item.mal_id))}
                    />
                ))}
            </div>
        </div>
    );
}
