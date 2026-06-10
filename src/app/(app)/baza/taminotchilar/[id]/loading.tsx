import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierProfileLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_1fr]">
        <div className="space-y-5">
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[560px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
