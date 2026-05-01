import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full text-muted-foreground space-y-4 animate-in fade-in duration-300">
      <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
      <p className="text-sm font-medium animate-pulse">Ma'lumotlar yuklanmoqda...</p>
    </div>
  );
}