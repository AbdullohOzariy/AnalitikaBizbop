import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    </div>
  );
}
