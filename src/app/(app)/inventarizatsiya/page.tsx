/**
 * Inventarizatsiya — belgilangan SKU ro'yxati. Miniapp'da inventar xodimi shu
 * ro'yxatdagi SKU'larni filial kesimida sanaydi; bu sahifa ro'yxatni boshqaradi
 * (qo'shish/o'chirish — faqat SYSTEM_ADMIN va CEO).
 */
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/auth";
import { canSeeInventory, canManageInventoryItems } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/common/page";
import { formatDateTimeUZ, decimalToNumber } from "@/lib/format";
import { ItemsClient } from "./items-client";

export const metadata = { title: "Inventarizatsiya — SKU ro'yxati" };
export const dynamic = "force-dynamic";

export default async function InventarizatsiyaPage() {
  const session = await auth();
  const roles = session?.user?.roles;
  if (!session?.user || !canSeeInventory(roles)) redirect("/dashboard");
  const canManage = canManageInventoryItems(roles);

  const [items, branches] = await Promise.all([
    prisma.inventoryItem.findMany({
      include: {
        product: {
          select: {
            code: true,
            name: true,
            currentStock: true,
            category: { select: { name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ branch: { sortOrder: "asc" } }, { product: { name: "asc" } }],
    }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const rows = items.map((it) => ({
    id: it.id,
    code: it.product.code,
    name: it.product.name,
    subName: it.product.category?.name ?? null,
    branchId: it.branch.id,
    branchName: it.branch.name,
    currentStock:
      it.product.currentStock == null ? null : decimalToNumber(it.product.currentStock),
    createdByName: it.createdBy.name,
    createdAtText: formatDateTimeUZ(it.createdAt),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="Inventarizatsiya"
        description="Sanash uchun belgilangan SKU ro'yxati — har filial uchun alohida"
      />
      <ItemsClient rows={rows} branches={branches} canManage={canManage} />
    </div>
  );
}
