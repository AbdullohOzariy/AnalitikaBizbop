"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { SearchablePicker } from "@/components/common/searchable-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, X, Loader2, Save, ChevronRight, ChevronsDownUp, ChevronsUpDown, Wand2, Eraser, Copy } from "lucide-react";
import { formatUZS } from "@/lib/format";
import {
  suppliersForOrderAction, supplierItemsAction, createOrderAction,
  type SupplierOption, type BuilderItem, type BuilderBranch, type BranchCell, type OrderItemInput,
  type ReorderSource,
} from "../actions";
import { hisobMinStock, hisobMaxStock } from "../order-status";

// Bitta SKU qatori holati: narx + lead + pachka (SKU darajasi) + filial bo'yicha BLOK (bb) va DONA (bq).
// Filialga blok ham, dona ham kiritiladi — biri kiritilsa ikkinchisi pachka orqali qayta hisoblanadi.
// Kanonik qiymat — `bq` (dona): zakaz shundan yig'iladi, `bb` faqat kiritish qulayligi uchun.
// Ikkalasi ham XOM matn (raw) sifatida saqlanadi — "0." kabi chala kiritishda kursor sakramasin.
type Line = { price: string; lead: string; pack: string; bq: Record<number, string>; bb: Record<number, string> };

const emptyLine = (): Line => ({ price: "", lead: "", pack: "", bq: {}, bb: {} });

// Effektiv pachka (bir blokdagi dona): kiritilgan yoki SKU'da eslab qolingan.
const packOf = (l: Pick<Line, "pack">, it: BuilderItem) => (Number(l.pack) > 0 ? Number(l.pack) : (it.packSize ?? 0));

// Kasr blok (2.5 blok) ham bo'lishi mumkin — 3 xonagacha yaxlitlaymiz (server ham Decimal(20,3)).
const round3 = (n: number) => Math.round(n * 1000) / 1000;
// Xom matn musbat songa aylanadimi? ("" / "0." / "abc" — yo'q)
const numOf = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Iyerarxiya daraxti tugunlari (guruh → kategoriya → subkategoriya → SKU)
type SubNode = { id: number; name: string; sort: number; items: BuilderItem[] };
type CatNode = { id: number; name: string; sort: number; subs: SubNode[]; direct: BuilderItem[] };
type GroupNode = { id: number; name: string; sort: number; cats: CatNode[]; skuCount: number };

// Filial avto-zakaz — server formulasi (lead'ni jonli o'zgartirsa qayta hisoblanadi).
function branchAvto(cell: BranchCell, orderGap: number, lead: number | null, xyz: string | null): number {
  const bMin = hisobMinStock(cell.dailyAvg, orderGap, lead, xyz);
  if (bMin == null) return cell.suggested; // lead yo'q — server fallback (sotuv−qoldiq)
  const bMax = hisobMaxStock(cell.dailyAvg, orderGap, lead, xyz);
  return cell.stock < bMin ? Math.max(0, (bMax ?? bMin) - cell.stock) : 0;
}

