"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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

// qty (dona) — saqlanadigan asosiy qiymat; blok×pack kiritilsa qty avtomatik hisoblanadi
type Line = { qty: string; price: string; blok: string; pack: string };

export function OrderBuilder({ initialSupplierId }: { initialSupplierId?: number }) {
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
        for (const it of res.items) {
          if (it.suggested > 0) {
            m.set(it.productId, { qty: String(it.suggested), price: it.purchasePrice != null ? String(it.purchasePrice) : "", blok: "", pack: it.packSize != null ? String(it.packSize) : "" });
          }
        }
        setLines(m);
      } else toast.error(res.error);
    });
  };

  useEffect(() => {
    startSup(async () => {
      const res = await suppliersForOrderAction();
      if (res.ok) {
        setSuppliers(res.suppliers);
        // "Bugun" sahifasidan kelganda ta'minotchi oldindan tanlanadi
        if (initialSupplierId && res.suppliers.some((s) => s.id === initialSupplierId)) {
          onSupplier(String(initialSupplierId));
        }
      } else toast.error(res.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat mount'da
  }, []);


  const setLine = (pid: number, patch: Partial<Line>) =>
    setLines((prev) => {
      const n = new Map(prev);
      const cur = n.get(pid) ?? { qty: "", price: "", blok: "", pack: "" };
      const next = { ...cur, ...patch };
      // Blok × Pachka kiritilsa — dona avtomatik (masalan 5 × 12 = 60)
      if (patch.blok !== undefined || patch.pack !== undefined) {
        const b = Number(next.blok);
        const p = Number(next.pack);
        if (b > 0 && p > 0) next.qty = String(b * p);
      }
      // Dona qo'lda kiritilsa — blok hisobi eskiradi, tozalaymiz (pachka qoladi)
      if (patch.qty !== undefined) next.blok = "";
      n.set(pid, next);
      return n;
    });

  const Q = q.trim().toUpperCase();
  const shown = useMemo(
    () => (Q ? items.filter((i) => i.name.toUpperCase().includes(Q) || String(i.code).includes(Q)) : items),
    [items, Q]
  );

  // Enter — o'sha ustun bo'ylab keyingi qatorga (profil editoridagi kabi tez kiritish)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const regRef = (pid: number, field: string) => (el: HTMLInputElement | null) => {
    const k = `${pid}:${field}`;
    if (el) inputRefs.current.set(k, el);
    else inputRefs.current.delete(k);
  };
  const onEnterNext = (pid: number, field: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order = shown.map((s) => s.productId);
    for (let j = order.indexOf(pid) + 1; j < order.length; j++) {
      const el = inputRefs.current.get(`${order[j]}:${field}`);
      if (el) { el.focus(); el.select(); break; }
    }
  };


  const itemByPid = useMemo(() => new Map(items.map((i) => [i.productId, i])), [items]);
  const chosen = useMemo(() => {
    const out: { productId: number; quantity: number; price: number; packCount: number | null; packSize: number | null }[] = [];
    for (const [pid, l] of lines) {
      const qty = Number(l.qty);
      // Narx kiritilmagan bo'lsa — eslab qolingan narx (placeholder'da ko'rinadi)
      const price = Number(l.price) || itemByPid.get(pid)?.purchasePrice || 0;
      const blok = Number(l.blok); const pack = Number(l.pack);
      if (qty > 0) {
        out.push({
          productId: pid, quantity: qty, price,
          packCount: blok > 0 ? blok : null,
          packSize: pack > 0 ? pack : null,
        });
      }
    }
    return out;
  }, [lines, itemByPid]);
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

      {items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Min stock = kunlik sotuv × (zakaz oralig'i + lead time) × XYZ buferi (X 1.1 · Y 1.25 · Z 1.5).
          ⚠ — qoldiq min stock'dan past. Xira qiymatlar — eslab qolingan taklif (bo'sh qoldirsangiz o'sha ishlatiladi).
          Enter — ustun bo'ylab keyingi qatorga.
        </p>
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
                    <TableHead className="text-right w-[80px]" title="Kunlik o'rtacha sotuv (oxirgi ma'lumot oynasi, filiallar yig'indisi)">Kunlik</TableHead>
                    <TableHead className="text-right w-[90px]" title="Min stock = kunlik sotuv × (zakaz oralig'i + lead time) × XYZ buferi">Min stock</TableHead>
                    <TableHead className="text-right w-[70px]" title="Lead time — zakazdan kelguncha kunlar">Lead</TableHead>
                    <TableHead className="w-[130px] border-l border-border/60 bg-primary/[0.03]" title="Blok/yashik soni × pachkadagi dona — Miqdor avtomatik hisoblanadi">Blok × Pachka</TableHead>
                    <TableHead className="w-[90px] bg-primary/[0.03]">Miqdor</TableHead>
                    <TableHead className="w-[110px] bg-primary/[0.03]">Narx (dona)</TableHead>
                    <TableHead className="text-right w-[120px]">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((it) => {
                    const l = lines.get(it.productId) ?? { qty: "", price: "", blok: "", pack: "" };
                    const sum = (Number(l.qty) || 0) * (Number(l.price) || it.purchasePrice || 0);
                    const picked = Number(l.qty) > 0;
                    return (
                      // Fon: tanlangan — yashil (zakazga kiradi); aks holda ABC×XYZ matritsa rangi
                      <TableRow key={it.productId}
                        className={cn("text-sm", picked ? "bg-emerald-500/10 hover:bg-emerald-500/15" : skuRowBg(it.abc, it.xyz))}>
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
                        <TableCell className="max-w-[260px]" title={it.name}>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{it.name}</span>
                            {it.arxiv && (
                              <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-px text-[9px] font-semibold uppercase text-muted-foreground"
                                title="Arxivlangan (no-aktiv) — yana sotila boshlasa avtomatik aktivga qaytadi">
                                no aktiv
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.stock.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {it.dailyAvg > 0 ? it.dailyAvg.toLocaleString("uz-UZ", { maximumFractionDigits: 1 }) : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {it.minStock == null ? (
                            <span className="text-muted-foreground/40" title="Lead time kiritilmagan — ta'minotchi profilida to'ldiring">—</span>
                          ) : it.stock < it.minStock ? (
                            <span className="font-bold text-destructive" title="Qoldiq min stock'dan past — buyurtma shart!">
                              ⚠ {it.minStock.toLocaleString("uz-UZ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{it.minStock.toLocaleString("uz-UZ")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.lead != null ? `${it.lead} kun` : <span className="text-muted-foreground/40">—</span>}</TableCell>
                        <TableCell className="border-l border-border/60 bg-primary/[0.03] px-2">
                          <span className="flex items-center gap-1">
                            <Input ref={regRef(it.productId, "blok")} type="number" inputMode="numeric" value={l.blok}
                              placeholder={it.packSize && it.suggested > 0 ? String(Math.ceil(it.suggested / it.packSize)) : ""}
                              onChange={(e) => setLine(it.productId, { blok: e.target.value })}
                              onKeyDown={onEnterNext(it.productId, "blok")}
                              className="h-7 w-14 px-1.5 text-right text-xs tabular-nums" title="Blok/yashik soni" aria-label="Blok soni" />
                            <span className="text-[10px] text-muted-foreground/60">×</span>
                            <Input ref={regRef(it.productId, "pack")} type="number" inputMode="numeric" value={l.pack}
                              placeholder={it.packSize != null ? String(it.packSize) : ""}
                              onChange={(e) => setLine(it.productId, { pack: e.target.value })}
                              onKeyDown={onEnterNext(it.productId, "pack")}
                              className="h-7 w-14 px-1.5 text-right text-xs tabular-nums" title="Pachkadagi dona soni (SKU'da eslab qolinadi)" aria-label="Pachka hajmi" />
                          </span>
                        </TableCell>
                        <TableCell className="bg-primary/[0.03] px-2">
                          <Input ref={regRef(it.productId, "qty")} type="number" inputMode="decimal" value={l.qty}
                            placeholder={it.suggested > 0 ? String(it.suggested) : ""}
                            onChange={(e) => setLine(it.productId, { qty: e.target.value })}
                            onKeyDown={onEnterNext(it.productId, "qty")}
                            className="h-7 w-20 px-1.5 text-right text-xs tabular-nums" aria-label="Miqdor (dona)" />
                        </TableCell>
                        <TableCell className="bg-primary/[0.03] px-2">
                          <Input ref={regRef(it.productId, "price")} type="number" inputMode="decimal" value={l.price}
                            placeholder={it.purchasePrice != null ? String(it.purchasePrice) : ""}
                            onChange={(e) => setLine(it.productId, { price: e.target.value })}
                            onKeyDown={onEnterNext(it.productId, "price")}
                            className="h-7 w-24 px-1.5 text-right text-xs tabular-nums" aria-label="Dona narxi" />
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums text-xs", sum > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/40")}>
                          {sum > 0 ? formatUZS(sum) : "—"}
                        </TableCell>
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

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            <div className="text-sm">
              <span className="text-muted-foreground">Tanlandi:</span> <span className="font-semibold text-emerald-700 dark:text-emerald-400">{chosen.length} SKU</span>
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
