"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Loader2, Save, Send, PackageCheck, RotateCcw, Trash2, Truck, FileDown, Star, Copy, ShieldAlert } from "lucide-react";
import type { OshganQator } from "@/lib/zakaz/stockday-limit";
import { cn } from "@/lib/utils";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_TONE, TRANSITION_LABEL, NEXT_STATUSES,
  canTransition, canEditItems, canEnterFact, type OrderStatusT,
} from "../order-status";
import { updateOrderItemsAction, setOrderStatusAction, deleteOrderAction, saveOrderFactAction, sendZakazPdfAction, saveOrderRatingAction } from "../actions";

export type OrderData = {
  id: number;
  status: string;
  note: string;
  supplier: string;
  agent: { name: string; phone: string | null; contactName: string | null } | null;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  rating: number | null; // yetib kelgan zakaz bahosi (1..5)
  ratingNote: string | null;
  // Filial ustunlari (tartib = sortOrder). Bo'sh = eski (jami) zakaz — per-filial ko'rsatilmaydi.
  branches: { id: number; name: string }[];
  items: {
    productId: number; code: number; name: string; sub: string | null; quantity: number; price: number;
    packCount: number | null; packSize: number | null; lead: number | null; factQty: number | null;
    branches: { branchId: number; quantity: number }[]; // shu qatorning filial taqsimoti
  }[];
};

// lead — SKU lead time (kun); pack — pachkadagi dona; bq — filial bo'yicha miqdorlar (pid:bid)
type Line = { qty: string; price: string; lead: string; pack: string; bq: Record<number, string> };

