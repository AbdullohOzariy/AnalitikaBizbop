import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { canManageOrders } from "@/lib/roles";
import { OrderBuilder } from "./order-builder";

export const dynamic = "force-dynamic";

export default async function YangiZakazPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !canManageOrders(role)) redirect("/dashboard-v2");
  const sp = await searchParams;
  const initialSupplierId = sp.supplier ? Number(sp.supplier) || undefined : undefined;
  const initialAgentId = sp.agent ? Number(sp.agent) || undefined : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Yangi zakaz"
        description="Yetkazib beruvchini tanlang — SKU'lar qoldiq/sotuv asosida taklif bilan chiqadi"
      />
      <OrderBuilder initialSupplierId={initialSupplierId} initialAgentId={initialAgentId} />
    </div>
  );
}
