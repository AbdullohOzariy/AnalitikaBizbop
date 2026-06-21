import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo, canEditPromo } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/common/page";
import { FlashClient } from "./flash-client";

export const metadata = { title: "Flash aksiyalar" };

export default async function FlashAksiyalarPage() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.role)) redirect("/dashboard");

  const branches = await prisma.branch.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const canEdit = canEditPromo(session.user.role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Flash aksiyalar"
        description="Bayram va vaqtinchalik aksiyalar — muddat, SKU, narx va izoh bilan"
        icon={Zap}
      />
      <FlashClient branches={branches} canEdit={canEdit} />
    </div>
  );
}
