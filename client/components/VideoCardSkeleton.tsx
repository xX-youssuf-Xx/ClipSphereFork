import { Skeleton } from "@/components/ui/skeleton";

export function VideoCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-zinc-800">
        <Skeleton className="absolute inset-0 w-full h-full rounded-none bg-zinc-800" />
        {/* Shimmer overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-700/10 to-transparent animate-shimmer" />
        {/* Duration badge placeholder */}
        <Skeleton className="absolute top-2 right-2 w-10 h-5 rounded-md bg-zinc-700" />
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Title lines */}
        <Skeleton className="h-4 w-full bg-zinc-800 rounded" />
        <Skeleton className="h-4 w-3/4 bg-zinc-800 rounded" />

        {/* Owner row */}
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="w-7 h-7 rounded-full bg-zinc-700 shrink-0" />
          <Skeleton className="h-3 w-28 bg-zinc-800 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Renders a full grid of skeleton cards for the video feed */
export function VideoFeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
