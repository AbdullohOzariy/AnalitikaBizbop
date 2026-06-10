import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { OrderBuilder } from "./order-builder";

export const dynamic = "force-dynamic";

export default async function YangiZakazPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "SYSTEM_ADMIN" && role !== "CAT_MANAGER")) redirect("/dashboard-v2");
  const sp = await searchParams;
  const initialSupplierId = sp.supplier ? Number(sp.supplier) || undefined : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Yangi zakaz"
        description="Yetkazib beruvchini tanlang — SKU'lar qoldiq/sotuv asosida taklif bilan chiqadi"
      />
      <OrderBuilder initialSupplierId={initialSupplierId} />
    </div>
  );
}
