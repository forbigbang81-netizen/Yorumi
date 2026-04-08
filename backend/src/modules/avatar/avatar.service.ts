import fs from 'fs';
import path from 'path';
import { AppError } from '../../core/errors/app-error';

const avatarsDir = path.join(__dirname, '../../../avatars');

const getFilesRecursively = (dir: string): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir);

    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(getFilesRecursively(filePath));
            continue;
        }

        if (/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) {
            results.push(path.relative(avatarsDir, filePath).replace(/\\/g, '/'));
        }
    }

    return results;
};

export const avatarService = {
    directory: avatarsDir,
    getRandomAvatar() {
        const files = getFilesRecursively(avatarsDir);
        if (files.length === 0) {
            throw new AppError('No avatars found', 404);
        }

        const randomFile = files[Math.floor(Math.random() * files.length)];
        return { url: `/avatars/${randomFile}` };
    },
};
