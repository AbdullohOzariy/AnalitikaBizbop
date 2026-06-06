import { Skeleton } from "@/components/ui/skeleton";

export default function ChiqimLoading() {
  return (
    <div className="space-y-5">
      {/* Sarlavha + filtr */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-72" />
      </div>
      {/* StatCard qatori (5 tur + jami) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
        ))}
      </div>
      {/* Filial breakdown */}
      <Skeleton className="h-40 w-full rounded-2xl" />
      {/* Jadval */}
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
