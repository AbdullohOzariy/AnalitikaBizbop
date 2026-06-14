"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { skuRowBg, skuBadgeCls, skuBadgeLabel, skuBadgeTitle } from "@/lib/sku-rang";
import { GROUP_COLORS, norm } from "../../../iyerarxiya/colors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, X, Loader2, Save, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { formatUZS } from "@/lib/format";
import {
  suppliersForOrderAction, supplierItemsAction, createOrderAction,
  type SupplierOption, type BuilderItem,
} from "../actions";
import { hisobMinStock } from "../order-status";

// qty (dona) — saqlanadigan asosiy qiymat; blok×pack kiritilsa qty avtomatik hisoblanadi.
// lead — zakaz berishda kiritilsa SKU'ga bog'lanadi (eslab qolinadi).
type Line = { qty: string; price: string; blok: string; pack: string; lead: string };

// Iyerarxiya daraxti tugunlari (guruh → kategoriya → subkategoriya → SKU)
type SubNode = { id: number; name: string; sort: number; items: BuilderItem[] };
type CatNode = { id: number; name: string; sort: number; subs: SubNode[]; direct: BuilderItem[] };
type GroupNode = { id: number; name: string; sort: number; cats: CatNode[]; skuCount: number };

export function OrderBuilder({ initialSupplierId }: { initialSupplierId?: number }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [lines, setLines] = useState<Map<number, Line>>(new Map());
  const [orderGap, setOrderGap] = useState(1);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [loadingSup, startSup] = useTransition();
  const [loadingItems, startItems] = useTransition();
  const [saving, startSave] = useTransition();
  // Yig'ilgan (collapsed) tugunlar — bo'sh = hammasi ochiq (default)
  const [closedG, setClosedG] = useState<Set<number>>(new Set());
  const [closedC, setClosedC] = useState<Set<string>>(new Set()); // `${groupId}:${catId}` — sintetik -1 kategoriya guruhlar aro to'qnashmasin
  const [closedS, setClosedS] = useState<Set<number>>(new Set());

  const onSupplier = (v: string) => {
    setSupplierId(v);
    setItems([]); setLines(new Map()); setQ("");
    setClosedG(new Set()); setClosedC(new Set()); setClosedS(new Set());
    if (!v) return;
    startItems(async () => {
      const res = await supplierItemsAction(Number(v));
      if (res.ok) {
        setItems(res.items);
        setOrderGap(res.orderGap);
        // taklif miqdorini oldindan to'ldiramiz (narx bo'sh)
        const m = new Map<number, Line>();
        for (const it of res.items) {
          if (it.suggested > 0) {
            m.set(it.productId, { qty: String(it.suggested), price: it.purchasePrice != null ? String(it.purchasePrice) : "", blok: "", pack: it.packSize != null ? String(it.packSize) : "", lead: "" });
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
        // "Bugun" sahifasidan kelganda yetkazib beruvchi oldindan tanlanadi
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
      const cur = n.get(pid) ?? { qty: "", price: "", blok: "", pack: "", lead: "" };
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
  const searching = Q.length > 0;
  const shown = useMemo(
    () => (Q ? items.filter((i) => i.name.toUpperCase().includes(Q) || String(i.code).includes(Q)) : items),
    [items, Q]
  );

  // Ko'rinadigan SKU'larni iyerarxiya daraxtiga yig'amiz + tartibga solamiz.
  // orderedPids — Enter bilan ustun bo'ylab o'tish uchun ko'rinish tartibidagi pid'lar.
  const { tree, orderedPids } = useMemo(() => {
    const gMap = new Map<number, { id: number; name: string; sort: number; cats: Map<number, { id: number; name: string; sort: number; subs: Map<number, SubNode>; direct: BuilderItem[] }> }>();
    for (const it of shown) {
      const gid = it.groupId ?? -1;
      let g = gMap.get(gid);
      if (!g) { g = { id: gid, name: it.groupName ?? "Boshqa", sort: it.groupSort, cats: new Map() }; gMap.set(gid, g); }
      const cid = it.catId ?? -1;
      let c = g.cats.get(cid);
      if (!c) { c = { id: cid, name: it.catName ?? "Boshqa", sort: it.catSort, subs: new Map(), direct: [] }; g.cats.set(cid, c); }
      if (it.subId != null) {
        let s = c.subs.get(it.subId);
        if (!s) { s = { id: it.subId, name: it.subName ?? "—", sort: it.subSort, items: [] }; c.subs.set(it.subId, s); }
        s.items.push(it);
      } else c.direct.push(it);
    }
    // Sintetik tugun (id<0 — "Boshqa", guruh/kategoriyasiz) doim oxirida
    const bySort = <T extends { id: number; sort: number; name: string }>(a: T, b: T) =>
      (a.id < 0 ? 1 : 0) - (b.id < 0 ? 1 : 0) || a.sort - b.sort || a.name.localeCompare(b.name, "uz");
    const orderedPids: number[] = [];
    const tree: GroupNode[] = [...gMap.values()].sort(bySort).map((g) => {
      const cats: CatNode[] = [...g.cats.values()].sort(bySort).map((c) => ({
        id: c.id, name: c.name, sort: c.sort, subs: [...c.subs.values()].sort(bySort), direct: c.direct,
      }));
      let skuCount = 0;
      for (const c of cats) {
        for (const it of c.direct) { orderedPids.push(it.productId); skuCount++; }
        for (const s of c.subs) for (const it of s.items) { orderedPids.push(it.productId); skuCount++; }
      }
      return { id: g.id, name: g.name, sort: g.sort, cats, skuCount };
    });
    return { tree, orderedPids };
  }, [shown]);

  function makeToggle<T>(set: React.Dispatch<React.SetStateAction<Set<T>>>) {
    return (id: T) => set((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const toggleG = makeToggle(setClosedG);
  const toggleC = makeToggle(setClosedC);
  const toggleS = makeToggle(setClosedS);

  const allCollapsed = tree.length > 0 && tree.every((g) => closedG.has(g.id));
  const toggleAll = () => {
    if (allCollapsed) { setClosedG(new Set()); setClosedC(new Set()); setClosedS(new Set()); }
    else setClosedG(new Set(tree.map((g) => g.id)));
  };

  // Enter — o'sha ustun bo'ylab keyingi (ko'rinadigan) qatorga
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const regRef = (pid: number, field: string) => (el: HTMLInputElement | null) => {
    const k = `${pid}:${field}`;
    if (el) inputRefs.current.set(k, el);
    else inputRefs.current.delete(k);
  };
  const onEnterNext = (pid: number, field: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    for (let j = orderedPids.indexOf(pid) + 1; j < orderedPids.length; j++) {
      const el = inputRefs.current.get(`${orderedPids[j]}:${field}`);
      if (el) { el.focus(); el.select(); break; }
    }
  };


  const itemByPid = useMemo(() => new Map(items.map((i) => [i.productId, i])), [items]);
  const chosen = useMemo(() => {
    const out: { productId: number; quantity: number; price: number; packCount: number | null; packSize: number | null; leadTimeDays: number | null }[] = [];
    for (const [pid, l] of lines) {
      const qty = Number(l.qty);
      // Narx kiritilmagan bo'lsa — eslab qolingan narx (placeholder'da ko'rinadi)
      const price = Number(l.price) || itemByPid.get(pid)?.purchasePrice || 0;
      const blok = Number(l.blok); const pack = Number(l.pack);
      if (qty > 0) {
        const lead = Number(l.lead);
        out.push({
          productId: pid, quantity: qty, price,
          packCount: blok > 0 ? blok : null,
          packSize: pack > 0 ? pack : null,
          // Kiritilgan lead SKU'ga bog'lanadi (eslab qolinadi)
          leadTimeDays: l.lead.trim() !== "" && Number.isInteger(lead) && lead >= 0 ? lead : null,
        });
      }
    }
    return out;
  }, [lines, itemByPid]);
  const total = useMemo(() => chosen.reduce((s, c) => s + c.quantity * c.price, 0), [chosen]);

  // Tanlangan yetkazib beruvchining zakaz kunlari hinti (profilda belgilanadi).
  // Joriy vaqt faqat mount'da o'qiladi (render purity); hisob arzon — memo shart emas.
  const [hintNow] = useState(() => new Date());
  const orderDayHint = (() => {
    const sup = suppliers.find((s) => String(s.id) === supplierId);
    if (!sup?.nextOrderDate) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${hintNow.getFullYear()}-${pad(hintNow.getMonth() + 1)}-${pad(hintNow.getDate())}`;
    const tomorrowD = new Date(hintNow.getFullYear(), hintNow.getMonth(), hintNow.getDate() + 1);
    const tomorrowStr = `${tomorrowD.getFullYear()}-${pad(tomorrowD.getMonth() + 1)}-${pad(tomorrowD.getDate())}`;
    const [, m, d] = sup.nextOrderDate.split("-");
    return {
      today: sup.nextOrderDate === todayStr,
      label: sup.nextOrderDate === todayStr
        ? "Bugun zakaz kuni"
        : `Keyingi zakaz kuni: ${sup.nextOrderDate === tomorrowStr ? "ertaga" : ""} (${d}.${m})`,
    };
  })();

  const save = () => {
    if (!supplierId) { toast.error("Yetkazib beruvchi tanlang."); return; }
    if (chosen.length === 0) { toast.error("Kamida bitta SKU uchun miqdor kiriting."); return; }
    startSave(async () => {
      const res = await createOrderAction({ supplierId: Number(supplierId), items: chosen, note });
      if (res.ok) { toast.success("Zakaz yaratildi (qoralama)."); router.push(`/sotuv/sotib-olish/${res.id}`); }
      else toast.error(res.error);
    });
  };

  // Bitta SKU qatori (daraxtning bir necha joyida ishlatiladi — direct/sub ostida)
  const renderSku = (it: BuilderItem) => {
    const l = lines.get(it.productId) ?? { qty: "", price: "", blok: "", pack: "", lead: "" };
    const sum = (Number(l.qty) || 0) * (Number(l.price) || it.purchasePrice || 0);
    const picked = Number(l.qty) > 0;
    // Lead kiritilsa — min stock JONLI qayta hisoblanadi (formula serverniki bilan bir xil)
    const effLead = l.lead.trim() !== "" && Number(l.lead) >= 0 ? Number(l.lead) : it.lead;
    const liveMin = hisobMinStock(it.dailyAvg, orderGap, effLead, it.xyz);
    return (
      // Fon: tanlangan — yashil (zakazga kiradi); aks holda ABC×XYZ matritsa rangi
      <TableRow key={it.productId}
        className={cn("text-sm", picked ? "bg-emerald-500/10 hover:bg-emerald-500/15" : skuRowBg(it.abc, it.xyz))}>
        <TableCell className="font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 pl-6">
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
          {liveMin == null ? (
            <span className="text-muted-foreground/40" title="Lead kiritilmagan — yonidagi katakka kiriting (SKU'ga saqlanadi)">—</span>
          ) : it.stock < liveMin ? (
            <span className="font-bold text-destructive" title="Qoldiq min stock'dan past — buyurtma shart!">
              ⚠ {liveMin.toLocaleString("uz-UZ")}
            </span>
          ) : (
            <span className="text-muted-foreground">{liveMin.toLocaleString("uz-UZ")}</span>
          )}
        </TableCell>
        <TableCell className="px-2">
          <Input ref={regRef(it.productId, "lead")} type="number" inputMode="numeric" value={l.lead}
            placeholder={it.lead != null ? String(it.lead) : ""}
            onChange={(e) => setLine(it.productId, { lead: e.target.value })}
            onKeyDown={onEnterNext(it.productId, "lead")}
            className="h-7 w-14 px-1.5 text-right text-xs tabular-nums"
            title="Lead time (kun) — kiritilsa SKU'ga saqlanadi, min stock qayta hisoblanadi"
            aria-label="Lead time (kun)" />
        </TableCell>
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
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Yetkazib beruvchi</Label>
          <Select value={supplierId} onValueChange={(v) => onSupplier(v ?? "")} disabled={loadingSup || saving}>
            <SelectTrigger className="h-9 w-72 text-sm">
              <SelectValue placeholder={loadingSup ? "Yuklanmoqda…" : "Yetkazib beruvchi tanlang…"} />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.skuCount} SKU</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {items.length > 0 && (
          <>
            <div className="relative min-w-56 flex-1">
              <Label className="text-xs text-muted-foreground">Qidirish</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
                {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={toggleAll} disabled={searching} className="h-9 gap-1.5"
              title={searching ? "Qidiruvda barchasi ochiq" : undefined}>
              {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
              {allCollapsed ? "Yoyish" : "Yig'ish"}
            </Button>
          </>
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
          Lead'ni shu yerda kiritsangiz — SKU'ga saqlanadi va min stock darhol qayta hisoblanadi. Enter — ustun bo'ylab keyingi qatorga.
        </p>
      )}

      {loadingItems ? (
        <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> SKU'lar yuklanmoqda…</p>
      ) : !supplierId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Boshlash uchun yetkazib beruvchi tanlang.</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Bu yetkazib beruvchida sizning kategoriyangizда SKU yo'q.</p>
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
                  {tree.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">Qidiruv bo&apos;yicha SKU topilmadi.</TableCell>
                    </TableRow>
                  ) : tree.map((g) => {
                    const gOpen = searching || !closedG.has(g.id);
                    const col = GROUP_COLORS[norm(g.name)] ?? { dot: "bg-muted-foreground", badge: "" };
                    return (
                      <Fragment key={`g${g.id}`}>
                        <TableRow className="cursor-pointer bg-muted/60 hover:bg-muted/70" onClick={() => toggleG(g.id)}>
                          <TableCell colSpan={10} className="py-1.5">
                            <span className="flex items-center gap-2 text-sm font-bold">
                              <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", gOpen && "rotate-90")} />
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                              {g.name}
                              <span className="text-[11px] font-normal text-muted-foreground">{g.skuCount} SKU</span>
                            </span>
                          </TableCell>
                        </TableRow>
                        {gOpen && g.cats.map((c) => {
                          const cKey = `${g.id}:${c.id}`;
                          const cOpen = searching || !closedC.has(cKey);
                          const cCount = c.direct.length + c.subs.reduce((s, x) => s + x.items.length, 0);
                          return (
                            <Fragment key={`c${cKey}`}>
                              <TableRow className="cursor-pointer bg-muted/25 hover:bg-muted/40" onClick={() => toggleC(cKey)}>
                                <TableCell colSpan={10} className="py-1">
                                  <span className="flex items-center gap-2 pl-6 text-sm font-semibold">
                                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", cOpen && "rotate-90")} />
                                    {c.name}
                                    <span className="text-[11px] font-normal text-muted-foreground">{cCount}</span>
                                  </span>
                                </TableCell>
                              </TableRow>
                              {cOpen && c.direct.map((it) => renderSku(it))}
                              {cOpen && c.subs.map((s) => {
                                const sOpen = searching || !closedS.has(s.id);
                                return (
                                  <Fragment key={`s${s.id}`}>
                                    <TableRow className="cursor-pointer hover:bg-muted/20" onClick={() => toggleS(s.id)}>
                                      <TableCell colSpan={10} className="py-1">
                                        <span className="flex items-center gap-2 pl-12 text-xs font-medium text-muted-foreground">
                                          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", sOpen && "rotate-90")} />
                                          {s.name}
                                          <span className="text-[10px]">{s.items.length}</span>
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                    {sOpen && s.items.map((it) => renderSku(it))}
                                  </Fragment>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
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
