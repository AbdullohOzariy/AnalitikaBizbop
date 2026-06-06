import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardV2Loading() {
  return (
    <div className="space-y-6">
      {/* Sarlavha + filtr */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-20 w-full" />
      {/* Widgetlar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-80 w-full" style={{ minHeight: 320 }} />
        <Skeleton className="h-80 w-full" style={{ minHeight: 320 }} />
        <Skeleton className="h-72 w-full" style={{ minHeight: 280 }} />
        <Skeleton className="h-72 w-full" style={{ minHeight: 280 }} />
      </div>
    </div>
  );
}
