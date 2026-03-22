import 'dotenv/config';
import { Redis } from '@upstash/redis';

type MappingValue = {
    id?: string;
    title?: string;
    timestamp?: number;
};

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
    console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
}

const redis = new Redis({ url, token });
const KEY_PREFIX = 'map:anilist:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

async function main() {
    const apply = hasFlag('--apply');
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    console.log(`[migrate] Found ${keys.length} mapping keys`);

    let legacyCount = 0;
    let deletedCount = 0;
    let readErrors = 0;

    for (const key of keys) {
        try {
            const value = await redis.get<MappingValue>(key);
            const scraperId = value?.id || '';
            if (!UUID_RE.test(scraperId)) continue;

            legacyCount += 1;
            console.log(`[legacy] ${key} -> ${scraperId}`);

            if (apply) {
                await redis.del(key);
                deletedCount += 1;
            }
        } catch (error) {
            readErrors += 1;
            console.warn(`[warn] Failed to process key ${key}`, error);
        }
    }

    console.log(`[done] legacy mappings detected: ${legacyCount}`);
    console.log(`[done] deleted: ${deletedCount}`);
    if (readErrors > 0) {
        console.log(`[done] read errors: ${readErrors}`);
    }

    if (!apply) {
        console.log('[info] Dry run only. Re-run with --apply to delete legacy mappings.');
    }
}

main().catch((error) => {
    console.error('[fatal] Migration failed', error);
    process.exit(1);
});

