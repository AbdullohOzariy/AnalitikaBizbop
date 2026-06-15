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
import { Search, X, Loader2, Save, ChevronRight, ChevronsDownUp, ChevronsUpDown, Wand2, Eraser } from "lucide-react";
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

export function OrderBuilder({ initialSupplierId, initialAgentId }: { initialSupplierId?: number; initialAgentId?: number }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  // Agent tanlovi: "" — tanlanmagan, "none" — agentsiz (umumiy), "<id>" — agent
  const [agentSel, setAgentSel] = useState("");
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

  const resetLists = () => {
    setItems([]); setLines(new Map()); setQ("");
    setClosedG(new Set()); setClosedC(new Set()); setClosedS(new Set());
  };

  const loadItems = (sid: number, aid: number | null) => {
    startItems(async () => {
      const res = await supplierItemsAction(sid, aid);
      if (res.ok) {
        setItems(res.items);
        setOrderGap(res.orderGap);
        // SKU'lar oldindan TANLANMAYDI — faqat menejer miqdor kiritgani zakazga kiradi.
        // Taklif miqdori, eslab qolingan narx/pachka esa placeholder (xira) sifatida ko'rinadi.
        setLines(new Map());
      } else toast.error(res.error);
    });
  };

  const onSupplier = (v: string) => {
    setSupplierId(v);
    setAgentSel("");
    resetLists();
    if (!v) return;
    // Agentsiz supplier — SKU'larni darhol yuklaymiz; agentli bo'lsa agent tanlashni kutamiz
    const sup = suppliers.find((s) => String(s.id) === v);
    if (sup && sup.agents.length === 0) loadItems(Number(v), null);
  };

  const onAgent = (v: string) => {
    setAgentSel(v);
    resetLists();
    if (!v || !supplierId) return;
    loadItems(Number(supplierId), v === "none" ? null : Number(v));
  };

  useEffect(() => {
    startSup(async () => {
      const res = await suppliersForOrderAction();
      if (res.ok) {
        setSuppliers(res.suppliers);
        // "Bugun" sahifasidan kelganda yetkazib beruvchi (+agent) oldindan tanlanadi
        const sup = initialSupplierId ? res.suppliers.find((s) => s.id === initialSupplierId) : undefined;
        if (sup) {
          setSupplierId(String(sup.id));
          if (initialAgentId && sup.agents.some((a) => a.id === initialAgentId)) {
            setAgentSel(String(initialAgentId));
            loadItems(sup.id, initialAgentId);
          } else if (sup.agents.length === 0) {
            loadItems(sup.id, null);
          }
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
          // Pachka kiritilmagan bo'lsa — eslab qolingan packSize (placeholder'da ko'rinadi)
          packSize: pack > 0 ? pack : (itemByPid.get(pid)?.packSize ?? null),
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
  const selectedSupplier = useMemo(() => suppliers.find((s) => String(s.id) === supplierId), [suppliers, supplierId]);
  const orderDayHint = (() => {
    const sup = selectedSupplier;
    if (!sup) return null;
    // Agent tanlangan bo'lsa — agentning kunlari, aks holda supplier kunlari
    const ag = agentSel && agentSel !== "none" ? sup.agents.find((a) => String(a.id) === agentSel) : null;
    const nextOrderDate = ag ? ag.nextOrderDate : sup.nextOrderDate;
    if (!nextOrderDate) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${hintNow.getFullYear()}-${pad(hintNow.getMonth() + 1)}-${pad(hintNow.getDate())}`;
    const tomorrowD = new Date(hintNow.getFullYear(), hintNow.getMonth(), hintNow.getDate() + 1);
    const tomorrowStr = `${tomorrowD.getFullYear()}-${pad(tomorrowD.getMonth() + 1)}-${pad(tomorrowD.getDate())}`;
    const [, m, d] = nextOrderDate.split("-");
    return {
      today: nextOrderDate === todayStr,
      label: nextOrderDate === todayStr
        ? "Bugun zakaz kuni"
        : `Keyingi zakaz kuni: ${nextOrderDate === tomorrowStr ? "ertaga" : ""} (${d}.${m})`,
    };
  })();

  const save = () => {
    if (!supplierId) { toast.error("Yetkazib beruvchi tanlang."); return; }
    if (selectedSupplier && selectedSupplier.agents.length > 0 && agentSel === "") { toast.error("Agent (brend) tanlang."); return; }
    if (chosen.length === 0) { toast.error("Kamida bitta SKU uchun miqdor kiriting."); return; }
    const agentId = agentSel && agentSel !== "none" ? Number(agentSel) : null;
    startSave(async () => {
      const res = await createOrderAction({ supplierId: Number(supplierId), agentId, items: chosen, note });
      if (res.ok) { toast.success("Zakaz yaratildi (qoralama)."); router.push(`/sotuv/sotib-olish/${res.id}`); }
      else toast.error(res.error);
    });
  };

  // Avto to'ldirish — min stock (kunlik sotuv × (zakaz oralig'i + lead) × XYZ buferi) va
  // pachka/korobka asosida miqdorlarni hisoblaydi. AI EMAS — sof formula (0 token, bir zumda).
  // Faqat BO'SH qatorlarni to'ldiradi (qo'lda kiritilganlarni saqlaydi); kerak bo'lmagan
  // (suggested ≤ 0) SKU'larga tegmaydi — ularni menejer keyin o'zi qo'shadi/chiqaradi.
  const autoFill = () => {
    const m = new Map(lines);
    let filled = 0;
    for (const it of items) {
      const cur = m.get(it.productId);
      if (cur && Number(cur.qty) > 0) continue; // qo'lda kiritilgan — tegmaymiz
      const base = it.suggested;
      if (base <= 0) continue; // zaxira yetarli — zakaz shart emas
      if (it.packSize && it.packSize > 0) {
        // Pachka/korobkaga yaxlitlash: kerakli miqdordan kam bo'lmagan eng yaqin pachka soni
        const boxes = Math.ceil(base / it.packSize);
        m.set(it.productId, { qty: String(boxes * it.packSize), price: cur?.price ?? "", blok: String(boxes), pack: String(it.packSize), lead: cur?.lead ?? "" });
      } else {
        m.set(it.productId, { qty: String(Math.ceil(base)), price: cur?.price ?? "", blok: "", pack: "", lead: cur?.lead ?? "" });
      }
      filled++;
    }
    setLines(m);
    if (filled > 0) toast.success(`${filled} ta SKU avto to'ldirildi (min stock + pachka).`);
    else toast.info("Avto to'ldirish uchun mos SKU yo'q — zaxira yetarli yoki lead kiritilmagan.");
  };

  const clearAll = () => setLines(new Map());

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
          <span className="flex items-center gap-1">
            <Input ref={regRef(it.productId, "qty")} type="number" inputMode="decimal" value={l.qty}
              placeholder={it.suggested > 0 ? String(it.suggested) : ""}
              onChange={(e) => setLine(it.productId, { qty: e.target.value })}
              onKeyDown={onEnterNext(it.productId, "qty")}
              className="h-7 w-20 px-1.5 text-right text-xs tabular-nums" aria-label="Miqdor (dona)" />
            {picked && (
              <button type="button" onClick={() => setLine(it.productId, { qty: "" })}
                title="Zakazdan chiqarish (0)" aria-label="Zakazdan chiqarish"
                className="shrink-0 text-muted-foreground/40 transition-colors hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
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
        {selectedSupplier && selectedSupplier.agents.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Agent (brend)</Label>
            <Select value={agentSel} onValueChange={(v) => onAgent(typeof v === "string" ? v : "")} disabled={loadingItems || saving}>
              <SelectTrigger className="h-9 w-60 text-sm">
                <SelectValue placeholder="Agent tanlang…" />
              </SelectTrigger>
              <SelectContent>
                {selectedSupplier.agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name} · {a.skuCount} SKU</SelectItem>
                ))}
                {selectedSupplier.agentlessSkuCount > 0 && (
                  <SelectItem value="none">Agentsiz (umumiy) · {selectedSupplier.agentlessSkuCount} SKU</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
        {items.length > 0 && (
          <>
            <Button type="button" size="sm" onClick={autoFill} disabled={saving} className="h-9 gap-1.5"
              title="Min stock, pachka/korobka va sotuv tahliliga ko'ra bo'sh miqdorlarni avtomatik to'ldiradi (AI emas — formula)">
              <Wand2 className="h-4 w-4" /> Avto to'ldirish
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={saving} className="h-9 gap-1.5"
              title="Barcha kiritilgan miqdorlarni tozalaydi">
              <Eraser className="h-4 w-4" /> Tozalash
            </Button>
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
          ⚠ — qoldiq min stock'dan past. Faqat MIQDOR kiritilgan SKU zakazga (va nakladnoyga) kiradi —
          bo'sh/0 qoldirilganlar kirmaydi. Xira sonlar — taklif miqdori va eslab qolingan narx/pachka
          (narxni bo'sh qoldirsangiz o'sha ishlatiladi). Lead'ni kiritsangiz — SKU'ga saqlanadi. Enter — keyingi qatorga.
        </p>
      )}

      {loadingItems ? (
        <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> SKU'lar yuklanmoqda…</p>
      ) : !supplierId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Boshlash uchun yetkazib beruvchi tanlang.</p>
      ) : selectedSupplier && selectedSupplier.agents.length > 0 && agentSel === "" ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Agent (brend) tanlang — SKU&apos;lar shundan keyin chiqadi.</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Bu yerda sizning kategoriyangizda SKU yo&apos;q.</p>
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