// SKU qatori — memo'langan. Faqat o'z `line` propi o'zgargandagina qayta render bo'ladi
// (ilgari har klaviatura bosishida BARCHA ochiq qatorlar qayta render bo'lardi). Handlerlar
// (h) stabil identifikatorli — quyida stable-ref pattern bilan beriladi.
type RowHandlers = {
  // skuPack — SKU'da eslab qolingan pachka (fallback): Pachka o'zgarganda bloklarni qayta hisoblash uchun.
  setLine: (pid: number, patch: Partial<Omit<Line, "bq" | "bb">>, skuPack?: number) => void;
  // pack — shu qatorning effektiv pachkasi (qator o'zi biladi, parent qayta hisoblamasin).
  setBranchCell: (pid: number, bid: number, field: "blok" | "dona", val: string, pack: number) => void;
  regRef: (pid: number, field: string) => (el: HTMLInputElement | null) => void;
  onEnterNext: (pid: number, field: string) => (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

const SkuRow = memo(function SkuRow({
  it, line, branches, orderGap, h, pendingQty,
}: {
  it: BuilderItem;
  line: Line | undefined;
  branches: BuilderBranch[];
  orderGap: number;
  h: RowHandlers;
  // Qayta zakaz: eski zakazda filial taqsimoti bo'lmagan SKU'ning jami miqdori —
  // foydalanuvchi hali filiallarga taqsimlamagan (miqdor kiritilgach yashiriladi).
  pendingQty?: number;
}) {
  const l = line ?? emptyLine();
  const effLead = l.lead.trim() !== "" && Number(l.lead) >= 0 ? Number(l.lead) : it.lead;
  const pack = packOf(l, it);
  const cellByB = new Map(it.branches.map((c) => [c.branchId, c]));
  const jamiQty = branches.reduce((s, b) => s + (Number(l.bq[b.id]) || 0), 0); // jami dona
  const jamiBlok = pack > 0 ? jamiQty / pack : null; // jami blok = jami dona ÷ pachka
  const price = Number(l.price) || it.purchasePrice || 0;
  const sum = jamiQty * price;
  const picked = jamiQty > 0;
  return (
    <TableRow key={it.productId}
      className={cn("text-sm", picked ? "bg-emerald-500/10 hover:bg-emerald-500/15" : skuRowBg(it.abc, it.xyz))}>
      <TableCell className="font-mono text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 pl-6">
          {it.code}
          <span title={skuBadgeTitle(it.abc, it.xyz)}
            className={cn("rounded border px-1 py-px text-[9px] font-bold leading-none", skuBadgeCls(it.abc, it.xyz))}>
            {skuBadgeLabel(it.abc, it.xyz)}
          </span>
        </span>
      </TableCell>
      <TableCell className="max-w-[240px]" title={it.name}>
        <span className="flex items-center gap-1.5">
          <span className="truncate">{it.name}</span>
          {it.arxiv && (
            <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-px text-[9px] font-semibold uppercase text-muted-foreground"
              title="Arxivlangan (no-aktiv) — yana sotila boshlasa avtomatik aktivga qaytadi">no aktiv</span>
          )}
          {pendingQty != null && !picked && (
            <span className="shrink-0 rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-amber-700 dark:text-amber-400"
              title="Eski zakazda filial taqsimoti bo'lmagan — jami miqdorni filiallarga o'zingiz taqsimlang">
              eski: {pendingQty.toLocaleString("uz-UZ")} — taqsimlang
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="px-2">
        <Input ref={h.regRef(it.productId, "lead")} type="number" inputMode="numeric" value={l.lead}
          placeholder={it.lead != null ? String(it.lead) : ""}
          onChange={(e) => h.setLine(it.productId, { lead: e.target.value })}
          onKeyDown={h.onEnterNext(it.productId, "lead")}
          className="h-7 w-14 px-1.5 text-right text-xs tabular-nums"
          title="Lead time (kun) — kiritilsa SKU'ga saqlanadi, avto-zakaz qayta hisoblanadi" aria-label="Lead time (kun)" />
      </TableCell>
      <TableCell className="px-2">
        <Input ref={h.regRef(it.productId, "pack")} type="number" inputMode="decimal" value={l.pack}
          placeholder={it.packSize != null ? String(it.packSize) : ""}
          onChange={(e) => h.setLine(it.productId, { pack: e.target.value }, it.packSize ?? 0)}
          onKeyDown={h.onEnterNext(it.productId, "pack")}
          className={cn("h-7 w-14 px-1.5 text-right text-xs tabular-nums",
            pack <= 0 && "border-amber-500/60 bg-amber-500/10")}
          title={pack > 0
            ? "Pachka — bir blokdagi dona soni (SKU'ga saqlanadi). Blok = dona ÷ pachka"
            : "Pachka kiritilmagan — blok kataklari ishlamaydi. Kiriting: SKU'ga saqlanadi."}
          aria-label="Pachka (dona/blok)" />
      </TableCell>
      {branches.map((b) => {
        const cell = cellByB.get(b.id);
        const avto = cell ? branchAvto(cell, orderGap, effLead, it.xyz) : 0;
        const stock = cell?.stock ?? 0;
        const daily = cell?.dailyAvg ?? 0;
        return (
          <Fragment key={b.id}>
            <TableCell className="border-l border-border/60 text-right tabular-nums text-[11px] text-muted-foreground">
              {stock > 0 ? stock.toLocaleString("uz-UZ") : <span className="text-muted-foreground/40">—</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[11px] text-muted-foreground">
              {daily > 0 ? daily.toLocaleString("uz-UZ", { maximumFractionDigits: 1 }) : <span className="text-muted-foreground/40">—</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[11px]">
              {avto > 0
                ? <span className={cn(stock < (cell?.minStock ?? 0) ? "font-bold text-destructive" : "text-muted-foreground")}>{avto.toLocaleString("uz-UZ")}</span>
                : <span className="text-muted-foreground/40">—</span>}
            </TableCell>
            <TableCell className="bg-primary/[0.03] px-1.5">
              <Input ref={h.regRef(it.productId, `k${b.id}`)} type="number" inputMode="decimal" value={l.bb[b.id] ?? ""}
                disabled={pack <= 0}
                placeholder={pack > 0 && avto > 0 ? String(round3(avto / pack)) : ""}
                onChange={(e) => h.setBranchCell(it.productId, b.id, "blok", e.target.value, pack)}
                onKeyDown={h.onEnterNext(it.productId, `k${b.id}`)}
                className="h-7 w-14 px-1.5 text-right text-xs tabular-nums disabled:cursor-not-allowed"
                title={pack > 0
                  ? `Shu filialga blok soni — dona avto hisoblanadi (× ${pack})`
                  : "Avval Pachka ustuniga blokdagi dona sonini kiriting"}
                aria-label={`${b.name} blok soni`} />
            </TableCell>
            <TableCell className="bg-primary/[0.03] px-1.5">
              <Input ref={h.regRef(it.productId, `z${b.id}`)} type="number" inputMode="decimal" value={l.bq[b.id] ?? ""}
                placeholder={avto > 0 ? String(avto) : ""}
                onChange={(e) => h.setBranchCell(it.productId, b.id, "dona", e.target.value, pack)}
                onKeyDown={h.onEnterNext(it.productId, `z${b.id}`)}
                className="h-7 w-16 px-1.5 text-right text-xs tabular-nums"
                title="Shu filialga buyurtma miqdori (dona) — blok avto hisoblanadi" aria-label={`${b.name} miqdor (dona)`} />
            </TableCell>
          </Fragment>
        );
      })}
      <TableCell className="border-l border-border/60 text-right tabular-nums text-xs font-semibold" title="Jami blok = jami dona ÷ pachka">
        {jamiBlok != null && jamiQty > 0
          ? (Math.round(jamiBlok * 100) / 100).toLocaleString("uz-UZ", { maximumFractionDigits: 2 })
          : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs font-semibold" title="Jami dona (filiallar yig'indisi)">
        {jamiQty > 0 ? jamiQty.toLocaleString("uz-UZ") : <span className="text-muted-foreground/40">—</span>}
      </TableCell>
      <TableCell className="bg-primary/[0.03] px-1.5">
        <Input ref={h.regRef(it.productId, "price")} type="number" inputMode="decimal" value={l.price}
          placeholder={it.purchasePrice != null ? String(it.purchasePrice) : ""}
          onChange={(e) => h.setLine(it.productId, { price: e.target.value })}
          onKeyDown={h.onEnterNext(it.productId, "price")}
          className="h-7 w-24 px-1.5 text-right text-xs tabular-nums" aria-label="Dona narxi" />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums text-xs", sum > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/40")}>
        {sum > 0 ? formatUZS(sum) : "—"}
      </TableCell>
    </TableRow>
  );
});

export function OrderBuilder({
  initialSupplierId, initialAgentId, reorderSeed,
}: {
  initialSupplierId?: number;
  initialAgentId?: number;
  // Qayta zakaz (?from=<orderId>): eski zakazdan supplier/agent + SKU miqdorlari.
  // Faqat BIR MARTA (birinchi mos loadItems'da) qo'llanadi — seedRef orqali.
  reorderSeed?: ReorderSource | null;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  // Agent tanlovi: "" — tanlanmagan, "none" — agentsiz (umumiy), "<id>" — agent
  const [agentSel, setAgentSel] = useState("");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [branches, setBranches] = useState<BuilderBranch[]>([]);
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
  // Qayta zakaz: bir martalik "urug'lik" — qo'llangach null qilinadi, keyingi
  // loadItems (masalan foydalanuvchi agentni qo'lda almashtirsa) uni qayta yuvmaydi.
  const seedRef = useRef<ReorderSource | null>(reorderSeed ?? null);
  const [seedBannerOpen, setSeedBannerOpen] = useState(!!reorderSeed);
  // Eski zakazda filial taqsimoti bo'lmagan SKU'lar — jami miqdor, foydalanuvchi
  // o'zi taqsimlashi uchun vizual belgi (SkuRow'da amber chip).
  const [seedPending, setSeedPending] = useState<Map<number, number>>(new Map());

  const resetLists = () => {
    setItems([]); setLines(new Map()); setSeedPending(new Map()); setQ("");
    setClosedG(new Set()); setClosedC(new Set()); setClosedS(new Set());
  };

  const loadItems = (sid: number, aid: number | null) => {
    startItems(async () => {
      const res = await supplierItemsAction(sid, aid);
      if (res.ok) {
        setItems(res.items);
        setBranches(res.branches);
        setOrderGap(res.orderGap);
        // SKU'lar oldindan TANLANMAYDI — faqat menejer miqdor kiritgani zakazga kiradi.
        // Avto-zakaz va eslab qolingan narx esa placeholder (xira) sifatida ko'rinadi.
        // Qayta zakaz seed'i shu supplier/agentga mos bo'lsa — Map shu yerda boshlang'ich
        // qiymatlar bilan quriladi (reset effektda emas, shu bois lint-safe: set-state-in-effect
        // qoidasi buzilmaydi, chunki bu allaqachon useTransition callback'i, effekt emas).
        const seed = seedRef.current;
        if (seed && seed.supplierId === sid && (seed.agentId ?? null) === aid) {
          const byPid = new Map(res.items.map((it) => [it.productId, it]));
          const m = new Map<number, Line>();
          const pending = new Map<number, number>();
          for (const s of seed.items) {
            const it = byPid.get(s.productId);
            if (!it) continue; // qamrovdan tashqarida — bu ro'yxatda yo'q
            if (s.branches.length === 0) {
              // Taqsimotsiz — miqdorni birorta filialga o'zboshimchalik bilan qo'ymaymiz,
              // faqat "taqsimlang" belgisi bilan ko'rsatamiz (builder faqat filial-qatorli ishlaydi).
              pending.set(s.productId, s.quantity);
              continue;
            }
            const pack = it.packSize ?? 0;
            const bq: Record<number, string> = {};
            const bb: Record<number, string> = {};
            for (const b of s.branches) {
              bq[b.branchId] = String(b.quantity);
              bb[b.branchId] = pack > 0 ? String(round3(b.quantity / pack)) : "";
            }
            m.set(s.productId, { price: "", lead: "", pack: "", bq, bb });
          }
          setLines(m);
          setSeedPending(pending);
          seedRef.current = null; // bir martalik — qo'llandi
        } else {
          setLines(new Map());
          setSeedPending(new Map());
        }
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
        // Ustunlik: qayta zakaz seed'i (?from=) > "Bugun" sahifasidan kelgan supplier/agent.
        const seed = reorderSeed;
        const seedSupplierId = seed?.supplierId ?? initialSupplierId;
        const sup = seedSupplierId ? res.suppliers.find((s) => s.id === seedSupplierId) : undefined;
        if (sup) {
          setSupplierId(String(sup.id));
          const seedAgentId = seed ? seed.agentId : (initialAgentId ?? null);
          if (sup.agents.length === 0) {
            loadItems(sup.id, null);
          } else if (seedAgentId != null && sup.agents.some((a) => a.id === seedAgentId)) {
            setAgentSel(String(seedAgentId));
            loadItems(sup.id, seedAgentId);
          } else if (seed && seedAgentId == null && sup.agentlessSkuCount > 0) {
            // Seed aniq "agentsiz" deydi (eski zakaz agentsiz edi) va bu supplier'da agentsiz SKU bor.
            setAgentSel("none");
            loadItems(sup.id, null);
          }
        }
      } else toast.error(res.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat mount'da
  }, []);

  const setLine = (pid: number, patch: Partial<Omit<Line, "bq" | "bb">>, skuPack = 0) =>
    setLines((prev) => {
      const n = new Map(prev);
      const cur = n.get(pid) ?? emptyLine();
      const next: Line = { ...cur, ...patch };
      // Pachka o'zgardi: dona kanonik bo'lib qoladi, bloklar yangi pachkaga qarab qayta hisoblanadi
      // (effekt emas — shu yerda, chunki repo'da set-state-in-effect taqiqlangan).
      if (patch.pack !== undefined) {
        const pack = Number(next.pack) > 0 ? Number(next.pack) : skuPack;
        const bb: Record<number, string> = {};
        for (const [bid, raw] of Object.entries(next.bq)) {
          const qty = numOf(raw);
          bb[Number(bid)] = qty != null && pack > 0 ? String(round3(qty / pack)) : "";
        }
        next.bb = bb;
      }
      n.set(pid, next);
      return n;
    });
  // Filial katagi: blok yoki dona kiritiladi — kiritilgani xom holicha saqlanadi, ikkinchisi
  // pachka orqali qayta yoziladi. Shu sababli ikkovi hech qachon bir-biridan uzoqlashmaydi.
  const setBranchCell = (pid: number, bid: number, field: "blok" | "dona", val: string, pack: number) =>
    setLines((prev) => {
      const n = new Map(prev);
      const cur = n.get(pid) ?? emptyLine();
      const num = numOf(val);
      const paired = num != null && pack > 0;
      const next: Line = field === "dona"
        ? { ...cur, bq: { ...cur.bq, [bid]: val }, bb: { ...cur.bb, [bid]: paired ? String(round3(num / pack)) : "" } }
        : { ...cur, bb: { ...cur.bb, [bid]: val }, bq: { ...cur.bq, [bid]: paired ? String(round3(num * pack)) : "" } };
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

  // Enter — o'sha ustun (field) bo'ylab keyingi ko'rinadigan qatorga
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
    const out: OrderItemInput[] = [];
    for (const [pid, l] of lines) {
      const it = itemByPid.get(pid);
      if (!it) continue;
      const pack = packOf(l, it);
      // Filialga DONA kiritiladi (bq = dona).
      const branchRows = branches
        .map((b) => ({ branchId: b.id, quantity: Number(l.bq[b.id]) || 0 }))
        .filter((x) => x.quantity > 0);
      if (branchRows.length === 0) continue;
      const quantity = branchRows.reduce((s, b) => s + b.quantity, 0);
      const price = Number(l.price) || it.purchasePrice || 0;
      const lead = Number(l.lead);
      out.push({
        productId: pid, quantity, price,
        packCount: pack > 0 ? Math.round((quantity / pack) * 1000) / 1000 : null, // jami blok = dona ÷ pachka
        packSize: pack > 0 ? pack : (it.packSize ?? null),
        leadTimeDays: l.lead.trim() !== "" && Number.isInteger(lead) && lead >= 0 ? lead : null,
        branches: branchRows,
      });
    }
    return out;
  }, [lines, itemByPid, branches]);
  const total = useMemo(() => chosen.reduce((s, c) => s + c.quantity * c.price, 0), [chosen]);

  // Zakaz kunlari hinti
  const [hintNow] = useState(() => new Date());
  const selectedSupplier = useMemo(() => suppliers.find((s) => String(s.id) === supplierId), [suppliers, supplierId]);
  const agentLabels = useMemo(() => {
    const o: Record<string, React.ReactNode> = { none: "Agentsiz (umumiy)" };
    for (const a of selectedSupplier?.agents ?? []) o[String(a.id)] = a.name;
    return o;
  }, [selectedSupplier]);
  const orderDayHint = (() => {
    const sup = selectedSupplier;
    if (!sup) return null;
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
    if (chosen.length === 0) { toast.error("Kamida bitta SKU uchun filialga miqdor kiriting."); return; }
    const agentId = agentSel && agentSel !== "none" ? Number(agentSel) : null;
    startSave(async () => {
      const res = await createOrderAction({ supplierId: Number(supplierId), agentId, items: chosen, note });
      if (res.ok) { toast.success("Zakaz yaratildi (qoralama)."); router.push(`/sotuv/sotib-olish/${res.id}`); }
      else toast.error(res.error);
    });
  };

  // Avto to'ldirish — har filialning avto-zakaz taklifini bo'sh kataklarga qo'yadi.
  const autoFill = () => {
    const m = new Map(lines);
    let filled = 0;
    for (const it of items) {
      const cur = m.get(it.productId) ?? emptyLine();
      const effLead = cur.lead.trim() !== "" && Number(cur.lead) >= 0 ? Number(cur.lead) : it.lead;
      const pack = packOf(cur, it);
      const bq = { ...cur.bq };
      const bb = { ...cur.bb };
      let touched = false;
      for (const cell of it.branches) {
        if (Number(bq[cell.branchId]) > 0) continue; // qo'lda kiritilgan — tegmaymiz
        const avto = branchAvto(cell, orderGap, effLead, it.xyz); // dona
        if (avto > 0) {
          bq[cell.branchId] = String(avto);
          bb[cell.branchId] = pack > 0 ? String(round3(avto / pack)) : "";
          touched = true;
        }
      }
      if (touched) { m.set(it.productId, { ...cur, bq, bb }); filled++; }
    }
    setLines(m);
    if (filled > 0) toast.success(`${filled} ta SKU avto to'ldirildi (filial avto-zakaz).`);
    else toast.info("Avto to'ldirish uchun mos SKU yo'q — zaxira yetarli yoki lead kiritilmagan.");
  };

  const clearAll = () => setLines(new Map());

  const colCount = 4 + branches.length * 5 + 4; // Kod·SKU·Lead·Pachka + (5×filial) + Jami(Blok·Dona·Narx·Summa)

  // Bitta SKU qatori
  // SkuRow (memo) ga beriladigan stabil handlerlar: identifikator o'zgarmaydi, lekin
  // doim eng so'nggi closure'ga (orderedPids, lines...) yo'naltiradi (stale closure yo'q).
  const rowHRef = useRef<RowHandlers>({ setLine, setBranchCell, regRef, onEnterNext });
  useEffect(() => { rowHRef.current = { setLine, setBranchCell, regRef, onEnterNext }; });
  const rowH = useMemo<RowHandlers>(() => ({
    setLine: (pid, patch, skuPack) => rowHRef.current.setLine(pid, patch, skuPack),
    setBranchCell: (pid, bid, field, val, pack) => rowHRef.current.setBranchCell(pid, bid, field, val, pack),
    regRef: (pid, field) => rowHRef.current.regRef(pid, field),
    onEnterNext: (pid, field) => rowHRef.current.onEnterNext(pid, field),
  }), []);

  return (
    <div className="space-y-4">
      {reorderSeed && seedBannerOpen && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <Copy className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">Eski zakazdan nusxa</p>
            {reorderSeed.warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {reorderSeed.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setSeedBannerOpen(false)} aria-label="Bannerni yopish"
            className="shrink-0 text-amber-700/70 transition-colors hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Yetkazib beruvchi</Label>
          <SearchablePicker
            title="Yetkazib beruvchi tanlash"
            placeholder={loadingSup ? "Yuklanmoqda…" : "Yetkazib beruvchi tanlang…"}
            searchPlaceholder="Nomi bo'yicha qidirish..."
            disabled={loadingSup || saving}
            value={supplierId || null}
            onPick={(id) => onSupplier(id)}
            options={suppliers.map((s) => ({ id: String(s.id), label: s.name, hint: `${s.avgRating != null ? `★ ${s.avgRating} · ` : ""}${s.skuCount} SKU` }))}
            triggerClassName="h-9 w-72"
          />
          {selectedSupplier && (
            <p className="text-[11px] text-muted-foreground">
              {selectedSupplier.avgRating != null
                ? <span className="text-amber-600 dark:text-amber-400">★ {selectedSupplier.avgRating} o&apos;rtacha baho ({selectedSupplier.ratingCount} ta zakaz)</span>
                : "Hali baholanmagan"}
            </p>
          )}
        </div>
        {selectedSupplier && selectedSupplier.agents.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Agent (brend)</Label>
            <Select value={agentSel} onValueChange={(v) => onAgent(typeof v === "string" ? v : "")} disabled={loadingItems || saving} items={agentLabels}>
              <SelectTrigger className="h-9 w-60 text-sm">
                <SelectValue placeholder="Agent tanlang…" />
              </SelectTrigger>
              <SelectContent>
                {selectedSupplier.agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}{a.avgRating != null ? ` · ★ ${a.avgRating}` : ""} · {a.skuCount} SKU</SelectItem>
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
              title="Har filialning avto-zakaz taklifini bo'sh kataklarga qo'yadi (AI emas — formula)">
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
          Har filial uchun <b>Qoldiq · Kunlik · Avto-zakaz · Blok · Dona</b> ustunlari — <b>Blok</b>ka ham, <b>Dona</b>ga ham
          kiritsa bo&apos;ladi: birini yozsangiz ikkinchisi pachka orqali o&apos;zi hisoblanadi (blok × pachka = dona).
          <b>Pachka</b> (bir blokdagi dona) SKU&apos;dan avto chiqadi, tahrirlansa SKU&apos;ga saqlanadi; sariq katak — pachka
          kiritilmagan, unda blok kataklari ishlamaydi (faqat dona). Masalan pachka 12 → filialga 2 blok yozsangiz 24 dona bo&apos;ladi.
          Avto-zakaz = kunlik × (zakaz oralig&apos;i + lead) × XYZ buferi (dona); qizil — qoldiq min&apos;dan past.
          &quot;Avto to&apos;ldirish&quot; bo&apos;sh kataklarni avto-zakaz bilan to&apos;ldiradi. Faqat to&apos;ldirilgan SKU zakazga kiradi. Enter — keyingi qatorga.
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
                    <TableHead rowSpan={2} className="w-[80px] align-bottom">Kod</TableHead>
                    <TableHead rowSpan={2} className="align-bottom">SKU</TableHead>
                    <TableHead rowSpan={2} className="w-[64px] align-bottom" title="Lead time (kun) — zakazdan kelguncha; SKU'ga saqlanadi">Lead</TableHead>
                    <TableHead rowSpan={2} className="w-[60px] align-bottom" title="Pachka — bir blokdagi dona soni. Filial miqdori = blok × pachka">Pachka</TableHead>
                    {branches.map((b) => (
                      <TableHead key={b.id} colSpan={5} className="border-l border-border/60 text-center font-semibold" title={b.name}>{b.name}</TableHead>
                    ))}
                    <TableHead colSpan={4} className="border-l border-border/60 bg-primary/[0.04] text-center font-semibold">Jami</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    {branches.map((b) => (
                      <Fragment key={b.id}>
                        <TableHead className="w-[56px] border-l border-border/60 text-right text-[10px]" title="Qoldiq (shu filial)">Qold.</TableHead>
                        <TableHead className="w-[52px] text-right text-[10px]" title="Kunlik o'rtacha sotuv (shu filial)">Kun.</TableHead>
                        <TableHead className="w-[52px] text-right text-[10px]" title="Avto-zakaz taklifi (shu filial, dona)">Avto</TableHead>
                        <TableHead className="w-[60px] bg-primary/[0.03] text-[10px]" title="Shu filialga blok soni — dona avto hisoblanadi (pachka kerak)">Blok</TableHead>
                        <TableHead className="w-[64px] bg-primary/[0.03] text-[10px]" title="Shu filialga buyurtma miqdori (dona) — blok avto hisoblanadi">Dona</TableHead>
                      </Fragment>
                    ))}
                    <TableHead className="w-[56px] border-l border-border/60 text-right text-[10px]" title="Jami blok = jami dona ÷ pachka">Blok</TableHead>
                    <TableHead className="w-[64px] text-right text-[10px]" title="Jami dona (filiallar yig'indisi)">Dona</TableHead>
                    <TableHead className="w-[100px] bg-primary/[0.03] text-[10px]">Narx</TableHead>
                    <TableHead className="w-[110px] text-right text-[10px]">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tree.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colCount} className="py-6 text-center text-sm text-muted-foreground">Qidiruv bo&apos;yicha SKU topilmadi.</TableCell>
                    </TableRow>
                  ) : tree.map((g) => {
                    const gOpen = searching || !closedG.has(g.id);
                    const col = GROUP_COLORS[norm(g.name)] ?? { dot: "bg-muted-foreground", badge: "" };
                    return (
                      <Fragment key={`g${g.id}`}>
                        <TableRow className="cursor-pointer bg-muted/60 hover:bg-muted/70" onClick={() => toggleG(g.id)}>
                          <TableCell colSpan={colCount} className="py-1.5">
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
                                <TableCell colSpan={colCount} className="py-1">
                                  <span className="flex items-center gap-2 pl-6 text-sm font-semibold">
                                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", cOpen && "rotate-90")} />
                                    {c.name}
                                    <span className="text-[11px] font-normal text-muted-foreground">{cCount}</span>
                                  </span>
                                </TableCell>
                              </TableRow>
                              {cOpen && c.direct.map((it) => <SkuRow key={it.productId} it={it} line={lines.get(it.productId)} branches={branches} orderGap={orderGap} h={rowH} pendingQty={seedPending.get(it.productId)} />)}
                              {cOpen && c.subs.map((s) => {
                                const sOpen = searching || !closedS.has(s.id);
                                return (
                                  <Fragment key={`s${s.id}`}>
                                    <TableRow className="cursor-pointer hover:bg-muted/20" onClick={() => toggleS(s.id)}>
                                      <TableCell colSpan={colCount} className="py-1">
                                        <span className="flex items-center gap-2 pl-12 text-xs font-medium text-muted-foreground">
                                          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", sOpen && "rotate-90")} />
                                          {s.name}
                                          <span className="text-[10px]">{s.items.length}</span>
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                    {sOpen && s.items.map((it) => <SkuRow key={it.productId} it={it} line={lines.get(it.productId)} branches={branches} orderGap={orderGap} h={rowH} pendingQty={seedPending.get(it.productId)} />)}
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
