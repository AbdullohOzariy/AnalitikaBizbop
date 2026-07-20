"use client";

/**
 * Zakazlar kanban doskasi — har status alohida ustun, kartada rolga mos
 * keyingi-qadam tugmalari. Hamma o'zgarish hammaga ko'rinadi:
 * menejer yaratadi/kuzatadi, supplychain tasdiqlaydi/yuboradi,
 * Bo'lim boshlig'i va SYSTEM_ADMIN hamma o'tishni qila oladi.
 */
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Truck, ArrowRight, Undo2, Loader2, Copy } from "lucide-react";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import {
  ORDER_STATUSES, ORDER_STATUS_LABEL, TRANSITION_LABEL,
  NEXT_STATUSES, canTransition, type OrderStatusT,
} from "./order-status";
import { setOrderStatusAction } from "./actions";

export type KanbanCard = {
  id: number;
  status: OrderStatusT;
  supplier: string;
  agent: string | null; // agent (brend) nomi — bo'lsa kartada ko'rinadi
  total: number;
  count: number;
  createdBy: string;
  date: string;
  mine: boolean;
};

const COLUMN_ACCENT: Record<string, string> = {
  DRAFT: "border-t-zinc-400",
  PENDING: "border-t-amber-500",
  APPROVED: "border-t-blue-500",
  SENT: "border-t-sky-500",
  ACCEPTED: "border-t-emerald-500",
  RECEIVED: "border-t-emerald-700",
  RETURNED: "border-t-red-500",
};

export function KanbanBoard({ cards, roles }: { cards: KanbanCard[]; roles: readonly string[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const move = (card: KanbanCard, to: OrderStatusT) => {
    const label = TRANSITION_LABEL[to] ?? to;
    if ((to === "RETURNED" || to === "DRAFT") && !confirm(`#${card.id} — "${label}"?`)) return;
    start(async () => {
      const res = await setOrderStatusAction(card.id, to);
      if (res.ok) { toast.success(`#${card.id} → ${ORDER_STATUS_LABEL[to]}`); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {ORDER_STATUSES.map((st) => {
          const colCards = cards.filter((c) => c.status === st);
          return (
            <div key={st} className={cn("w-[270px] shrink-0 rounded-xl border border-border border-t-4 bg-muted/20", COLUMN_ACCENT[st])}>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-bold">{ORDER_STATUS_LABEL[st]}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {colCards.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 px-2 pb-2">
                {colCards.length === 0 && (
                  <p className="py-4 text-center text-[11px] italic text-muted-foreground/60">—</p>
                )}
                {colCards.map((c) => {
                  const nexts = (NEXT_STATUSES[c.status] ?? []).filter((to) => canTransition(roles, c.status, to, c.mine));
                  return (
                    <div key={c.id}
                      className={cn(
                        "rounded-lg border bg-card p-2.5 shadow-sm transition-shadow hover:shadow",
                        c.mine ? "border-primary/40" : "border-border"
                      )}>
                      <Link href={`/sotuv/sotib-olish/${c.id}`} className="block">
                        <div className="flex items-start justify-between gap-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                            <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate" title={c.supplier}>{c.supplier}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{c.id}</span>
                        </div>
                        {c.agent && (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-primary" title={c.agent}>{c.agent}</p>
                        )}
                        <p className="mt-1 text-xs tabular-nums">
                          <span className="font-bold">{formatUZS(c.total, { compact: true })}</span>
                          <span className="text-muted-foreground"> · {c.count} SKU</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          {c.mine && <Pill tone="blue" className="px-1 py-0 text-[9px]">meniki</Pill>}
                          <span className="truncate">{c.createdBy}</span> · {c.date}
                        </p>
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/50 pt-2">
                        {nexts.map((to) => {
                          const back = to === "DRAFT" || to === "PENDING" && c.status === "APPROVED";
                          const danger = to === "RETURNED";
                          return (
                            <button key={to}
                              onClick={() => move(c, to)}
                              disabled={isPending}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50",
                                danger
                                  ? "border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                                  : back
                                    ? "border-border text-muted-foreground hover:bg-muted/50"
                                    : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                              )}>
                              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : back ? <Undo2 className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                              {TRANSITION_LABEL[to]}
                            </button>
                          );
                        })}
                        {/* Eski zakazdan qayta zakaz — miqdor + filial taqsimoti bilan builder'ni to'ldiradi */}
                        <Link
                          href={`/sotuv/sotib-olish/yangi?from=${c.id}`}
                          title="Qayta zakaz berish"
                          aria-label="Qayta zakaz berish"
                          className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
