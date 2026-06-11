"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/common/page";
import { Loader2, Save, Send, PackageCheck, RotateCcw, Trash2, Truck } from "lucide-react";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_TONE, TRANSITION_LABEL, NEXT_STATUSES,
  canTransition, canEditItems, canEnterFact, type OrderStatusT,
} from "../order-status";
import { updateOrderItemsAction, setOrderStatusAction, deleteOrderAction, saveOrderFactAction } from "../actions";

export type OrderData = {
  id: number;
  status: string;
  note: string;
  supplier: string;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  items: { productId: number; code: number; name: string; sub: string | null; quantity: number; price: number; packCount: number | null; packSize: number | null; factQty: number | null }[];
};

type Line = { qty: string; price: string };

export function OrderDetail({ order, role, isOwner }: { order: OrderData; role: string; isOwner: boolean }) {
  const router = useRouter();
  const [lines, setLines] = useState<Map<number, Line>>(
    () => new Map(order.items.map((i) => [i.productId, { qty: String(i.quantity), price: String(i.price) }]))
  );
  const [facts, setFacts] = useState<Map<number, string>>(
    () => new Map(order.items.map((i) => [i.productId, i.factQty != null ? String(i.factQty) : ""]))
  );
  const [note, setNote] = useState(order.note);
  const [delOpen, setDelOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [statusing, startStatus] = useTransition();

  const status = order.status as OrderStatusT;
  const editable = canEditItems(role, status, isOwner);
  const factMode = canEnterFact(role, status);
  const showFact = factMode || order.items.some((i) => i.factQty != null);
  const allowedNexts = (NEXT_STATUSES[status] ?? []).filter((to) => canTransition(role, status, to, isOwner));
  const busy = saving || statusing;

  const saveFacts = () =>
    startSave(async () => {
      const payload = order.items.map((i) => {
        const raw = (facts.get(i.productId) ?? "").trim();
        return { productId: i.productId, factQty: raw === "" ? null : Number(raw) };
      });
      const res = await saveOrderFactAction(order.id, payload);
      if (res.ok) { toast.success("Fakt saqlandi."); router.refresh(); } else toast.error(res.error);
    });

  const setLine = (pid: number, patch: Partial<Line>) =>
    setLines((prev) => { const n = new Map(prev); const cur = n.get(pid) ?? { qty: "", price: "" }; n.set(pid, { ...cur, ...patch }); return n; });

  const items = order.items;
  const total = useMemo(() => {
    let t = 0;
    for (const i of items) { const l = lines.get(i.productId); t += (Number(l?.qty) || 0) * (Number(l?.price) || 0); }
    return t;
  }, [items, lines]);

  const saveItems = () => {
    const payload = items
      .map((i) => { const l = lines.get(i.productId)!; const qty = Number(l.qty) || 0; return { productId: i.productId, quantity: qty, price: Number(l.price) || 0, packCount: qty === i.quantity ? i.packCount : null, packSize: i.packSize }; })
      .filter((x) => x.quantity > 0);
    if (payload.length === 0) { toast.error("Kamida bitta SKU miqdori kerak."); return; }
    startSave(async () => {
      const res = await updateOrderItemsAction(order.id, payload, note);
      if (res.ok) { toast.success("Saqlandi."); router.refresh(); } else toast.error(res.error);
    });
  };

  const changeStatus = (st: OrderStatusT, okMsg: string) =>
    startStatus(async () => {
      const res = await setOrderStatusAction(order.id, st);
      if (res.ok) { toast.success(okMsg); router.refresh(); } else toast.error(res.error);
    });

  const del = () =>
    startStatus(async () => {
      const res = await deleteOrderAction(order.id);
      if (res.ok) { toast.success("Zakaz o'chirildi."); router.push("/sotuv/sotib-olish"); } else toast.error(res.error);
    });

  // toLocaleString EMAS — server/brauzer locale/TZ farqi hydration mismatch beradi.
  const fmtDate = (s: string | null) => (s ? formatDateTimeUZ(s) : "—");

  return (
    <div className="space-y-4">
      {/* Sarlavha + holat + amallar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Truck className="h-4 w-4 text-muted-foreground" /> {order.supplier}</span>
        <Pill tone={ORDER_STATUS_TONE[order.status] ?? "muted"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Pill>
        <span className="text-xs text-muted-foreground">Yaratdi: {order.createdBy} · {fmtDate(order.createdAt)}</span>
        {order.sentAt && <span className="text-xs text-muted-foreground">Yuborildi: {fmtDate(order.sentAt)}</span>}
        {order.receivedAt && <span className="text-xs text-muted-foreground">Qabul: {fmtDate(order.receivedAt)}</span>}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {allowedNexts.map((to) => {
            const danger = to === "RETURNED";
            const back = to === "DRAFT" || (to === "PENDING" && status === "APPROVED");
            return (
              <Button key={to} size="sm"
                variant={danger ? "outline" : back ? "outline" : "default"}
                className={`h-8 gap-1.5 ${danger ? "text-destructive" : ""}`}
                disabled={busy}
                onClick={() => {
                  if ((danger || back) && !confirm(`"${TRANSITION_LABEL[to]}" — davom etilsinmi?`)) return;
                  changeStatus(to, `${ORDER_STATUS_LABEL[to]}.`);
                }}>
                {danger ? <RotateCcw className="h-3.5 w-3.5" /> : back ? <RotateCcw className="h-3.5 w-3.5" /> : to === "RECEIVED" ? <PackageCheck className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                {TRANSITION_LABEL[to]}
              </Button>
            );
          })}
          {status === "DRAFT" && (role === "SYSTEM_ADMIN" || role === "ADMIN" || isOwner) && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" disabled={busy} onClick={() => setDelOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> O'chirish
            </Button>
          )}
        </div>
      </div>

      {/* Qatorlar */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[80px]">Kod</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="w-[140px]">Subkategoriya</TableHead>
                <TableHead className="w-[110px]">Miqdor</TableHead>
                <TableHead className="w-[120px]">Narx</TableHead>
                <TableHead className="text-right w-[120px]">Summa</TableHead>
                {showFact && <TableHead className="w-[100px] border-l border-border/60" title="FAKT yetib kelgan miqdor">Fakt</TableHead>}
                {showFact && <TableHead className="text-right w-[90px]">Farq</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const l = lines.get(i.productId) ?? { qty: "", price: "" };
                const sum = (Number(l.qty) || 0) * (Number(l.price) || 0);
                return (
                  <TableRow key={i.productId} className="text-sm">
                    <TableCell className="font-mono text-xs text-muted-foreground">{i.code}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={i.name}>{i.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.sub ?? "—"}</TableCell>
                    <TableCell>
                      <Input type="number" inputMode="decimal" value={l.qty} disabled={!editable || busy}
                        onChange={(e) => setLine(i.productId, { qty: e.target.value })} className="h-8 w-24 text-xs" />
                      {i.packCount != null && i.packSize != null && Number(l.qty) === i.quantity && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{i.packCount} blok × {i.packSize} dona</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" inputMode="decimal" value={l.price} disabled={!editable || busy}
                        onChange={(e) => setLine(i.productId, { price: e.target.value })} className="h-8 w-28 text-xs" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-medium">{sum > 0 ? formatUZS(sum) : "—"}</TableCell>
                    {showFact && (
                      <TableCell className="border-l border-border/60">
                        {factMode ? (
                          <Input type="number" inputMode="decimal" value={facts.get(i.productId) ?? ""}
                            placeholder={String(i.quantity)}
                            onChange={(e) => setFacts((p) => { const n = new Map(p); n.set(i.productId, e.target.value); return n; })}
                            disabled={busy}
                            className="h-7 w-20 px-1.5 text-right text-xs tabular-nums" />
                        ) : (
                          <span className="text-xs tabular-nums">{i.factQty ?? "—"}</span>
                        )}
                      </TableCell>
                    )}
                    {showFact && (() => {
                      const raw = (facts.get(i.productId) ?? "").trim();
                      const fv = factMode ? (raw === "" ? null : Number(raw)) : i.factQty;
                      const diff = fv != null ? fv - i.quantity : null;
                      return (
                        <TableCell className={`text-right tabular-nums text-xs font-semibold ${
                          diff == null ? "text-muted-foreground/40" : diff === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                        }`}>
                          {diff == null ? "—" : diff === 0 ? "✓ 0" : (diff > 0 ? "+" : "") + diff.toLocaleString("uz-UZ")}
                        </TableCell>
                      );
                    })()}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <span className="text-sm"><span className="text-muted-foreground">Jami:</span> <span className="font-bold tabular-nums">{formatUZS(total)}</span></span>
          <span className="flex gap-1.5">
            {factMode && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={saveFacts}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />} Faktni saqlash
              </Button>
            )}
            {editable && (
              <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={saveItems}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Saqlash
              </Button>
            )}
          </span>
        </div>
      </div>

      {/* Izoh */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Izoh</label>
        <Input value={note} disabled={!editable || busy} onChange={(e) => setNote(e.target.value)}
          placeholder="Zakaz haqida izoh..." className="h-9" />
      </div>

      {!editable && (
        <p className="text-xs text-muted-foreground">Bu bosqichda qatorlar sizga tahrir uchun yopiq — workflow bo'yicha mas'ul rol o'zgartiradi.</p>
      )}

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Zakazni o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              #{order.id} ({order.supplier}) o&apos;chiriladi. Bu amalni ortga qaytarib bo&apos;lmaydi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => setDelOpen(false)}>Bekor</Button>
            <Button variant="destructive" className="rounded-xl" disabled={busy} onClick={del}>
              {statusing ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
