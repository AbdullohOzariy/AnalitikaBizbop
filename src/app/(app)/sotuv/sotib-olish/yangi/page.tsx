import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { canManageOrders } from "@/lib/roles";
import { OrderBuilder } from "./order-builder";
import { reorderSourceAction, type ReorderSource } from "../actions";

export const dynamic = "force-dynamic";

export default async function YangiZakazPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const roles = session?.user?.roles;
  if (!session?.user || !canManageOrders(roles)) redirect("/dashboard-v2");
  const sp = await searchParams;
  const initialSupplierId = sp.supplier ? Number(sp.supplier) || undefined : undefined;
  const initialAgentId = sp.agent ? Number(sp.agent) || undefined : undefined;

  // Qayta zakaz: ?from=<orderId> — eski zakazni "urug'lik" sifatida server tomonda
  // oldindan olib, client'ga bitta prop bilan uzatamiz (qo'shimcha round-trip yo'q).
  const fromOrderId = sp.from ? Number(sp.from) || undefined : undefined;
  let reorderSeed: ReorderSource | null = null;
  let reorderError: string | null = null;
  if (fromOrderId) {
    const res = await reorderSourceAction(fromOrderId);
    if (res.ok) reorderSeed = res.data;
    else reorderError = res.error;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Yangi zakaz"
        description="Yetkazib beruvchini tanlang — SKU'lar qoldiq/sotuv asosida taklif bilan chiqadi"
      />
      {reorderError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          Eski zakazdan nusxa olinmadi: {reorderError}
        </p>
      )}
      <OrderBuilder
        initialSupplierId={initialSupplierId}
        initialAgentId={initialAgentId}
        reorderSeed={reorderSeed}
      />
    </div>
  );
}
