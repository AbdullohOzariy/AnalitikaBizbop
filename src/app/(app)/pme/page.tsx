/**
 * PME analyze — SKU'larni ikkinchi o'lcham (Premium/Medium/Easy) bo'yicha segmentlash.
 * 2 tab: (1) Biriktirish — ta'minotchi kesimida iyerarxik, SKU segmenti qo'lda;
 * (2) Analyze — segment → iyerarxiya ko'rinishida biriktirilgan SKU'lar.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Gem } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { canSeePme, canEditPme } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { BiriktirishTab, AnalyzeTab } from "./pme-client";

export const dynamic = "force-dynamic";

type Tab = "biriktirish" | "analyze";

export default async function PmePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const roles = session?.user?.roles;
  if (!session?.user || !canSeePme(roles)) redirect("/dashboard-v2");
  const canEdit = canEditPme(roles);
  const sp = await searchParams;
  const tab: Tab = sp.tab === "analyze" ? "analyze" : "biriktirish";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gem}
        title="PME analyze"
        description="SKU'larni Premium / Medium / Easy segmentlarga ajratish — ta'minotchi kesimida iyerarxik"
      />

      <div role="tablist" className="flex gap-2">
        {([
          { v: "biriktirish", l: "Biriktirish" },
          { v: "analyze", l: "Analyze" },
        ] as { v: Tab; l: string }[]).map((t) => (
          <Link
            key={t.v}
            href={`/pme?tab=${t.v}`}
            scroll={false}
            aria-current={tab === t.v ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-xl border px-4 text-sm font-medium transition-colors",
              tab === t.v
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "analyze" ? <AnalyzeTab /> : <BiriktirishTab canEdit={canEdit} />}
    </div>
  );
}
