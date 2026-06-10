import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShoppingCart, Plus, Truck } from "lucide-react";
import { PageHeader, EmptyState, Pill } from "@/components/common/page";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatUZS, formatDateUZ } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "./order-status";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function SotibOlishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "SYSTEM_ADMIN" && role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "SUPPLYCHAIN")) redirect("/dashboard-v2");
  const userId = Number(session.user.id);
  const sp = await searchParams;
  const statusFilter = ORDER_STATUSES.includes(sp.status as never) ? (sp.status as string) : undefined;

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (role === "CAT_MANAGER") where.createdById = userId;
  if (statusFilter) where.status = statusFilter as Prisma.PurchaseOrderWhereInput["status"];

  const orders = await prisma.purchaseOrder.findMany({
    where,
    select: {
      id: true, status: true, createdAt: true,
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: { select: { quantity: true, price: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows = orders.map((o) => ({
    id: o.id,
    status: o.status,
    supplier: o.supplier.name,
    createdBy: o.createdBy.name,
    date: o.createdAt,
    count: o.items.length,
    total: o.items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Sotib olish"
        description="Yetkazib beruvchilarga zakaz (buyurtma) berish va kuzatish"
      >
        <Link href="/sotuv/sotib-olish/yangi"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Yangi zakaz
        </Link>
      </PageHeader>

      {/* Holat filtri */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip label="Hammasi" href="/sotuv/sotib-olish" active={!statusFilter} />
        {ORDER_STATUSES.map((s) => (
          <FilterChip key={s} label={ORDER_STATUS_LABEL[s]} href={`/sotuv/sotib-olish?status=${s}`} active={statusFilter === s} />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="Zakaz yo'q" description="“Yangi zakaz” tugmasi orqali birinchi buyurtmani yarating." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[70px]">№</TableHead>
                  <TableHead>Yetkazib beruvchi</TableHead>
                  <TableHead className="w-[130px]">Holat</TableHead>
                  <TableHead className="text-right w-[90px]">SKU</TableHead>
                  <TableHead className="text-right w-[140px]">Jami summa</TableHead>
                  <TableHead className="w-[140px]">Yaratgan</TableHead>
                  <TableHead className="w-[110px]">Sana</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer text-sm">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link href={`/sotuv/sotib-olish/${r.id}`} className="block">#{r.id}</Link>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={r.supplier}>
                      <Link href={`/sotuv/sotib-olish/${r.id}`} className="block hover:underline">{r.supplier}</Link>
                    </TableCell>
                    <TableCell><Pill tone={ORDER_STATUS_TONE[r.status] ?? "muted"}>{ORDER_STATUS_LABEL[r.status] ?? r.status}</Pill></TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-medium">{formatUZS(r.total)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{r.createdBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateUZ(r.date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
      {label}
    </Link>
  );
}
