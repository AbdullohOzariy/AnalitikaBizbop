import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-64" />
      <div className="rounded-xl border border-border overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        {[...Array(12)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-none border-t border-border/30" />
        ))}
      </div>
    </div>
  );
}
