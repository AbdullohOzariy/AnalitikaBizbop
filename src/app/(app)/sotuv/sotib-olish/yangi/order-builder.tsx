"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { skuRowBg, skuBadgeCls, skuBadgeLabel, skuBadgeTitle } from "@/lib/sku-rang";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, X, Loader2, Save } from "lucide-react";
import { formatUZS } from "@/lib/format";
import {
  suppliersForOrderAction, supplierItemsAction, createOrderAction,
  type SupplierOption, type BuilderItem,
} from "../actions";

type Line = { qty: string; price: string };

export function OrderBuilder() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [lines, setLines] = useState<Map<number, Line>>(new Map());
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [loadingSup, startSup] = useTransition();
  const [loadingItems, startItems] = useTransition();
  const [saving, startSave] = useTransition();

  useEffect(() => {
    startSup(async () => {
      const res = await suppliersForOrderAction();
      if (res.ok) setSuppliers(res.suppliers);
      else toast.error(res.error);
    });
  }, []);

  const onSupplier = (v: string) => {
    setSupplierId(v);
    setItems([]); setLines(new Map()); setQ("");
    if (!v) return;
    startItems(async () => {
      const res = await supplierItemsAction(Number(v));
      if (res.ok) {
        setItems(res.items);
        // taklif miqdorini oldindan to'ldiramiz (narx bo'sh)
        const m = new Map<number, Line>();
        for (const it of res.items) if (it.suggested > 0) m.set(it.productId, { qty: String(it.suggested), price: "" });
        setLines(m);
      } else toast.error(res.error);
    });
  };

  const setLine = (pid: number, patch: Partial<Line>) =>
    setLines((prev) => {
      const n = new Map(prev);
      const cur = n.get(pid) ?? { qty: "", price: "" };
      n.set(pid, { ...cur, ...patch });
      return n;
    });

  const Q = q.trim().toUpperCase();
  const shown = useMemo(
    () => (Q ? items.filter((i) => i.name.toUpperCase().includes(Q) || String(i.code).includes(Q)) : items),
    [items, Q]
  );

  const chosen = useMemo(() => {
    const out: { productId: number; quantity: number; price: number }[] = [];
    for (const [pid, l] of lines) {
      const qty = Number(l.qty); const price = Number(l.price) || 0;
      if (qty > 0) out.push({ productId: pid, quantity: qty, price });
    }
    return out;
  }, [lines]);
  const total = useMemo(() => chosen.reduce((s, c) => s + c.quantity * c.price, 0), [chosen]);

  // Tanlangan ta'minotchining zakaz kunlari hinti (profilda belgilanadi).
  // Joriy vaqt faqat mount'da o'qiladi (render purity); hisob arzon — memo shart emas.
  const [hintNow] = useState(() => new Date());
  const orderDayHint = (() => {
    const sup = suppliers.find((s) => String(s.id) === supplierId);
    if (!sup || sup.orderWeekdays.length === 0) return null;
    const WD = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
    for (let off = 0; off < 7; off++) {
      const d = new Date(hintNow.getFullYear(), hintNow.getMonth(), hintNow.getDate() + off);
      if (sup.orderWeekdays.includes(d.getDay())) {
        return {
          today: off === 0,
          label: off === 0 ? "Bugun zakaz kuni" : `Keyingi zakaz kuni: ${off === 1 ? "ertaga" : WD[d.getDay()]} (${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")})`,
        };
      }
    }
    return null;
  })();

  const save = () => {
    if (!supplierId) { toast.error("Ta'minotchi tanlang."); return; }
    if (chosen.length === 0) { toast.error("Kamida bitta SKU uchun miqdor kiriting."); return; }
    startSave(async () => {
      const res = await createOrderAction({ supplierId: Number(supplierId), items: chosen, note });
      if (res.ok) { toast.success("Zakaz yaratildi (qoralama)."); router.push(`/sotuv/sotib-olish/${res.id}`); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ta'minotchi</Label>
          <Select value={supplierId} onValueChange={(v) => onSupplier(v ?? "")} disabled={loadingSup || saving}>
            <SelectTrigger className="h-9 w-72 text-sm">
              <SelectValue placeholder={loadingSup ? "Yuklanmoqda…" : "Ta'minotchi tanlang…"} />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.skuCount} SKU</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {items.length > 0 && (
          <div className="relative min-w-56 flex-1">
            <Label className="text-xs text-muted-foreground">Qidirish</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
              {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        )}
      </div>

      {orderDayHint && (
        <div className={orderDayHint.today
          ? "rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
          : "rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"}>
          {orderDayHint.today ? "✓ " : "⏳ "}{orderDayHint.label}
        </div>
      )}

      {loadingItems ? (
        <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> SKU'lar yuklanmoqda…</p>
      ) : !supplierId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Boshlash uchun ta'minotchi tanlang.</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Bu ta'minotchida sizning kategoriyangizда SKU yo'q.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[80px]">Kod</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right w-[80px]">Qoldiq</TableHead>
                    <TableHead className="text-right w-[80px]">Sotuv</TableHead>
                    <TableHead className="text-right w-[70px]" title="Lead time — zakazdan kelguncha kunlar">Lead</TableHead>
                    <TableHead className="w-[110px]">Miqdor</TableHead>
                    <TableHead className="w-[120px]">Narx</TableHead>
                    <TableHead className="text-right w-[120px]">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((it) => {
                    const l = lines.get(it.productId) ?? { qty: "", price: "" };
                    const sum = (Number(l.qty) || 0) * (Number(l.price) || 0);
                    return (
                      // Fon — SKU'ning ABC×XYZ matritsa holatiga ko'ra (AX buyurtmada ustuvor!)
                      <TableRow key={it.productId} className={cn("text-sm", skuRowBg(it.abc, it.xyz))}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            {it.code}
                            <span
                              title={skuBadgeTitle(it.abc, it.xyz)}
                              className={cn("rounded border px-1 py-px text-[9px] font-bold leading-none", skuBadgeCls(it.abc, it.xyz))}
                            >
                              {skuBadgeLabel(it.abc, it.xyz)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate" title={it.name}>{it.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.stock.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.sold.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.lead != null ? `${it.lead} kun` : "—"}</TableCell>
                        <TableCell>
                          <Input type="number" inputMode="decimal" value={l.qty} placeholder={String(it.suggested)}
                            onChange={(e) => setLine(it.productId, { qty: e.target.value })} className="h-8 w-24 text-xs" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" inputMode="decimal" value={l.price} placeholder="narx"
                            onChange={(e) => setLine(it.productId, { price: e.target.value })} className="h-8 w-28 text-xs" />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">{sum > 0 ? formatUZS(sum) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Izoh (ixtiyoriy)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zakaz haqida izoh..." className="h-9" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Tanlandi:</span> <span className="font-medium">{chosen.length} SKU</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Jami:</span> <span className="font-bold tabular-nums">{formatUZS(total)}</span>
            </div>
            <Button onClick={save} disabled={saving || chosen.length === 0} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Saqlash (qoralama)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
