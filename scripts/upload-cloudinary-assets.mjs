import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const root = process.cwd();
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
    console.error('Missing Cloudinary credentials in env.');
    process.exit(1);
}

const assetGlobs = [
    { key: 'animeBg', file: 'public/anime-bg.png', publicId: 'yorumi/shared/anime-bg' },
    { key: 'monsterSlash', file: 'public/monsterslash.png', publicId: 'yorumi/shared/monsterslash' },
    { key: 'yorumiIcon', file: 'public/yorumi-icon.svg', publicId: 'yorumi/shared/yorumi-icon' },
    { key: 'yorumiPng', file: 'public/Yorumi.png', publicId: 'yorumi/shared/yorumi' },
    { key: 'yorumiSvg', file: 'public/Yorumi.svg', publicId: 'yorumi/shared/yorumi-svg' },
    { key: 'gcashLogo', file: 'public/gcash-logo.svg', publicId: 'yorumi/shared/gcash-logo' },
    { key: 'gcashQr', file: 'public/donation.png', publicId: 'yorumi/shared/donation' },
    { key: 'luffyGif', file: 'src/assets/luffy.gif', publicId: 'yorumi/shared/luffy-loading' },
    { key: 'reactSvg', file: 'src/assets/react.svg', publicId: 'yorumi/shared/react' }
];

async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(fullPath);
        return [fullPath];
    }));
    return files.flat();
}

function toPosix(value) {
    return value.replace(/\\/g, '/');
}

function getAvatarAssets(files) {
    return files
        .filter((file) => /\.(png|jpe?g|gif|webp|svg)$/i.test(file))
        .map((file) => {
            const relative = toPosix(path.relative(path.join(root, 'public/avatars'), file));
            const publicIdBase = relative.replace(/\.[^.]+$/, '');
            return {
                type: 'avatar',
                path: relative,
                file,
                publicId: `yorumi/avatars/${publicIdBase}`
            };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
}

function sign(params) {
    const serialized = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

    return crypto.createHash('sha1').update(serialized + apiSecret).digest('hex');
}

async function uploadAsset(asset) {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
        folder: path.posix.dirname(asset.publicId),
        overwrite: 'true',
        public_id: path.posix.basename(asset.publicId),
        timestamp: String(timestamp)
    };

    const signature = sign(paramsToSign);
    const form = new FormData();
    const buffer = await fs.readFile(asset.file);
    const fileName = path.basename(asset.file);

    form.append('file', new Blob([buffer]), fileName);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('public_id', path.posix.basename(asset.publicId));
    form.append('folder', path.posix.dirname(asset.publicId));
    form.append('overwrite', 'true');
    form.append('signature', signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed for ${asset.file}: ${response.status} ${text}`);
    }

    return response.json();
}

async function main() {
    const publicAvatarFiles = await walk(path.join(root, 'public/avatars'));
    const avatarAssets = getAvatarAssets(publicAvatarFiles);
    const otherAssets = assetGlobs.map((asset) => ({
        type: 'shared',
        ...asset,
        file: path.join(root, asset.file)
    }));

    const assets = [...otherAssets, ...avatarAssets];

    for (const asset of assets) {
        console.log(`Uploading ${asset.file}`);
        await uploadAsset(asset);
    }

    console.log('Upload complete. Asset URLs are now derived from stable Cloudinary public IDs in src/config/cloudinaryAssets.ts');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
