"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/common/page";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatusT } from "@/lib/zakaz/order-status";

// Server (page.tsx) supplierOrderHistoryAction natijasini client'ga o'tkazadigan
// shakl — Date -> ISO string (repo konvensiyasi: order-detail.tsx OrderData'ga qara).
export type OrderHistoryRow = {
  id: number;
  createdAt: string; // ISO
  status: OrderStatusT;
  agentName: string | null;
  itemCount: number;
  totalSum: number;
  createdByName: string;
};

const reorderCls =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/** Postavshik profilidagi zakazlar tarixi — har qator bosilsa zakaz sahifasiga o'tadi,
 *  "Qayta zakaz" tugmasi builder'ni shu zakaz asosida to'ldirib ochadi. */
export function ZakazTarixiSection({ orders, error }: { orders: OrderHistoryRow[]; error?: string | null }) {
  const router = useRouter();
  const goto = (id: number) => router.push(`/sotuv/sotib-olish/${id}`);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <History className="h-4 w-4 text-muted-foreground" /> Zakazlar tarixi
          <span className="text-xs font-normal text-muted-foreground">· {orders.length} ta</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Bosib zakazni ochish, yoki eski zakaz asosida yangisini yaratish mumkin.</p>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-4 text-center text-xs text-destructive">{error}</p>
        ) : orders.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">Hali zakaz berilmagan.</p>
        ) : (
          <>
            {/* Desktop — jadval (md+) */}
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Sana</th>
                    <th className="px-2 py-2 font-semibold">Agent</th>
                    <th className="px-2 py-2 font-semibold">Holat</th>
                    <th className="px-2 py-2 text-right font-semibold">SKU</th>
                    <th className="px-2 py-2 text-right font-semibold">Summa</th>
                    <th className="px-2 py-2 font-semibold">Yaratdi</th>
                    <th className="w-[110px] px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => goto(o.id)}
                      className="cursor-pointer border-b border-border/40 text-xs last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 tabular-nums">{formatDateTimeUZ(o.createdAt)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{o.agentName ?? "—"}</td>
                      <td className="px-2 py-2">
                        <Pill tone={ORDER_STATUS_TONE[o.status] ?? "muted"} className="px-1.5 py-0 text-[10px]">
                          {ORDER_STATUS_LABEL[o.status] ?? o.status}
                        </Pill>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{o.itemCount}</td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{formatUZS(o.totalSum)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{o.createdByName}</td>
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/sotuv/sotib-olish/yangi?from=${o.id}`} className={reorderCls}>
                          <Copy className="h-3 w-3" /> Qayta zakaz
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobil — kartalar (<md) */}
            <div className="space-y-2 md:hidden">
              {orders.map((o) => (
                <div key={o.id} className="rounded-xl border border-border">
                  <Link href={`/sotuv/sotib-olish/${o.id}`} className="block space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{formatDateTimeUZ(o.createdAt)}</span>
                      <Pill tone={ORDER_STATUS_TONE[o.status] ?? "muted"} className="px-1.5 py-0 text-[10px]">
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </Pill>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatUZS(o.totalSum)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {o.itemCount} SKU</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.agentName && <>{o.agentName} · </>}
                      {o.createdByName}
                    </p>
                  </Link>
                  <div className="border-t border-border/50 px-3 py-2">
                    <Link href={`/sotuv/sotib-olish/yangi?from=${o.id}`} className={reorderCls}>
                      <Copy className="h-3 w-3" /> Qayta zakaz
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
