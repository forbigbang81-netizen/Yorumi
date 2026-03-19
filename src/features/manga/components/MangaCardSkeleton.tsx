import Skeleton from '../../../components/ui/Skeleton';

export default function MangaCardSkeleton() {
    return (
        <div className="animate-in fade-in duration-300">
            {/* Image Skeleton */}
            <Skeleton className="aspect-[2/3] w-full rounded-lg mb-3" />
            
            {/* Title Skeleton */}
            <div className="space-y-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-2/3 rounded" />
            </div>
            
            {/* Badges Skeleton (Optional, but helps with consistency) */}
            <div className="flex gap-2 mt-2">
                <Skeleton className="h-3 w-12 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
            </div>
        </div>
    );
}
