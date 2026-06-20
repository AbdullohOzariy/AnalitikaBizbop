import { redirect } from "next/navigation";
import { BarChart2 } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { PageHeader } from "@/components/common/page";

export const metadata = { title: "Promo hisobot" };

export default async function PromoHisobotPage() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.role)) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Promo hisobot"
        description="Promo — Faza 1 da to'ldiriladi"
        icon={BarChart2}
      />
      <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Tez orada (Faza 1)
        </p>
      </div>
    </div>
  );
}
