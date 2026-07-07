"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Search, Loader2, Zap, FileUp } from "lucide-react";
import { toast } from "sonner";
import {
  searchProductsForInventoryAction,
  addInventoryItemAction,
  removeInventoryItemAction,
  autoAddOosItemsAction,
  importInventoryItemsXlsxAction,
  type InventorySearchRow,
  type AutoFillMode,
} from "./actions";

export type InventoryItemRow = {
  id: number;
  code: number;
  name: string;
  subName: string | null;
  branchId: number;
  branchName: string;
  currentStock: number | null;
  createdByName: string;
  createdAtText: string;
};

export type BranchOpt = { id: number; name: string };

const fmtQty = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 });

// Filial tanlash checkbox guruhi — qo'shish/import dialoglarida umumiy.
function BranchPicker({
  branches, selected, onChange,
}: {
  branches: BranchOpt[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Qaysi filiallar uchun:</p>
        <button
          type="button"
          className="text-[11px] font-medium text-primary hover:underline"
          onClick={() => onChange(selected.size === branches.length ? new Set() : new Set(branches.map((b) => b.id)))}
        >
          {selected.size === branches.length ? "Hech biri" : "Hammasi"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {branches.map((b) => {
          const on = selected.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => toggle(b.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ItemsClient({
  rows,
  branches,
  canManage,
}: {
  rows: InventoryItemRow[];
  branches: BranchOpt[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [xlsxOpen, setXlsxOpen] = useState(false);
  const [oosOpen, setOosOpen] = useState(false);
  const [autoMode, setAutoMode] = useState<AutoFillMode>("oos");
  const [oosRunning, startOos] = useTransition();
  const [del, setDel] = useState<InventoryItemRow | null>(null);
  const [deleting, startDelete] = useTransition();
  const [branchFilter, setBranchFilter] = useState<number>(0); // 0 = barchasi

  const filtered = branchFilter === 0 ? rows : rows.filter((r) => r.branchId === branchFilter);

  const runOosAuto = () => {
    startOos(async () => {
      const res = await autoAddOosItemsAction(autoMode);
      if (res.ok) {
        toast.success(
          res.added > 0
            ? `${res.added} ta (SKU × filial) qo'shildi (nomzod: ${res.candidates}, sana: ${res.day}).`
            : `Yangi yozuv yo'q — ${res.candidates} ta nomzodning hammasi allaqachon ro'yxatda.`
        );
        setOosOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const confirmDelete = () => {
    if (!del) return;
    startDelete(async () => {
      const res = await removeInventoryItemAction(del.id);
      if (res.ok) {
        toast.success("SKU ro'yxatdan o'chirildi.");
        setDel(null);
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Ro&apos;yxatda <b className="text-foreground">{filtered.length}</b> ta yozuv
          {branchFilter !== 0 && <> ({branches.find((b) => b.id === branchFilter)?.name})</>}
        </p>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(Number(e.target.value))}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          aria-label="Filial filtri"
        >
          <option value={0}>Barcha filiallar</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {canManage && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setOosOpen(true)}>
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Avto to&apos;ldirish
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setXlsxOpen(true)}>
              <FileUp className="h-3.5 w-3.5" /> Excel&apos;dan yuklash
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> SKU qo&apos;shish
            </Button>
          </div>
        )}
      </div>

      {/* Avto to'ldirish — rejim tanlash + tasdiqlash dialogi */}
      <Dialog open={oosOpen} onOpenChange={setOosOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Avto to&apos;ldirish</DialogTitle>
            <DialogDescription>
              So&apos;nggi kun ma&apos;lumoti bo&apos;yicha <b>har bir filial kesimida top-50</b> SKU
              o&apos;sha filialning ro&apos;yxatiga qo&apos;shiladi. Allaqachon borlari takrorlanmaydi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {(
              [
                { v: "oos", t: "🔥 OOS muammoli", d: "Qoldig'i 0 yoki minus, lekin sotuvi bor — eng tekshirish zarur tovarlar." },
                { v: "top", t: "📈 Eng ko'p sotilgan", d: "Oxirgi sotuvga ko'ra eng yuqori 50 SKU — qoldiq holatidan qat'i nazar." },
              ] as { v: AutoFillMode; t: string; d: string }[]
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setAutoMode(o.v)}
                className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                  autoMode === o.v
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <p className="text-sm font-medium">{o.t}</p>
                <p className="text-xs text-muted-foreground">{o.d}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOosOpen(false)} disabled={oosRunning}>
              Bekor qilish
            </Button>
            <Button onClick={runOosAuto} disabled={oosRunning} className="gap-1.5">
              {oosRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Qo&apos;shish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Kod</TableHead>
              <TableHead>Nomi</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Subkategoriya</TableHead>
              <TableHead className="text-right">Joriy qoldiq (jami)</TableHead>
              <TableHead>Qo&apos;shgan</TableHead>
              {canManage && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-sm text-muted-foreground">
                  Ro&apos;yxat bo&apos;sh — hali SKU belgilanmagan.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">{r.branchName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.subName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(r.currentStock)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.createdByName} · {r.createdAtText}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDel(r)}
                        aria-label="O'chirish"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <>
          <AddSkuDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            branches={branches}
            onAdded={() => router.refresh()}
          />
          <XlsxImportDialog
            open={xlsxOpen}
            onOpenChange={setXlsxOpen}
            branches={branches}
            onImported={() => router.refresh()}
          />
        </>
      )}

      {/* O'chirish tasdiqlash */}
      <Dialog open={del !== null} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SKU ro&apos;yxatdan o&apos;chirilsinmi?</DialogTitle>
            <DialogDescription>
              {del ? `${del.code} — ${del.name} (${del.branchName})` : ""}. Kiritilgan sanash tarixi saqlanib qoladi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Bekor</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              O&apos;chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── SKU qidiruv + qo'shish dialogi (filial tanlash bilan) ───────────────────
function AddSkuDialog({
  open,
  onOpenChange,
  branches,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  branches: BranchOpt[];
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<InventorySearchRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const [addingId, setAddingId] = useState<number | null>(null);
  const [, startAdd] = useTransition();
  const [sel, setSel] = useState<Set<number>>(new Set(branches.map((b) => b.id)));
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  // Debounce'li qidiruv — 2+ belgi kiritilganda (event handler'da, effekt emas)
  const handleQueryChange = (value: string) => {
    setQ(value);
    clearTimeout(debounceRef.current);
    const query = value.trim();
    if (query.length < 2) {
      reqId.current++; // uchayotgan eski qidiruv natijasini bekor qilamiz
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const my = ++reqId.current;
      startSearch(async () => {
        const res = await searchProductsForInventoryAction(query);
        if (my !== reqId.current) return;
        if (res.ok) {
          setResults(res.rows);
          setSearched(true);
        } else toast.error(res.error);
      });
    }, 400);
  };

  const add = (row: InventorySearchRow) => {
    if (sel.size === 0) {
      toast.error("Kamida bitta filial tanlang.");
      return;
    }
    const bids = [...sel];
    setAddingId(row.productId);
    startAdd(async () => {
      const res = await addInventoryItemAction(row.productId, bids);
      setAddingId(null);
      if (res.ok) {
        toast.success(
          res.added > 0
            ? `${row.name} — ${res.added} ta filialga qo'shildi.`
            : `${row.name} tanlangan filiallarda allaqachon bor.`
        );
        setResults((prev) =>
          prev.map((r) =>
            r.productId === row.productId
              ? { ...r, inBranchIds: [...new Set([...r.inBranchIds, ...bids])] }
              : r
          )
        );
        onAdded();
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          clearTimeout(debounceRef.current);
          reqId.current++;
          setQ(""); setResults([]); setSearched(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>SKU qo&apos;shish</DialogTitle>
          <DialogDescription>Nomi yoki 1C kodi bo&apos;yicha qidiring (kamida 2 belgi).</DialogDescription>
        </DialogHeader>

        <BranchPicker branches={branches} selected={sel} onChange={setSel} />

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
            placeholder="Masalan: Coca-Cola yoki 10245"
            className="h-9 pl-8"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border/60">
          {searching ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Qidirilmoqda…
            </p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {searched ? "Topilmadi." : "Qidiruv natijalari shu yerda ko'rinadi."}
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {results.map((r) => {
                const missing = [...sel].filter((id) => !r.inBranchIds.includes(id));
                const fullyIn = sel.size > 0 && missing.length === 0;
                return (
                  <div key={r.productId} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.code}
                        {r.subName ? ` · ${r.subName}` : ""} · qoldiq: {fmtQty(r.currentStock)}
                        {r.inBranchIds.length > 0 && (
                          <span className="text-primary"> · {r.inBranchIds.length}/{branches.length} filialda</span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      disabled={addingId === r.productId || fullyIn}
                      onClick={() => add(r)}
                    >
                      {addingId === r.productId
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Plus className="h-3 w-3" />}
                      {fullyIn ? "Qo'shilgan" : "Qo'shish"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Excel (xlsx) orqali kodlar ro'yxatini yuklash ────────────────────────────
function XlsxImportDialog({
  open,
  onOpenChange,
  branches,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  branches: BranchOpt[];
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set(branches.map((b) => b.id)));
  const [running, startRun] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const run = () => {
    if (!file) { toast.error("Fayl tanlang."); return; }
    if (sel.size === 0) { toast.error("Kamida bitta filial tanlang."); return; }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("branchIds", JSON.stringify([...sel]));
    startRun(async () => {
      const res = await importInventoryItemsXlsxAction(fd);
      if (res.ok) {
        toast.success(
          `${res.matched} ta SKU topildi, ${res.added} ta (SKU × filial) qo'shildi.` +
            (res.unknownCodes.length > 0 ? ` Topilmagan kodlar: ${res.unknownCodes.join(", ")}${res.totalCodes - res.matched > res.unknownCodes.length ? "…" : ""}` : "")
        );
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        onOpenChange(false);
        onImported();
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excel&apos;dan SKU yuklash</DialogTitle>
          <DialogDescription>
            Faylda 1C SKU kodlari bo&apos;lsin (ustun/format erkin — barcha katakdagi kodlar
            o&apos;qiladi). Topilgan SKU&apos;lar tanlangan filiallarga qo&apos;shiladi.
          </DialogDescription>
        </DialogHeader>

        <BranchPicker branches={branches} selected={sel} onChange={setSel} />

        <Input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="h-9 cursor-pointer"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Bekor qilish
          </Button>
          <Button onClick={run} disabled={running || !file} className="gap-1.5">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            Yuklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
