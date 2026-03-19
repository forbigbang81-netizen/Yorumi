import React from 'react';
import Skeleton from '../../../components/ui/Skeleton';

const TopTenSkeleton: React.FC = () => {
    return (
        <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, index) => (
                <div
                    key={`top-ten-skeleton-${index}`}
                    className="relative flex items-stretch gap-3 rounded-xl bg-[#0f1116] overflow-hidden"
                >
                    {/* Rank Number Skeleton */}
                    <div className="relative w-16 flex items-center justify-center">
                        <Skeleton className="h-6 w-8" />
                    </div>

                    {/* Info Skeleton */}
                    <div className="min-w-0 flex-1 py-3 pr-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <div className="flex gap-2">
                            <Skeleton className="h-4 w-12 rounded-md" />
                            <Skeleton className="h-4 w-12 rounded-md" />
                        </div>
                    </div>

                    {/* Image Placeholder */}
                    <div className="w-32 bg-white/5" />
                </div>
            ))}
        </div>
    );
};

export default TopTenSkeleton;
