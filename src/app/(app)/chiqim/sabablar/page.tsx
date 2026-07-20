import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSystemAdmin } from "@/lib/roles";
import { botConfigured, sabablarRoyxat } from "@/lib/spisaniya/db";
import { ClipboardList, ListChecks, CheckCircle2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { SabablarClient } from "./sabablar-client";

export const dynamic = "force-dynamic";

export default async function ChiqimSabablarPage() {
  const session = await auth();
  if (!session) redirect("/login");
  // FAQAT to'liq admin (SYSTEM_ADMIN) — read-only ADMIN ham o'tmaydi.
  if (!isSystemAdmin(session.user.roles)) redirect("/dashboard-v2");

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={ClipboardList}
          title="Chiqim sabablari"
          description="Hisobdan chiqarish sabablarini boshqarish"
        />
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Spisaniya bazasi (bizbop) ulanmagan — <code>BOT_DATABASE_URL</code> sozlanmagan.
          </CardContent>
        </Card>
      </div>
    );
  }

  const sabablar = await sabablarRoyxat();
  const faolSoni = sabablar.filter((s) => s.faol).length;
  const nofaolSoni = sabablar.length - faolSoni;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="Chiqim sabablari"
        description="Hisobdan chiqarish (spisaniya) sabablarini boshqaring — miniapp xodimlarga shu ro'yxatni ko'rsatadi"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Jami sabab" value={String(sabablar.length)} icon={ListChecks} tone="blue" />
        <StatCard
          label="Faol"
          value={String(faolSoni)}
          icon={CheckCircle2}
          tone="green"
          hint={nofaolSoni > 0 ? `${nofaolSoni} ta nofaol (miniappda ko'rinmaydi)` : "Hammasi faol"}
        />
      </div>

      <SabablarClient initial={sabablar} />
    </div>
  );
}
