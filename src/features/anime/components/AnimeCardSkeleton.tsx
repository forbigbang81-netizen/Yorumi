import React from 'react';
import Skeleton from '../../../components/ui/Skeleton';

interface AnimeCardSkeletonProps {
    className?: string;
}

const AnimeCardSkeleton: React.FC<AnimeCardSkeletonProps> = ({ className = '' }) => {
    return (
        <div className={`relative flex flex-col gap-3 ${className}`}>
            {/* Poster Skeleton */}
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl">
                <Skeleton className="w-full h-full" />
                
                {/* Badges Skeletons */}
                <div className="absolute top-2 right-2">
                    <Skeleton className="w-10 h-5 rounded" />
                </div>
                <div className="absolute bottom-2 left-2 flex gap-1.5">
                    <Skeleton className="w-8 h-5 rounded" />
                    <Skeleton className="w-12 h-5 rounded" />
                </div>
            </div>
            
            {/* Title Skeleton */}
            <div className="space-y-2">
                <Skeleton className="w-full h-4" />
                <Skeleton className="w-2/3 h-4" />
            </div>
        </div>
    );
};

export default AnimeCardSkeleton;