export function OrderDetail({ order, roles, isOwner }: { order: OrderData; roles: readonly string[]; isOwner: boolean }) {
  const router = useRouter();
  const perBranch = order.branches.length > 0;

  const [lines, setLines] = useState<Map<number, Line>>(
    () => new Map(order.items.map((i) => [i.productId, {
      qty: String(i.quantity),
      price: String(i.price),
      lead: i.lead != null ? String(i.lead) : "",
      pack: i.packSize != null ? String(i.packSize) : "",
      bq: Object.fromEntries(i.branches.map((b) => [b.branchId, String(b.quantity)])),
    }]))
  );
  const [facts, setFacts] = useState<Map<number, string>>(
    () => new Map(order.items.map((i) => [i.productId, i.factQty != null ? String(i.factQty) : ""]))
  );
  const [note, setNote] = useState(order.note);
  const [delOpen, setDelOpen] = useState(false);
  // Maksimal zakaz chegarasidan oshgan qatorlar — ACCEPTED tasdiqlash dialogi uchun
  const [excess, setExcess] = useState<{
    rows: OshganQator[];
    status: OrderStatusT;
    okMsg: string;
  } | null>(null);
  const [saving, startSave] = useTransition();
  const [statusing, startStatus] = useTransition();
  const [sending, startSend] = useTransition();
  // Baho (1..5)
  const [ratingVal, setRatingVal] = useState(order.rating ?? 0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingNote, setRatingNote] = useState(order.ratingNote ?? "");
  const [ratingPending, startRating] = useTransition();

  const sendPdf = () =>
    startSend(async () => {
      const res = await sendZakazPdfAction(order.id);
      if (res.ok) toast.success("Nakladnoy Telegram guruhga yuborildi.");
      else toast.error(res.error);
    });

  const saveRating = () => {
    if (ratingVal < 1) { toast.error("Bahoni tanlang (1-5)."); return; }
    startRating(async () => {
      const res = await saveOrderRatingAction({ orderId: order.id, rating: ratingVal, note: ratingNote.trim() || null });
      if (res.ok) { toast.success("Baho saqlandi."); router.refresh(); } else toast.error(res.error);
    });
  };

  const status = order.status as OrderStatusT;
  const editable = canEditItems(roles, status, isOwner);
  const factMode = canEnterFact(roles, status);
  const showFact = factMode || order.items.some((i) => i.factQty != null);
  const allowedNexts = (NEXT_STATUSES[status] ?? []).filter((to) => canTransition(roles, status, to, isOwner));
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
    setLines((prev) => { const n = new Map(prev); const cur = n.get(pid) ?? { qty: "", price: "", lead: "", pack: "", bq: {} }; n.set(pid, { ...cur, ...patch }); return n; });
  const setBranchQty = (pid: number, bid: number, val: string) =>
    setLines((prev) => { const n = new Map(prev); const cur = n.get(pid) ?? { qty: "", price: "", lead: "", pack: "", bq: {} }; n.set(pid, { ...cur, bq: { ...cur.bq, [bid]: val } }); return n; });

  const items = order.items;
  const sumBq = (l: Line | undefined) => order.branches.reduce((s, b) => s + (Number(l?.bq[b.id]) || 0), 0);
  const lineQty = (l: Line | undefined) => (perBranch ? sumBq(l) : Number(l?.qty) || 0);

  /**
   * FAKTNI OMMAVIY TO'LDIRISH — bu ustunning ishlatilmayotganining asosiy sababi
   * qatorma-qator terish edi: jonli bazada 2 666 zakaz qatoridan 0 tasida fakt
   * kiritilgan, holbuki 131 ta zakaz allaqachon "Qabul qilindi" holatida va
   * ta'minotchi ishonchliligi (fill rate) hisoboti aynan shu ustunga tayanadi.
   * Endi "hammasi to'liq keldi" bir bosishda, farqlisi qo'lda tuzatiladi.
   */
  const fillAllFacts = () =>
    setFacts(() => {
      const n = new Map<number, string>();
      for (const i of items) {
        const l = lines.get(i.productId);
        const q = lineQty(l);
        n.set(i.productId, q > 0 ? String(q) : "");
      }
      return n;
    });
  const clearFacts = () => setFacts(() => new Map(items.map((i) => [i.productId, ""])));

  /** Nechta qator to'ldirilgan (tugma yorlig'i va ogohlantirish uchun). */
  const factTold = items.reduce((n, i) => n + ((facts.get(i.productId) ?? "").trim() !== "" ? 1 : 0), 0);


  const total = useMemo(() => {
    let t = 0;
    for (const i of items) { const l = lines.get(i.productId); t += lineQty(l) * (Number(l?.price) || 0); }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, lines, perBranch]);

  const saveItems = () => {
    const payload = items
      .map((i) => {
        const l = lines.get(i.productId)!;
        const price = Number(l.price) || 0;
        const leadN = Number(l.lead);
        const lead = l.lead.trim() !== "" && Number.isInteger(leadN) && leadN >= 0 ? leadN : null;
        const pack = Number(l.pack) > 0 ? Number(l.pack) : null;
        if (perBranch) {
          const branches = order.branches
            .map((b) => ({ branchId: b.id, quantity: Number(l.bq[b.id]) || 0 }))
            .filter((x) => x.quantity > 0);
          const quantity = branches.reduce((s, b) => s + b.quantity, 0);
          return {
            productId: i.productId, quantity, price,
            packCount: pack ? Math.round((quantity / pack) * 1000) / 1000 : null, // jami blok = dona ÷ pachka
            packSize: pack, leadTimeDays: lead, branches,
          };
        }
        const qty = Number(l.qty) || 0;
        return {
          productId: i.productId, quantity: qty, price,
          packCount: qty === i.quantity && pack === i.packSize ? i.packCount : null,
          packSize: pack, leadTimeDays: lead,
        };
      })
      .filter((x) => x.quantity > 0);
    if (payload.length === 0) { toast.error("Kamida bitta SKU miqdori kerak."); return; }
    startSave(async () => {
      const res = await updateOrderItemsAction(order.id, payload, note);
      if (res.ok) { toast.success("Saqlandi."); router.refresh(); } else toast.error(res.error);
    });
  };

  /**
   * Holatni o'zgartirish. ACCEPTED da server MAKSIMAL ZAKAZ chegarasidan oshgan
   * qatorlarni qaytarsa (`needsConfirm`) — ro'yxat ko'rsatiladi va tasdiq so'raladi.
   * Bloklamaydi: mavsum/aksiya uchun ataylab ko'p olinishi mumkin.
   */
  const changeStatus = (st: OrderStatusT, okMsg: string, confirmExcess = false) =>
    startStatus(async () => {
      const res = await setOrderStatusAction(order.id, st, confirmExcess ? { confirmExcess: true } : undefined);
      if (res.ok) {
        setExcess(null);
        toast.success(okMsg);
        router.refresh();
        return;
      }
      if ("needsConfirm" in res) {
        setExcess({ rows: res.excess, status: st, okMsg });
        return;
      }
      toast.error(res.error);
    });

  const del = () =>
    startStatus(async () => {
      const res = await deleteOrderAction(order.id);
      if (res.ok) { toast.success("Zakaz o'chirildi."); router.push("/sotuv/sotib-olish"); } else toast.error(res.error);
    });

  // toLocaleString EMAS — server/brauzer locale/TZ farqi hydration mismatch beradi.
  const fmtDate = (s: string | null) => (s ? formatDateTimeUZ(s) : "—");

  // Ustun soni (colSpan emas, header bilan moslik uchun hisob): base + filial/qty
  return (
    <div className="space-y-4">
      {/* Sarlavha + holat + amallar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Truck className="h-4 w-4 text-muted-foreground" /> {order.supplier}</span>
        {order.agent && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            · {order.agent.name}
            {(order.agent.contactName || order.agent.phone) && (
              <span className="text-xs font-normal text-muted-foreground">({[order.agent.contactName, order.agent.phone].filter(Boolean).join(" · ")})</span>
            )}
          </span>
        )}
        <Pill tone={ORDER_STATUS_TONE[order.status] ?? "muted"}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Pill>
        <span className="text-xs text-muted-foreground">Yaratdi: {order.createdBy} · {fmtDate(order.createdAt)}</span>
        {order.sentAt && <span className="text-xs text-muted-foreground">Yuborildi: {fmtDate(order.sentAt)}</span>}
        {order.receivedAt && <span className="text-xs text-muted-foreground">Qabul: {fmtDate(order.receivedAt)}</span>}

        {perBranch && (
          <a
            href={`/api/zakaz/${order.id}/pdf?variant=withBranch`}
            target="_blank"
            rel="noopener noreferrer"
            title="Filiallar bo'yicha nakladnoy (har filial alohida ustun)"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <FileDown className="h-3.5 w-3.5" /> Nakladnoy (filial)
          </a>
        )}
        <a
          href={`/api/zakaz/${order.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          title="Yetkazib beruvchiga yuborish uchun tayyor nakladnoy (faqat jami)"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <FileDown className="h-3.5 w-3.5" /> {perBranch ? "Nakladnoy (jami)" : "Nakladnoy (PDF)"}
        </a>

        <button
          onClick={sendPdf}
          disabled={sending}
          title="Nakladnoyni PDF qilib Telegram guruhga (topic) yuborish"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Telegramga yuborish
        </button>

        <Link
          href={`/sotuv/sotib-olish/yangi?from=${order.id}`}
          title="Shu zakaz asosida yangi zakaz yaratish (miqdor va filial taqsimoti bilan to'ldiriladi)"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" /> Qayta zakaz
        </Link>

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
          {status === "DRAFT" && (roles.includes("SYSTEM_ADMIN") || roles.includes("ADMIN") || isOwner) && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" disabled={busy} onClick={() => setDelOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> O'chirish
            </Button>
          )}
        </div>
      </div>

      {/* Fakt kiritilmagan bo'lsa — nima uchun kerakligi bilan birga eslatma.
          Jimgina bo'sh ustun turgani uchun bu ma'lumot umuman yig'ilmayotgan edi. */}
      {factMode && factTold === 0 && !order.items.some((i) => i.factQty != null) && (
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm">
          <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">Fakt miqdor kiritilmagan</p>
            <p className="text-muted-foreground">
              Ta&apos;minotchi qancha va&apos;da qilib, qancha keltirgani shu ustundan o&apos;lchanadi
              (Logistika → ta&apos;minotchi hisobotidagi &quot;fill rate&quot;). To&apos;liq kelgan bo&apos;lsa —
              &quot;Hammasi to&apos;liq keldi&quot; tugmasi, farq bo&apos;lgan qatorlarnigina tuzatasiz.
            </p>
          </div>
        </div>
      )}

      {/* Yetkazib berish bahosi (1..5) — ACCEPTED/RECEIVED bosqichida yoki baholangan bo'lsa */}
      {(factMode || order.rating != null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">Yetkazib berish bahosi:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={!factMode || ratingPending}
                onMouseEnter={() => factMode && setRatingHover(n)} onMouseLeave={() => setRatingHover(0)}
                onClick={() => factMode && setRatingVal(n)}
                className={cn(factMode ? "cursor-pointer" : "cursor-default")} aria-label={`${n} ball`}>
                <Star className={cn("h-6 w-6 transition-colors", (ratingHover || ratingVal) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
              </button>
            ))}
            {ratingVal > 0 && <span className="ml-1.5 text-sm font-semibold tabular-nums">{ratingVal}/5</span>}
          </div>
          {factMode ? (
            <>
              <Input value={ratingNote} onChange={(e) => setRatingNote(e.target.value)} disabled={ratingPending}
                placeholder="Izoh (ixtiyoriy)" className="h-9 max-w-xs flex-1" />
              <Button size="sm" className="h-9 gap-1.5" disabled={ratingPending || ratingVal < 1} onClick={saveRating}>
                {ratingPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />} Bahoni saqlash
              </Button>
            </>
          ) : (
            order.ratingNote && <span className="text-sm text-muted-foreground">— {order.ratingNote}</span>
          )}
        </div>
      )}

      {/* Qatorlar */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[80px]">Kod</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="w-[140px]">Subkategoriya</TableHead>
                <TableHead className="w-[70px]" title="Lead time (kun) — zakazdan kelguncha; SKU'ga saqlanadi">Lead</TableHead>
                <TableHead className="w-[80px]" title="Pachkadagi dona soni — SKU'ga saqlanadi">Pachka</TableHead>
                {perBranch ? (
                  <>
                    {order.branches.map((b) => (
                      <TableHead key={b.id} className="w-[90px] text-right" title={`${b.name} — shu filialga miqdor (dona)`}>{b.name}</TableHead>
                    ))}
                    <TableHead className="w-[90px] text-right border-l border-border/60" title="Jami = filiallar yig'indisi">Jami</TableHead>
                  </>
                ) : (
                  <TableHead className="w-[110px]">Miqdor</TableHead>
                )}
                <TableHead className="w-[120px]">Narx</TableHead>
                <TableHead className="text-right w-[120px]">Summa</TableHead>
                {showFact && <TableHead className="w-[100px] border-l border-border/60" title="FAKT yetib kelgan miqdor">Fakt</TableHead>}
                {showFact && <TableHead className="text-right w-[90px]">Farq</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const l = lines.get(i.productId) ?? { qty: "", price: "", lead: "", pack: "", bq: {} };
                const qty = lineQty(l);
                // Effektiv pachka: kiritilgan yoki SKU'da eslab qolingan (katak tozalansa ham blok ko'rinsin)
                const pack = Number(l.pack) > 0 ? Number(l.pack) : (i.packSize ?? 0);
                const sum = qty * (Number(l.price) || 0);
                return (
                  <TableRow key={i.productId} className="text-sm">
                    <TableCell className="font-mono text-xs text-muted-foreground">{i.code}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={i.name}>{i.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.sub ?? "—"}</TableCell>
                    <TableCell>
                      <Input type="number" inputMode="numeric" value={l.lead} disabled={!editable || busy}
                        placeholder={i.lead != null ? String(i.lead) : ""}
                        onChange={(e) => setLine(i.productId, { lead: e.target.value })}
                        className="h-8 w-16 text-xs tabular-nums" title="Lead time (kun) — SKU'ga saqlanadi" aria-label="Lead time (kun)" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" inputMode="decimal" value={l.pack} disabled={!editable || busy}
                        placeholder={i.packSize != null ? String(i.packSize) : ""}
                        onChange={(e) => setLine(i.productId, { pack: e.target.value })}
                        className="h-8 w-16 text-xs tabular-nums" title="Pachkadagi dona soni — SKU'ga saqlanadi" aria-label="Pachkadagi dona soni" />
                    </TableCell>
                    {perBranch ? (
                      <>
                        {order.branches.map((b) => (
                          <TableCell key={b.id} className="px-2">
                            <Input type="number" inputMode="decimal" value={l.bq[b.id] ?? ""} disabled={!editable || busy}
                              onChange={(e) => setBranchQty(i.productId, b.id, e.target.value)}
                              className="h-8 w-16 px-1.5 text-right text-xs tabular-nums" aria-label={`${b.name} miqdor (dona)`} />
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums text-xs font-semibold border-l border-border/60">
                          {qty > 0 ? qty.toLocaleString("uz-UZ") : "—"}
                          {pack > 0 && qty > 0 && (
                            <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                              {(Math.round((qty / pack) * 1000) / 1000).toLocaleString("uz-UZ")} blok
                            </p>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell>
                        <Input type="number" inputMode="decimal" value={l.qty} disabled={!editable || busy}
                          onChange={(e) => setLine(i.productId, { qty: e.target.value })} className="h-8 w-24 text-xs" />
                        {i.packCount != null && i.packSize != null && Number(l.qty) === i.quantity && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{i.packCount} blok × {i.packSize} dona</p>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Input type="number" inputMode="decimal" value={l.price} disabled={!editable || busy}
                        onChange={(e) => setLine(i.productId, { price: e.target.value })} className="h-8 w-28 text-xs" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-medium">{sum > 0 ? formatUZS(sum) : "—"}</TableCell>
                    {showFact && (
                      <TableCell className="border-l border-border/60">
                        {factMode ? (
                          <Input type="number" inputMode="decimal" value={facts.get(i.productId) ?? ""}
                            placeholder={String(qty)}
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
                      const diff = fv != null ? fv - qty : null;
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
              <>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={fillAllFacts}
                  title="Har qatorga zakaz miqdorini qo'yadi — farq bo'lgan qatorlarnigina tuzatasiz">
                  <PackageCheck className="h-3.5 w-3.5" /> Hammasi to&apos;liq keldi
                </Button>
                {factTold > 0 && (
                  <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" disabled={busy} onClick={clearFacts}>
                    Tozalash
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={saveFacts}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                  Faktni saqlash{factTold > 0 ? ` (${factTold}/${items.length})` : ""}
                </Button>
              </>
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

      {/* MAKSIMAL ZAKAZ nazorati — chegaradan oshgan qatorlar tasdiqlanadi */}
      <Dialog open={excess != null} onOpenChange={(o) => !o && setExcess(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Ortiqcha zaxira — {excess?.rows.length} SKU
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Bu SKU&apos;larda kelgan tovar belgilangan chegaradan uzoqroq vaqtga yetadi.
              Mavsum yoki aksiya uchun ataylab shunday olingan bo&apos;lsa — tasdiqlang.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 bg-muted/40 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">SKU</th>
                  <th className="px-2 py-2 text-right font-semibold">Zakaz</th>
                  <th className="px-2 py-2 text-right font-semibold">Qoldiq</th>
                  <th className="px-2 py-2 text-right font-semibold">Zaxira</th>
                  <th className="px-2 py-2 text-right font-semibold">Sig&apos;adigan</th>
                </tr>
              </thead>
              <tbody>
                {excess?.rows.map((r) => (
                  <tr key={r.productId} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-1.5">
                      <div className="max-w-[220px] truncate" title={r.name}>{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.code}
                        {r.kategoriya && ` · ${r.kategoriya}`}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      {Math.round(r.qty).toLocaleString("uz-UZ")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {Math.round(r.stock).toLocaleString("uz-UZ")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-destructive">
                      {Math.round(r.natijaviy)} kun
                      <div className="text-[11px] font-normal text-muted-foreground">
                        chegara {r.limit}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.ruxsatEtilgan.toLocaleString("uz-UZ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => setExcess(null)}>
              Bekor — tuzataman
            </Button>
            <Button
              className="rounded-xl"
              disabled={busy}
              onClick={() => excess && changeStatus(excess.status, excess.okMsg, true)}
            >
              {statusing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tasdiqlab davom etish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
