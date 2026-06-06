import { Skeleton } from "@/components/ui/skeleton";

export default function IyerarxiyaLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-[480px] max-w-full" />
      </div>
      {/* Stat panel (5 karta) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
        ))}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border/60 p-5 space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2">
            {[...Array(5)].map((_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
