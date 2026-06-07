import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { OrderBuilder } from "./order-builder";

export const dynamic = "force-dynamic";

export default async function YangiZakazPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "ADMIN" && role !== "CAT_MANAGER")) redirect("/dashboard-v2");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Yangi zakaz"
        description="Ta'minotchini tanlang — SKU'lar qoldiq/sotuv asosida taklif bilan chiqadi"
      />
      <OrderBuilder />
    </div>
  );
}
