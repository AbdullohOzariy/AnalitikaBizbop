"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SubcatTreePicker, type SubItem } from "@/components/common/subcat-tree-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, X, Loader2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { skuRowBg, skuBadgeCls, skuBadgeLabel } from "@/lib/sku-rang";
import { toast } from "sonner";
import type { HGroup } from "./iyerarxiya-client";
import { searchSkusAction, updateProductAction, type SkuRow } from "./actions";

const ALL = "all";

export function SkuList({ groups }: { groups: HGroup[] }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState<string>(ALL);
  const [catId, setCatId] = useState<string>(ALL);
  const [subId, setSubId] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<SkuRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [isPending, start] = useTransition();
  const [edit, setEdit] = useState<SkuRow | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // qidiruv debounce → q (committed) → page 1
  const onQ = (v: string) => {
    setQInput(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setQ(v.trim()); setPage(1); }, 350);
  };

  // Filtr variantlari
  const catOptions = useMemo(() => {
    const g = groups.find((x) => String(x.id) === groupId);
    const src = g ? g.categories : groups.flatMap((x) => x.categories);
    return src.map((c) => ({ id: c.id, name: c.name }));
  }, [groups, groupId]);
  const subOptions = useMemo(() => {
    const allCats = groups.flatMap((x) => x.categories);
    const c = allCats.find((x) => String(x.id) === catId);
    const src = c ? c.children : allCats.flatMap((x) => x.children);
    return src.map((s) => ({ id: s.id, name: s.name }));
  }, [groups, catId]);
  // Tahrirlash uchun: tekis subkat ro'yxati (daraxt tanlagich uchun)
  const subsFlat: SubItem[] = useMemo(
    () => groups.flatMap((g) => g.categories.flatMap((c) =>
      c.children.map((s) => ({ id: s.id, name: s.name, cat: c.name, group: g.name })))),
    [groups]
  );

  // Ma'lumot yuklash (filtr/qidiruv/sahifa o'zgarganda). reqId — race guard:
  // tez ketma-ket so'rovlarда eski (sekin) javob yangisini ustiga yozmasligi uchun.
  const reqId = useRef(0);
  useEffect(() => {
    const myId = ++reqId.current;
    start(async () => {
      const res = await searchSkusAction({
        q: q || undefined,
        groupId: groupId !== ALL ? Number(groupId) : undefined,
        catId: catId !== ALL ? Number(catId) : undefined,
        subId: subId !== ALL ? Number(subId) : undefined,
        page,
      });
      if (myId !== reqId.current) return; // yangiroq so'rov bor — bu javobni tashlaymiz
      if (res.ok) { setRows(res.rows); setTotal(res.total); setPageSize(res.pageSize); }
      else { toast.error(res.error); setRows([]); setTotal(0); }
    });
  }, [q, groupId, catId, subId, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resetFrom = (level: "group" | "cat") => {
    if (level === "group") { setCatId(ALL); setSubId(ALL); }
    if (level === "cat") setSubId(ALL);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {/* Filtrlar */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => onQ(e.target.value)}
            placeholder="Qidirish — SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
          {qInput && (
            <button onClick={() => { setQInput(""); setQ(""); setPage(1); }} aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterSelect label="Guruh" value={groupId} onChange={(v) => { setGroupId(v); resetFrom("group"); }}
          options={groups.map((g) => ({ id: g.id, name: g.name }))} allLabel="Barcha guruhlar" />
        <FilterSelect label="Kategoriya" value={catId} onChange={(v) => { setCatId(v); resetFrom("cat"); }}
          options={catOptions} allLabel="Barcha kategoriyalar" />
        <FilterSelect label="Subkategoriya" value={subId} onChange={(v) => { setSubId(v); setPage(1); }}
          options={subOptions} allLabel="Barcha subkat" />
      </div>

      {/* Jadval */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[90px]">Kod</TableHead>
                <TableHead>Nom (SKU)</TableHead>
                <TableHead className="w-[110px]">Guruh</TableHead>
                <TableHead className="w-[150px]">Kategoriya</TableHead>
                <TableHead className="w-[160px]">Subkategoriya</TableHead>
                <TableHead className="w-[60px] text-right">Amal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Yuklanmoqda…
                </TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Hech narsa topilmadi.
                </TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  // Fon — SKU'ning ABC×XYZ matritsa holatiga ko'ra (tizim bo'ylab bir xil rang tili)
                  <TableRow key={r.id} className={cn("text-sm", skuRowBg(r.abc, r.xyz))}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {r.code}
                        {skuBadgeLabel(r.abc, r.xyz) && (
                          <span className={cn("rounded border px-1 py-px text-[9px] font-bold leading-none", skuBadgeCls(r.abc, r.xyz))}>
                            {skuBadgeLabel(r.abc, r.xyz)}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={r.name}>{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.group ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.cat ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.sub ?? <span className="text-amber-600 dark:text-amber-400">moslanmagan</span>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(r)} aria-label="Tahrirlash">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {total.toLocaleString("uz-UZ")} ta · sahifa {page}/{totalPages}
          </span>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={isPending || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Oldingi">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={isPending || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Keyingi">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tahrirlash dialogi — key bilan har SKU uchun toza holat (effektsiz) */}
      {edit && (
        <SkuEditDialog
          key={edit.id}
          row={edit}
          subs={subsFlat}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            start(async () => {
              const res = await searchSkusAction({
                q: q || undefined,
                groupId: groupId !== ALL ? Number(groupId) : undefined,
                catId: catId !== ALL ? Number(catId) : undefined,
                subId: subId !== ALL ? Number(subId) : undefined,
                page,
              });
              if (res.ok) { setRows(res.rows); setTotal(res.total); }
            });
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: number; name: string }[]; allLabel: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
        <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function SkuEditDialog({ row, subs, onClose, onSaved }: {
  row: SkuRow;
  subs: SubItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, start] = useTransition();
  const [name, setName] = useState(row.name);
  const [subId, setSubId] = useState<string>(row.subId != null ? String(row.subId) : "");
  const [subLabel, setSubLabel] = useState<string>(row.sub ?? "");

  const save = () => {
    const nm = name.trim();
    if (!nm) { toast.error("Nom kerak."); return; }
    const changedName = nm !== row.name;
    const changedSub = subId !== "" && Number(subId) !== row.subId;
    if (!changedName && !changedSub) { onClose(); return; }
    start(async () => {
      const res = await updateProductAction({
        productId: row.id,
        name: changedName ? nm : undefined,
        subId: changedSub ? Number(subId) : undefined,
      });
      if (res.ok) { toast.success("Saqlandi."); onSaved(); } else toast.error(res.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SKU tahrirlash</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Kod {row.code} · nom va subkategoriyani o&apos;zgartiring.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nom</Label>
            <Input value={name} disabled={isPending} className="h-10 rounded-xl" autoFocus
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subkategoriya</Label>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{subLabel || <span className="text-muted-foreground">tanlanmagan</span>}</span>
              <SubcatTreePicker
                subs={subs}
                disabled={isPending}
                triggerLabel="Tanlash"
                currentSubId={subId ? Number(subId) : null}
                onPick={(sid, label) => { setSubId(String(sid)); setSubLabel(label); }}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
          <Button className="rounded-xl" disabled={isPending} onClick={save}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
