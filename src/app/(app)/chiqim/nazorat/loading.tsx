import { Skeleton } from "@/components/ui/skeleton";

export default function ChiqimNazoratLoading() {
  return (
    <div className="space-y-5">
      {/* Sarlavha + filtr */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-72" />
      </div>
      {/* Umumiy ko'rsatkichlar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
        ))}
      </div>
      {/* Umumiy reja bloki */}
      <Skeleton className="h-32 w-full rounded-2xl" />
      {/* Daraxt */}
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}
