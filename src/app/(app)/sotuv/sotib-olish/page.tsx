import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShoppingCart, FolderTree, Truck } from "lucide-react";
import { PageHeader, SectionCard, EmptyState, Pill } from "@/components/common/page";

export const dynamic = "force-dynamic";

export default async function SotibOlishPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "ADMIN" && role !== "CAT_MANAGER")) redirect("/dashboard-v2");
  const userId = Number(session.user.id);

  // Kategoriya menejeri — biriktirilgan kategoriyalar; admin — barcha 21 kategoriya.
  const myCats =
    role === "CAT_MANAGER"
      ? (await prisma.categoryManager.findMany({
          where: { userId },
          select: { category: { select: { id: true, name: true, group: { select: { name: true } } } } },
          orderBy: { category: { sortOrder: "asc" } },
        })).map((m) => m.category)
      : await prisma.category.findMany({
          where: { parentId: null },
          select: { id: true, name: true, group: { select: { name: true } } },
          orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
        });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Sotib olish"
        description="Ta'minotchilarga zakaz berish — javobgar kategoriyangiz bo'yicha"
      />

      {role === "CAT_MANAGER" && myCats.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Kategoriya biriktirilmagan"
          description="Sizga hali kategoriya biriktirilmagan. Admin Foydalanuvchilar bo'limidan biriktirgach, shu yerда ko'rinadi."
        />
      ) : (
        <SectionCard
          title={role === "CAT_MANAGER" ? "Mening kategoriyalarim" : "Barcha kategoriyalar"}
          description={role === "CAT_MANAGER" ? "Siz javobgar bo'lgan kategoriyalar" : "Admin sifatida barchasi ko'rinadi"}
          actions={<span className="text-xs text-muted-foreground">{myCats.length} ta</span>}
        >
          <div className="flex flex-wrap gap-1.5">
            {myCats.map((c) => (
              <Pill key={c.id} tone="blue">
                {c.group?.name ? `${c.group.name} › ` : ""}{c.name}
              </Pill>
            ))}
          </div>
        </SectionCard>
      )}

      <EmptyState
        icon={Truck}
        title="Zakaz berish — tez orada"
        description="Ta'minotchilarga ko'ra zakaz (buyurtma) berish imkoniyati keyingi bosqichда shu yerга qo'shiladi."
      />
    </div>
  );
}
