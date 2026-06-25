"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, X, Loader2, Plus, Trash2, Check, FolderPlus, Folder, Pencil, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { toast } from "sonner";
import {
  listItemsAction, addItemAction, updateItemAction, deleteItemAction,
  searchProductsAction, suggestPriceAction,
  createGroupAction, renameGroupAction, deleteGroupAction, moveItemToGroupAction,
  type PromoItemRow, type PromoGroupRow, type ProductSearchRow,
} from "./actions";

function fmtMoney(n: number) {
  return formatUZS(n, { compact: false });
}
function diffPctClass(pct: number) {
  return pct > 0 ? "text-emerald-600 dark:text-emerald-400" : pct < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
}

/** Aksiya SKU qatorlari — narxlar (ruchnoy) + farq/% (auto). */
export function CampaignItems({
  campaignId, canEdit,
}: {
  campaignId: number;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<PromoItemRow[]>([]);
  const [groups, setGroups] = useState<PromoGroupRow[]>([]);
  const [loading, startLoad] = useTransition();
  const [, startMove] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const reqId = useRef(0);

  // Drag-drop: drag qilinayotgan SKU id'si dataTransfer orqali uzatiladi (ref'siz —
  // native DnD standarti). overTarget/dragging faqat highlight uchun (state).
  const [overTarget, setOverTarget] = useState<number | "ungrouped" | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const my = ++reqId.current;
    startLoad(async () => {
      const res = await listItemsAction({ campaignId });
      if (my !== reqId.current) return;
      if (res.ok) { setRows(res.rows); setGroups(res.groups); }
      else toast.error(res.error);
    });
  }, [campaignId, refreshKey]);

  const reload = () => setRefreshKey((k) => k + 1);

  const colCount = canEdit ? 7 : 6;
  const ungrouped = rows.filter((r) => r.groupId == null);

  // SKU'ni guruhga (yoki guruhsizga) ko'chirish — ref'siz (eslint react-hooks/refs:
  // ref faqat event handler ichida o'qiladi, render'da uzatilmaydi).
  const applyMove = (itemId: number, groupId: number | null) => {
    startMove(async () => {
      const res = await moveItemToGroupAction({ itemId, groupId });
      if (res.ok) reload();
      else toast.error(res.error);
    });
  };

  const onItemDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  };
  const onItemDragEnd = () => { setDragging(false); setOverTarget(null); };
  const dropProps = (target: number | "ungrouped") =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverTarget((t) => (t === target ? t : target)); },
          onDragLeave: () => setOverTarget((t) => (t === target ? null : t)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const itemId = Number(e.dataTransfer.getData("text/plain"));
            setOverTarget(null);
            setDragging(false);
            if (Number.isInteger(itemId) && itemId > 0) applyMove(itemId, target === "ungrouped" ? null : target);
          },
        }
      : {};

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {rows.length} ta SKU{groups.length > 0 && ` · ${groups.length} guruh`}
          {loading && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />}
        </span>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setGroupOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5" /> Guruh qo&apos;shish
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> SKU qo&apos;shish
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Nomi (SKU)</th>
              <th className="px-2 py-2 text-right font-semibold">Sotilish narxi</th>
              <th className="px-2 py-2 text-right font-semibold">Aksiya narxi</th>
              <th className="px-2 py-2 text-right font-semibold">Limit</th>
              <th className="px-2 py-2 text-right font-semibold">Farqi</th>
              <th className="px-2 py-2 text-right font-semibold">% farqi</th>
              {canEdit && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {loading ? "Yuklanmoqda…" : "Hali SKU qo'shilmagan."}
                </td>
              </tr>
            ) : (
              <>
                {groups.map((g) => {
                  const gItems = rows.filter((r) => r.groupId === g.id);
                  return (
                    <GroupBlock
                      key={g.id}
                      group={g}
                      items={gItems}
                      canEdit={canEdit}
                      colCount={colCount}
                      onChanged={reload}
                      isOver={overTarget === g.id}
                      dragging={dragging}
                      dropProps={dropProps(g.id)}
                      onItemDragStart={onItemDragStart}
                      onItemDragEnd={onItemDragEnd}
                    />
                  );
                })}
                {groups.length > 0 && (
                  <tr
                    className={cn(
                      "border-b border-border bg-muted/20 transition-colors",
                      overTarget === "ungrouped" && "outline outline-2 -outline-offset-2 outline-primary bg-primary/10"
                    )}
                    {...dropProps("ungrouped")}
                  >
                    <td colSpan={colCount} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Guruhsiz
                      {dragging && <span className="ml-2 font-normal normal-case text-primary">— guruhdan chiqarish uchun shu yerga tashlang</span>}
                    </td>
                  </tr>
                )}
                {ungrouped.map((r) => (
                  <ItemRow
                    key={r.id}
                    row={r}
                    canEdit={canEdit}
                    onChanged={reload}
                    onDragStartItem={canEdit ? (e) => onItemDragStart(e, r.id) : undefined}
                    onDragEndItem={canEdit ? onItemDragEnd : undefined}
                  />
                ))}
                {ungrouped.length === 0 && groups.length > 0 && (
                  <tr {...dropProps("ungrouped")}>
                    <td colSpan={colCount} className={cn("px-3 py-2.5 pl-9 text-center text-xs text-muted-foreground", overTarget === "ungrouped" && "bg-primary/10")}>
                      {dragging ? "SKU'ni shu yerga tashlab guruhdan chiqaring" : "Guruhsiz SKU yo'q"}
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddItemDialog
          campaignId={campaignId}
          existing={rows.map((r) => r.productId)}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); reload(); }}
        />
      )}
      {groupOpen && (
        <AddGroupDialog
          campaignId={campaignId}
          existing={rows.map((r) => r.productId)}
          onClose={() => setGroupOpen(false)}
          onAdded={() => { setGroupOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

/** Guruh bloki — sarlavha qatori (nom, SKU soni, tahrir/o'chir) + ichidagi SKU qatorlar.
 *  Sarlavha drop nishoni (drag-drop bilan SKU shu guruhga ko'chiriladi). */
function GroupBlock({
  group, items, canEdit, colCount, onChanged, isOver, dragging, dropProps, onItemDragStart, onItemDragEnd,
}: {
  group: PromoGroupRow;
  items: PromoItemRow[];
  canEdit: boolean;
  colCount: number;
  onChanged: () => void;
  isOver: boolean;
  dragging: boolean;
  dropProps: Record<string, unknown>;
  onItemDragStart: (e: React.DragEvent, id: number) => void;
  onItemDragEnd: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [isPending, start] = useTransition();

  const saveName = () => {
    const n = name.trim();
    if (!n || n === group.name) { setRenaming(false); setName(group.name); return; }
    start(async () => {
      const res = await renameGroupAction({ id: group.id, name: n });
      if (res.ok) { setRenaming(false); onChanged(); }
      else { toast.error(res.error); setName(group.name); }
    });
  };

  const del = () => {
    if (!confirm(`"${group.name}" guruhi va undagi ${items.length} ta SKU o'chiriladi. Davom etamizmi?`)) return;
    start(async () => {
      const res = await deleteGroupAction({ id: group.id });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  };

  return (
    <>
      <tr
        className={cn(
          "border-b border-border bg-primary/5 transition-colors",
          isOver && "outline outline-2 -outline-offset-2 outline-primary bg-primary/15"
        )}
        {...dropProps}
      >
        <td colSpan={colCount} className="px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
            {renaming ? (
              <Input
                value={name} autoFocus disabled={isPending}
                className="h-7 max-w-[280px] text-sm font-semibold"
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setRenaming(false); setName(group.name); } }}
              />
            ) : (
              <span className="font-semibold">{group.name}</span>
            )}
            <span className="text-[11px] text-muted-foreground">({items.length} SKU)</span>
            {dragging && !isOver && <span className="text-[10px] text-primary/70">← shu yerga tashlang</span>}
            {canEdit && !renaming && (
              <span className="ml-auto flex items-center gap-0.5">
                <button onClick={() => setRenaming(true)} title="Nomini o'zgartirish" aria-label="Nomini o'zgartirish"
                  className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={del} title="Guruhni o'chirish" aria-label="Guruhni o'chirish"
                  className="text-muted-foreground hover:text-destructive">
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </span>
            )}
          </div>
        </td>
      </tr>
      {items.length === 0 ? (
        <tr className="border-b border-border/40" {...dropProps}>
          <td colSpan={colCount} className={cn("px-3 py-2 pl-9 text-xs text-muted-foreground", isOver && "bg-primary/10")}>
            {dragging ? "SKU'ni shu yerga tashlang" : "Guruh bo'sh."}
          </td>
        </tr>
      ) : (
        items.map((r) => (
          <ItemRow
            key={r.id}
            row={r}
            canEdit={canEdit}
            onChanged={onChanged}
            grouped
            onDragStartItem={canEdit ? (e) => onItemDragStart(e, r.id) : undefined}
            onDragEndItem={canEdit ? onItemDragEnd : undefined}
          />
        ))
      )}
    </>
  );
}

/** Bir SKU qatori — narxlar ruchnoy (blur'da saqlanadi), farq/% live derive.
 *  Drag handle (GripVertical) bilan guruhga sudrab ko'chiriladi. */
function ItemRow({ row, canEdit, onChanged, grouped, onDragStartItem, onDragEndItem }: {
  row: PromoItemRow; canEdit: boolean; onChanged: () => void; grouped?: boolean;
  onDragStartItem?: (e: React.DragEvent) => void; onDragEndItem?: () => void;
}) {
  const [reg, setReg] = useState(String(row.regularPrice));
  const [promo, setPromo] = useState(String(row.promoPrice));
  const [limit, setLimit] = useState(row.promoLimit != null ? String(row.promoLimit) : "");
  const [isPending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  // Live derive (render — effekt EMAS)
  const regN = Number(reg) || 0;
  const promoN = Number(promo) || 0;
  const diff = regN - promoN;
  const pct = regN > 0 ? (diff / regN) * 100 : 0;

  const save = () => {
    const r = Number(reg), p = Number(promo);
    const l = limit.trim() === "" ? null : Number(limit);
    if (!(r > 0) || !(p > 0)) { toast.error("Narxlar musbat bo'lishi kerak."); return; }
    if (l != null && !(l > 0)) { toast.error("Limit musbat bo'lishi kerak."); return; }
    const changed = r !== row.regularPrice || p !== row.promoPrice || l !== row.promoLimit;
    if (!changed) return;
    start(async () => {
      const res = await updateItemAction({ id: row.id, regularPrice: r, promoPrice: p, promoLimit: l });
      if (res.ok) { setSaved(true); onChanged(); setTimeout(() => setSaved(false), 1200); }
      else toast.error(res.error);
    });
  };

  const del = () => {
    start(async () => {
      const res = await deleteItemAction({ id: row.id });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  };

  const numInput = "h-8 w-28 rounded-lg text-right tabular-nums";
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20">
      <td className={cn("px-3 py-1.5", grouped && "pl-9")}>
        <div className="flex items-start gap-1.5">
          {canEdit && onDragStartItem && (
            <span
              draggable
              onDragStart={onDragStartItem}
              onDragEnd={onDragEndItem}
              title="Sudrab guruhga ko'chiring"
              className="mt-px shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <div className="max-w-[340px] leading-snug" title={row.name}>{row.name}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{row.code}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        {canEdit
          ? <Input value={reg} disabled={isPending} type="number" inputMode="decimal" className={numInput}
              onChange={(e) => setReg(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
          : <span className="tabular-nums">{fmtMoney(row.regularPrice)}</span>}
      </td>
      <td className="px-2 py-1.5 text-right">
        {canEdit
          ? <Input value={promo} disabled={isPending} type="number" inputMode="decimal" className={numInput}
              onChange={(e) => setPromo(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
          : <span className="tabular-nums">{fmtMoney(row.promoPrice)}</span>}
      </td>
      <td className="px-2 py-1.5 text-right">
        {canEdit
          ? <Input value={limit} disabled={isPending} type="number" inputMode="decimal" placeholder="—" className={numInput}
              onChange={(e) => setLimit(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
          : <span className="tabular-nums text-muted-foreground">{row.promoLimit != null ? fmtMoney(row.promoLimit) : "—"}</span>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{diff > 0 ? `−${fmtMoney(diff)}` : diff < 0 ? `+${fmtMoney(-diff)}` : "—"}</td>
      <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", diffPctClass(pct))}>{pct ? `${pct.toFixed(1)}%` : "—"}</td>
      {canEdit && (
        <td className="px-1 py-1.5 text-center">
          {isPending ? <Loader2 className="inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : saved ? <Check className="inline h-3.5 w-3.5 text-emerald-500" />
            : <button onClick={del} aria-label="O'chirish" title="O'chirish" className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>}
        </td>
      )}
    </tr>
  );
}

/** SKU qidirib (server-side) aksiyaga qo'shish — sotilish narxi auto-taklif. */
function AddItemDialog({
  campaignId, existing, onClose, onAdded,
}: {
  campaignId: number;
  existing: number[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductSearchRow[]>([]);
  const [searching, startSearch] = useTransition();
  const [picked, setPicked] = useState<ProductSearchRow | null>(null);
  const [reg, setReg] = useState("");
  const [promo, setPromo] = useState("");
  const [limit, setLimit] = useState("");
  const [isPending, start] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  const onQ = (v: string) => {
    setQ(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const my = ++reqId.current;
      startSearch(async () => {
        const res = await searchProductsAction({ q: v.trim() });
        if (my !== reqId.current) return;
        if (res.ok) setResults(res.rows);
      });
    }, 350);
  };

  const pick = (p: ProductSearchRow) => {
    setPicked(p);
    setResults([]);
    setQ("");
    // Sotilish narxi auto-taklif — MEGA filial (Mega Center) oxirgi davr sotuv narxi
    start(async () => {
      const res = await suggestPriceAction({ productId: p.id });
      if (res.ok && res.price != null) setReg(String(res.price));
    });
  };

  const submit = () => {
    if (!picked) { toast.error("SKU tanlang."); return; }
    const r = Number(reg), pr = Number(promo);
    const l = limit.trim() === "" ? null : Number(limit);
    if (!(r > 0) || !(pr > 0)) { toast.error("Sotilish va aksiya narxini kiriting."); return; }
    if (l != null && !(l > 0)) { toast.error("Limit musbat bo'lishi kerak."); return; }
    start(async () => {
      const res = await addItemAction({ campaignId, productId: picked.id, regularPrice: r, promoPrice: pr, promoLimit: l });
      if (res.ok) { toast.success("SKU qo'shildi."); onAdded(); }
      else toast.error(res.error);
    });
  };

  const dup = picked != null && existing.includes(picked.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SKU qo&apos;shish</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            SKU ni nomi yoki kodi bo&apos;yicha qidiring, narxlarni kiriting.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => onQ(e.target.value)} autoFocus
                placeholder="SKU nomi yoki kodi (≥2 belgi)…" className="h-9 pl-8 pr-8" />
              {q && (
                <button onClick={() => { setQ(""); setResults([]); }} aria-label="Tozalash"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border/60">
              {searching ? (
                <p className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Qidirilmoqda…</p>
              ) : results.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">{q.trim().length >= 2 ? "Topilmadi." : "Qidirish uchun yozing."}</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {results.map((p) => (
                    <button key={p.id} onClick={() => pick(p)} disabled={existing.includes(p.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-40">
                      <span className="min-w-0 flex-1 break-words leading-snug">{p.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.code}</span>
                      {existing.includes(p.id) && <span className="shrink-0 text-[11px] text-amber-600">qo&apos;shilgan</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-sm font-medium">{picked.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{picked.code}</div>
              <button onClick={() => { setPicked(null); setReg(""); setPromo(""); setLimit(""); }}
                className="mt-1 text-[11px] text-primary underline underline-offset-2">boshqa SKU tanlash</button>
            </div>
            {dup && <p className="text-xs text-amber-600">Bu SKU allaqachon qo&apos;shilgan.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sotilish narxi *</Label>
                <Input value={reg} disabled={isPending} type="number" inputMode="decimal" className="h-9"
                  placeholder="auto-taklif" onChange={(e) => setReg(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Aksiya narxi *</Label>
                <Input value={promo} disabled={isPending} type="number" inputMode="decimal" className="h-9"
                  autoFocus onChange={(e) => setPromo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Aksiya limiti</Label>
                <Input value={limit} disabled={isPending} type="number" inputMode="decimal" className="h-9"
                  placeholder="ixtiyoriy" onChange={(e) => setLimit(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Farqi</Label>
                <div className="flex h-9 items-center rounded-lg border border-border/60 bg-muted/20 px-3 text-sm tabular-nums">
                  {Number(reg) > 0 && Number(promo) > 0
                    ? `−${fmtMoney(Number(reg) - Number(promo))} (${(((Number(reg) - Number(promo)) / Number(reg)) * 100).toFixed(1)}%)`
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
          {picked && (
            <Button className="rounded-xl" disabled={isPending || dup} onClick={submit}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Qo'shish"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * SKU guruhi qo'shish — bir nechta SKU tanlab, bitta nom va bitta aksiya narxi bilan.
 * Sotilish narxlari MEGA filialdan avto. Har SKU alohida qator bo'lib saqlanadi.
 */
function AddGroupDialog({
  campaignId, existing, onClose, onAdded,
}: {
  campaignId: number;
  existing: number[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductSearchRow[]>([]);
  const [searching, startSearch] = useTransition();
  const [picked, setPicked] = useState<ProductSearchRow[]>([]);
  const [promo, setPromo] = useState("");
  const [limit, setLimit] = useState("");
  const [isPending, start] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  const onQ = (v: string) => {
    setQ(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const my = ++reqId.current;
      startSearch(async () => {
        const res = await searchProductsAction({ q: v.trim() });
        if (my !== reqId.current) return;
        if (res.ok) setResults(res.rows);
      });
    }, 350);
  };

  const toggle = (p: ProductSearchRow) => {
    setPicked((prev) => prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]);
  };

  const submit = () => {
    const n = name.trim();
    if (!n) { toast.error("Guruh nomini kiriting."); return; }
    if (picked.length === 0) { toast.error("Kamida bitta SKU tanlang."); return; }
    const pr = Number(promo);
    const l = limit.trim() === "" ? null : Number(limit);
    if (!(pr > 0)) { toast.error("Aksiya narxini kiriting."); return; }
    if (l != null && !(l > 0)) { toast.error("Limit musbat bo'lishi kerak."); return; }
    start(async () => {
      const res = await createGroupAction({
        campaignId, name: n, productIds: picked.map((p) => p.id), promoPrice: pr, promoLimit: l,
      });
      if (res.ok) {
        toast.success(`Guruh qo'shildi: ${res.added} ta SKU${res.skipped > 0 ? ` (${res.skipped} ta allaqachon bor edi)` : ""}.`);
        onAdded();
      } else toast.error(res.error);
    });
  };

  const pickedIds = new Set(picked.map((p) => p.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SKU guruhi qo&apos;shish</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Bir mahsulotning har xil ta&apos;m/turlarini jamlang. Hammasiga bitta aksiya narxi qo&apos;yiladi (keyin alohida tahrirlanadi), sotilish narxi MEGA filialdan avto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Guruh nomi *</Label>
            <Input value={name} disabled={isPending} className="h-9"
              placeholder="Masalan: Sochnaya Dolina Sok 1L" onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Tanlangan SKU chiplari */}
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  <span className="max-w-[160px] truncate" title={p.name}>{p.name}</span>
                  <button onClick={() => toggle(p)} aria-label="Olib tashlash" className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* SKU qidirish — ko'p tanlash */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">SKU qo&apos;shish (bir nechta tanlang)</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => onQ(e.target.value)}
                placeholder="SKU nomi yoki kodi (≥2 belgi)…" className="h-9 pl-8 pr-8" />
              {q && (
                <button onClick={() => { setQ(""); setResults([]); }} aria-label="Tozalash"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-[28vh] overflow-y-auto rounded-lg border border-border/60">
              {searching ? (
                <p className="p-3 text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Qidirilmoqda…</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">{q.trim().length >= 2 ? "Topilmadi." : "Qidirish uchun yozing."}</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {results.map((p) => {
                    const isPicked = pickedIds.has(p.id);
                    const isExisting = existing.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => toggle(p)} disabled={isExisting && !isPicked}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-40">
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isPicked ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                          {isPicked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1 break-words leading-snug">{p.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.code}</span>
                        {isExisting && <span className="shrink-0 text-[11px] text-amber-600">qo&apos;shilgan</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Aksiya narxi *</Label>
              <Input value={promo} disabled={isPending} type="number" inputMode="decimal" className="h-9"
                placeholder="hammasiga" onChange={(e) => setPromo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Aksiya limiti</Label>
              <Input value={limit} disabled={isPending} type="number" inputMode="decimal" className="h-9"
                placeholder="ixtiyoriy" onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
          <Button className="rounded-xl" disabled={isPending || picked.length === 0} onClick={submit}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Qo'shish${picked.length > 0 ? ` (${picked.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
