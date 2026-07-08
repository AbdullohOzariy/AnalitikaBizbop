"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, X, Loader2, Plus, Trash2, Check, FolderPlus, Folder, Pencil, GripVertical, ImageIcon, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { toast } from "sonner";
import {
  listItemsAction, addItemAction, updateItemAction, deleteItemAction,
  searchProductsAction, suggestPriceAction,
  createGroupAction, renameGroupAction, deleteGroupAction, moveItemToGroupAction,
  saveDesignAction, getDesignAction,
  type PromoItemRow, type PromoGroupRow, type ProductSearchRow,
} from "./actions";

// Rasmni brauzerda (canvas) max o'lchamga proporsional kichraytirib base64 PNG qaytaradi.
function resizeImageToDataUrl(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("o'qib bo'lmadi"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("rasm emas"));
      img.onload = () => {
        let { width, height } = img;
        const m = Math.max(width, height);
        if (m > maxSize) { const s = maxSize / m; width = Math.round(width * s); height = Math.round(height * s); }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
  const [preparedCount, setPreparedCount] = useState(0);
  const [loading, startLoad] = useTransition();
  const [, startMove] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [design, setDesign] = useState<{ kind: "item" | "group"; id: number; title: string } | null>(null);
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
      if (res.ok) { setRows(res.rows); setGroups(res.groups); setPreparedCount(res.preparedCount); }
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
        <div className="flex items-center gap-2">
          {preparedCount > 0 && (
            <button
              type="button"
              onClick={() => downloadFile(`/api/promo/${campaignId}/designs`, `aksiya-${campaignId}-dizaynlar.zip`, "Dizaynlar tayyorlanmoqda…")}
              title="Barcha tayyor dizaynlarni (A4 + Instagram) bitta ZIP qilib yuklash"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary"
            >
              <Download className="h-3.5 w-3.5" /> Dizaynlar ({preparedCount})
            </button>
          )}
          {canEdit && (
            <>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setGroupOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5" /> Guruh qo&apos;shish
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> SKU qo&apos;shish
              </Button>
            </>
          )}
        </div>
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
                      onDesign={canEdit ? () => setDesign({ kind: "group", id: g.id, title: g.name }) : undefined}
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
                    onDesign={canEdit ? () => setDesign({ kind: "item", id: r.id, title: r.name }) : undefined}
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
      {design && (
        <DesignDialog
          kind={design.kind}
          id={design.id}
          fallbackTitle={design.title}
          onClose={() => setDesign(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

/** Faylni fetch bilan yuklab olish — server xato qaytarsa (masalan DB/sessiya uzilishi)
 *  brauzer "design.txt" saqlab qo'ymasin, aniq toast chiqsin. */
async function downloadFile(url: string, fallbackName: string, loadingMsg?: string) {
  const t = loadingMsg ? toast.loading(loadingMsg) : undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const msg = (await res.text().catch(() => "")).slice(0, 200);
      toast.error(msg || `Yuklab olishda xato (${res.status}) — qayta urinib ko'ring.`);
      return;
    }
    const blob = await res.blob();
    const m = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m?.[1] ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    toast.error("Tarmoq xatosi — internetni tekshirib qayta urinib ko'ring.");
  } finally {
    if (t !== undefined) toast.dismiss(t);
  }
}

/** Rasm yuklangan dizaynni qatorning o'zidan yuklab olish — A4 va Instagram PNG. */
function RowDesignLinks({ kind, id }: { kind: "item" | "group"; id: number }) {
  const base = `/api/promo/design?kind=${kind}&id=${id}`;
  const cls = "inline-flex items-center gap-0.5 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary";
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => downloadFile(`${base}&format=a4`, "aksiya-design-a4.png")} className={cls} title="A4 banner (PNG) yuklab olish">
        <Download className="h-3 w-3" /> A4
      </button>
      <button type="button" onClick={() => downloadFile(`${base}&format=instagram`, "aksiya-design-instagram.png")} className={cls} title="Instagram banner (PNG) yuklab olish">
        <Download className="h-3 w-3" /> Insta
      </button>
    </span>
  );
}

/** Guruh bloki — sarlavha qatori (nom, SKU soni, tahrir/o'chir) + ichidagi SKU qatorlar.
 *  Sarlavha drop nishoni (drag-drop bilan SKU shu guruhga ko'chiriladi). */
function GroupBlock({
  group, items, canEdit, colCount, onChanged, isOver, dragging, dropProps, onItemDragStart, onItemDragEnd, onDesign,
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
  onDesign?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [delOpen, setDelOpen] = useState(false);
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

  const doDelete = (keepItems: boolean) => {
    start(async () => {
      const res = await deleteGroupAction({ id: group.id, keepItems });
      if (res.ok) { setDelOpen(false); onChanged(); }
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
                {group.hasImage && <span className="mr-1.5"><RowDesignLinks kind="group" id={group.id} /></span>}
                {onDesign && (
                  <button onClick={onDesign} title="Dizayn banner (rasm + nom)" aria-label="Dizayn"
                    className="text-muted-foreground hover:text-primary">
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setRenaming(true)} title="Nomini o'zgartirish" aria-label="Nomini o'zgartirish"
                  className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setDelOpen(true)} title="Guruhni o'chirish" aria-label="Guruhni o'chirish"
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
      {delOpen && (
        <DeleteGroupDialog
          groupName={group.name}
          count={items.length}
          isPending={isPending}
          onDelete={doDelete}
          onClose={() => setDelOpen(false)}
        />
      )}
    </>
  );
}

/** Guruhni o'chirish — 2 variant: tarqatish (SKU saqlanadi) yoki guruh+SKU o'chirish. */
function DeleteGroupDialog({
  groupName, count, isPending, onDelete, onClose,
}: {
  groupName: string;
  count: number;
  isPending: boolean;
  onDelete: (keepItems: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>&quot;{groupName}&quot; guruhini o&apos;chirish</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Guruhda {count} ta SKU bor. Qaysi biri kerak?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-1">
          <Button variant="outline" className="h-auto justify-start rounded-xl py-2.5 text-left" disabled={isPending} onClick={() => onDelete(true)}>
            <div className="flex flex-col items-start">
              <span className="font-medium">Faqat guruhni o&apos;chirish</span>
              <span className="text-xs text-muted-foreground">SKU&apos;lar saqlanadi (guruhsiz bo&apos;ladi)</span>
            </div>
          </Button>
          <Button variant="outline" className="h-auto justify-start rounded-xl border-destructive/30 py-2.5 text-left text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={isPending} onClick={() => onDelete(false)}>
            <div className="flex flex-col items-start">
              <span className="font-medium">Guruh + {count} ta SKU o&apos;chirish</span>
              <span className="text-xs text-muted-foreground">Hammasi butunlay o&apos;chiriladi</span>
            </div>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
          {isPending && <Loader2 className="h-4 w-4 animate-spin self-center" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bir SKU qatori — narxlar ruchnoy (blur'da saqlanadi), farq/% live derive.
 *  Drag handle (GripVertical) bilan guruhga sudrab ko'chiriladi. */
function ItemRow({ row, canEdit, onChanged, grouped, onDragStartItem, onDragEndItem, onDesign }: {
  row: PromoItemRow; canEdit: boolean; onChanged: () => void; grouped?: boolean;
  onDragStartItem?: (e: React.DragEvent) => void; onDragEndItem?: () => void; onDesign?: () => void;
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
        <td className="px-1 py-1.5">
          <div className="flex items-center justify-center gap-1.5">
            {onDesign && row.hasImage && <RowDesignLinks kind="item" id={row.id} />}
            {onDesign && !isPending && !saved && (
              <button onClick={onDesign} aria-label="Dizayn" title="Dizayn banner (rasm + nom)" className="text-muted-foreground hover:text-primary">
                <ImageIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {isPending ? <Loader2 className="inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
              : saved ? <Check className="inline h-3.5 w-3.5 text-emerald-500" />
              : <button onClick={del} aria-label="O'chirish" title="O'chirish" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>}
          </div>
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
    const hasItems = picked.length > 0;
    const pr = Number(promo);
    const l = limit.trim() === "" ? null : Number(limit);
    if (hasItems && !(pr > 0)) { toast.error("Aksiya narxini kiriting."); return; }
    if (l != null && !(l > 0)) { toast.error("Limit musbat bo'lishi kerak."); return; }
    start(async () => {
      const res = await createGroupAction({
        campaignId, name: n,
        productIds: picked.map((p) => p.id),
        promoPrice: hasItems ? pr : null,
        promoLimit: l,
      });
      if (res.ok) {
        toast.success(
          res.added > 0
            ? `Guruh qo'shildi: ${res.added} ta SKU${res.skipped > 0 ? ` (${res.skipped} ta allaqachon bor edi)` : ""}.`
            : "Bo'sh guruh yaratildi — SKU'larni sudrab qo'shing."
        );
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
            Bir mahsulotning har xil ta&apos;m/turlarini jamlang. SKU tanlash shart emas — bo&apos;sh guruh ochib, keyin SKU&apos;larni sudrab (drag-drop) qo&apos;shsangiz ham bo&apos;ladi. SKU bilan yaratsangiz, hammasiga bitta aksiya narxi qo&apos;yiladi (keyin alohida tahrirlanadi), sotilish narxi MEGA filialdan avto.
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

          {/* SKU qidirish — ko'p tanlash (ixtiyoriy) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">SKU qo&apos;shish (ixtiyoriy — keyin sudrab ham qo&apos;shsa bo&apos;ladi)</Label>
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

          {picked.length > 0 && (
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
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
          <Button className="rounded-xl" disabled={isPending || !name.trim()} onClick={submit}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Qo'shish${picked.length > 0 ? ` (${picked.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dizayn banner — mahsulot rasmi (oq/shaffof fon) + nom (uz/ru). Saqlangach A4 va
 * Instagram formatida PNG yuklab olinadi. Rasm brauzerda canvas bilan kichraytiriladi.
 */
function DesignDialog({
  kind, id, fallbackTitle, onClose, onSaved,
}: {
  kind: "item" | "group";
  id: number;
  fallbackTitle: string;
  onClose: () => void;
  onSaved?: () => void; // saqlangach ro'yxatni yangilash (hasImage/preparedCount)
}) {
  const [loading, startLoad] = useTransition();
  const [title, setTitle] = useState("");
  const [titleRu, setTitleRu] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1); // rasm yaqinlashtirish (x1..x4)
  const [dirty, setDirty] = useState(false); // saqlanmagan o'zgarish bormi
  const [isPending, startSave] = useTransition();
  const reqId = useRef(0);

  useEffect(() => {
    const my = ++reqId.current;
    startLoad(async () => {
      const res = await getDesignAction({ kind, id });
      if (my !== reqId.current) return;
      if (res.ok) {
        setTitle(res.design.designTitle ?? "");
        setTitleRu(res.design.designTitleRu ?? "");
        setImageData(res.design.imageData);
        setZoom(res.design.imageZoom ?? 1);
      } else toast.error(res.error);
    });
  }, [kind, id]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // bir xil faylni qayta tanlash mumkin bo'lsin
    if (!file) return;
    try {
      let data = await resizeImageToDataUrl(file, 800);
      if (data.length > 900_000) data = await resizeImageToDataUrl(file, 600);
      if (data.length > 900_000) { toast.error("Rasm juda katta — soddaroq/kichikroq rasm tanlang."); return; }
      setImageData(data); setDirty(true);
    } catch { toast.error("Rasmni o'qib bo'lmadi."); }
  };

  const save = () => {
    startSave(async () => {
      const res = await saveDesignAction({
        kind, id,
        designTitle: title.trim() || null,
        designTitleRu: titleRu.trim() || null,
        imageData: dirty ? imageData : undefined,
        imageZoom: zoom,
      });
      if (res.ok) { setDirty(false); toast.success("Dizayn saqlandi."); onSaved?.(); }
      else toast.error(res.error);
    });
  };

  const base = `/api/promo/design?kind=${kind}&id=${id}`;
  const dl = (format: "a4" | "instagram") => {
    if (dirty) { toast.error("Avval saqlang."); return; }
    downloadFile(`${base}&format=${format}`, `aksiya-design-${format}.png`);
  };
  const dlCls = (active: boolean) =>
    cn("inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary", !active && "pointer-events-none opacity-50");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dizayn banner</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Mahsulot rasmi (oq/shaffof fon) + nom. Narx, chegirma, sana, limit avtomatik. A4 va Instagram formatida yuklab olinadi.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />Yuklanmoqda…</p>
        ) : (
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nom (uz)</Label>
              <Input value={title} disabled={isPending} placeholder={fallbackTitle}
                onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nom (ru, ixtiyoriy)</Label>
              <Input value={titleRu} disabled={isPending} placeholder="Молочный коктейль…"
                onChange={(e) => { setTitleRu(e.target.value); setDirty(true); }} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mahsulot rasmi (oq/shaffof fonli PNG)</Label>
              {imageData ? (
                <div className="relative flex items-center justify-center overflow-hidden rounded-xl border border-border p-3"
                  style={{ backgroundImage: "repeating-conic-gradient(#eef2f6 0% 25%, #ffffff 0% 50%)", backgroundSize: "20px 20px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageData} alt="" className="max-h-44 object-contain" style={{ transform: zoom > 1 ? `scale(${zoom})` : undefined }} />
                  <label className="absolute bottom-2 right-2 inline-flex cursor-pointer items-center gap-1 rounded-lg bg-card/90 px-2 py-1 text-[11px] text-primary shadow hover:bg-card">
                    <Upload className="h-3 w-3" /> Boshqa rasm
                    <input type="file" accept="image/png,image/webp" className="hidden" onChange={onFile} disabled={isPending} />
                  </label>
                  <button onClick={() => { setImageData(null); setDirty(true); }} disabled={isPending} aria-label="Rasmni olib tashlash"
                    className="absolute right-2 top-2 rounded-full bg-card/90 p-1 text-muted-foreground shadow hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-7 text-center text-xs text-muted-foreground hover:bg-muted/30">
                  <Upload className="h-5 w-5" />
                  PNG yuklash (oq yoki shaffof fon)
                  <input type="file" accept="image/png,image/webp" className="hidden" onChange={onFile} disabled={isPending} />
                </label>
              )}
              {imageData && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Yaqinlashtirish:</span>
                  {[1, 2, 3, 4].map((z) => (
                    <button
                      key={z}
                      type="button"
                      disabled={isPending}
                      onClick={() => { setZoom(z); setDirty(true); }}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        zoom === z ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      x{z}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={() => dl("a4")} className={dlCls(!dirty)} title={dirty ? "Avval saqlang" : "A4 yuklab olish"}>
              <Download className="h-3.5 w-3.5" /> A4
            </button>
            <button type="button" onClick={() => dl("instagram")} className={dlCls(!dirty)} title={dirty ? "Avval saqlang" : "Instagram yuklab olish"}>
              <Download className="h-3.5 w-3.5" /> Instagram
            </button>
          </div>
          <Button className="rounded-xl" disabled={isPending || !dirty} onClick={save}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
