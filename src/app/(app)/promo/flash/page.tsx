import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { PageHeader } from "@/components/common/page";

export const metadata = { title: "Flash aksiyalar" };

export default async function FlashAksiyalarPage() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.role)) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Flash aksiyalar"
        description="Promo — Faza 1 da to'ldiriladi"
        icon={Zap}
      />
      <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Tez orada (Faza 1)
        </p>
      </div>
    </div>
  );
}
