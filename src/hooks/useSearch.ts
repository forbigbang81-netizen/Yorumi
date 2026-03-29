import { useCallback, useRef, useState } from 'react';
import type { Anime } from '../types/anime';
import type { Manga } from '../types/manga';
import { animeService } from '../services/animeService';
import { mangaService } from '../services/mangaService';

export function useSearch(activeTab: 'anime' | 'manga', onSearchStart?: () => void, isAZList: boolean = false) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<(Anime | Manga)[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchPagination, setSearchPagination] = useState({
        last_visible_page: 1,
        current_page: 1,
        has_next_page: false
    });
    const responseCacheRef = useRef(new Map<string, { data: (Anime | Manga)[]; pagination?: typeof searchPagination; timestamp: number }>());
    const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;

    const performSearch = useCallback(async (query: string, page: number, isLoadMore: boolean = false) => {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            if (!isLoadMore) {
                setSearchResults([]);
                setIsSearching(false);
                setSearchLoading(false);
            }
            return;
        }

        const cacheKey = `${activeTab}:${isAZList ? 'az' : 'search'}:${normalizedQuery.toLowerCase()}:${page}`;
        const cached = responseCacheRef.current.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < SEARCH_CACHE_TTL_MS) {
            if (isLoadMore) {
                setSearchResults(prev => [...prev, ...cached.data]);
            } else {
                setSearchResults(cached.data);
            }

            if (cached.pagination) {
                setSearchPagination(cached.pagination);
            }
            setSearchLoading(false);
            if (!isLoadMore) setIsSearching(false);
            return;
        }

        setSearchLoading(true);
        if (!isLoadMore) setIsSearching(true);

        try {
            let newData: any;
            if (activeTab === 'anime') {
                if (isAZList) {
                    // Handle empty query as 'All' for AZ list
                    const target = normalizedQuery || 'All';
                    newData = await animeService.getAZList(target, page);
                } else {
                    newData = await animeService.searchAnimeScraper(normalizedQuery, page);
                }
            } else {
                if (isAZList) {
                    const target = normalizedQuery || 'All';
                    newData = await mangaService.getAZList(target, page);
                } else {
                    newData = await mangaService.searchMangaScraper(normalizedQuery, page, 24);
                }
            }

            responseCacheRef.current.set(cacheKey, {
                data: newData?.data || [],
                pagination: newData?.pagination,
                timestamp: Date.now()
            });

            if (isLoadMore) {
                setSearchResults(prev => [...prev, ...(newData?.data || [])]);
            } else {
                setSearchResults(newData?.data || []);
            }

            if (newData?.pagination) setSearchPagination(newData.pagination);
        } catch (err) {
            console.error('Search failed:', err);
            if (!isLoadMore) setSearchResults([]);
        } finally {
            setSearchLoading(false);
            if (!isLoadMore) setIsSearching(false);
        }
    }, [activeTab, isAZList]);

    const handleSearch = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        // Reset pagination before searching
        setSearchPagination({
            last_visible_page: 1,
            current_page: 1,
            has_next_page: false
        });

        performSearch(searchQuery, 1, false);
    }, [performSearch, searchQuery]);

    const loadMore = useCallback(() => {
        if (!searchLoading && searchPagination.has_next_page) {
            const nextPage = searchPagination.current_page + 1;
            performSearch(searchQuery, nextPage, true);
        }
    }, [performSearch, searchLoading, searchPagination, searchQuery]);

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        setIsSearching(false);
    };

    // Wrapper that clears search state when query becomes empty
    const handleSearchQueryChange = (query: string) => {
        // If we're starting a new search (going from no query to having one), notify to close modals
        if (query.trim() && !searchQuery.trim() && onSearchStart) {
            onSearchStart();
        }
        setSearchQuery(query);
        if (!query.trim()) {
            setSearchResults([]);
            setIsSearching(false);
        }
    };

    return {
        searchQuery,
        searchResults,
        isSearching,
        searchLoading,
        setSearchQuery: handleSearchQueryChange,
        handleSearch,
        clearSearch,
        searchPagination,
        loadMore,
        executeSearch: performSearch
    };
}
