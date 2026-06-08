"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, Footprints } from "lucide-react";

export function BazaTabs({ activeTab }: { activeTab: "metrika" | "tashrif" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const switchTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "metrika") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Tabs value={activeTab} onValueChange={switchTab}>
      <TabsList className="h-9">
        <TabsTrigger value="metrika" className="gap-1.5 text-xs px-4">
          <BarChart2 className="h-3.5 w-3.5" />
          Metrikalar (SR)
        </TabsTrigger>
        <TabsTrigger value="tashrif" className="gap-1.5 text-xs px-4">
          <Footprints className="h-3.5 w-3.5" />
          Tashriflar
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
