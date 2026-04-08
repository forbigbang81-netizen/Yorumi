import { acquireLock, cacheGet, cacheSet, releaseLock } from '../../utils/redis-cache';

export const cacheStore = {
    get: cacheGet,
    set: cacheSet,
    acquireLock,
    releaseLock,
};
