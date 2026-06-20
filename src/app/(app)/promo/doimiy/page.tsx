import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { PageHeader } from "@/components/common/page";

export const metadata = { title: "Doimiy aksiyalar" };

export default async function DoimiyAksiyalarPage() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.role)) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Doimiy aksiyalar"
        description="Promo — Faza 1 da to'ldiriladi"
        icon={Megaphone}
      />
      <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Tez orada (Faza 1)
        </p>
      </div>
    </div>
  );
}
