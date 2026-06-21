import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo, canEditPromo } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/common/page";
import { DoimiyClient } from "./doimiy-client";

export const metadata = { title: "Doimiy aksiyalar" };

export default async function DoimiyAksiyalarPage() {
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
        title="Doimiy aksiyalar"
        description="Promo aksiyalar boshqaruvi — KUN TAKLIFI · HAFTA CHEGIRMASI · BIZBOP NARX · A-A-ARZON"
        icon={Megaphone}
      />
      <DoimiyClient branches={branches} canEdit={canEdit} />
    </div>
  );
}
