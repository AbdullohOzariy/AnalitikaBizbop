import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canManageWarehouse } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ArrowLeftRight, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { KochirishBuilder } from "./kochirish-builder";

export const dynamic = "force-dynamic";

export default async function YangiKochirishPage() {
  const session = await auth();
  if (!session?.user || !canManageWarehouse(session.user.role)) redirect("/logistika");
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

  return (
    <div className="space-y-5">
      <PageHeader icon={ArrowLeftRight} title="Yangi ko'chirish" description="Manba va qabul qiluvchi filialni tanlang — tizim manbadagi ortiqcha qoldiqni qabul qiluvchining ehtiyojiga moslab tavsiya beradi">
        <Link href="/logistika?tab=kochirish"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" /> Ro&apos;yxatga
        </Link>
      </PageHeader>
      <KochirishBuilder branches={branches} />
    </div>
  );
}
