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
import { Plus, Trash2, Search, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  searchProductsForInventoryAction,
  addInventoryItemAction,
  removeInventoryItemAction,
  type InventorySearchRow,
} from "./actions";

export type InventoryItemRow = {
  id: number;
  code: number;
  name: string;
  subName: string | null;
  currentStock: number | null;
  createdByName: string;
  createdAtText: string;
};

const fmtQty = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 });

export function ItemsClient({
  rows,
  canManage,
}: {
  rows: InventoryItemRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [del, setDel] = useState<InventoryItemRow | null>(null);
  const [deleting, startDelete] = useTransition();

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
          Ro&apos;yxatda <b className="text-foreground">{rows.length}</b> ta SKU
        </p>
        {canManage && (
          <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> SKU qo&apos;shish
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Kod</TableHead>
              <TableHead>Nomi</TableHead>
              <TableHead>Subkategoriya</TableHead>
              <TableHead className="text-right">Joriy qoldiq (jami)</TableHead>
              <TableHead>Qo&apos;shgan</TableHead>
              {canManage && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">
                  Ro&apos;yxat bo&apos;sh — hali SKU belgilanmagan.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
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
        <AddSkuDialog open={addOpen} onOpenChange={setAddOpen} onAdded={() => router.refresh()} />
      )}

      {/* O'chirish tasdiqlash */}
      <Dialog open={del !== null} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SKU ro&apos;yxatdan o&apos;chirilsinmi?</DialogTitle>
            <DialogDescription>
              {del ? `${del.code} — ${del.name}` : ""}. Kiritilgan sanash tarixi saqlanib qoladi.
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

// ─── SKU qidiruv + qo'shish dialogi ──────────────────────────────────────────
function AddSkuDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<InventorySearchRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const [addingId, setAddingId] = useState<number | null>(null);
  const [, startAdd] = useTransition();
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
    setAddingId(row.productId);
    startAdd(async () => {
      const res = await addInventoryItemAction(row.productId);
      setAddingId(null);
      if (res.ok) {
        toast.success(`${row.name} ro'yxatga qo'shildi.`);
        setResults((prev) =>
          prev.map((r) => (r.productId === row.productId ? { ...r, inList: true } : r))
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

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/60">
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
              {results.map((r) => (
                <div key={r.productId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.code}
                      {r.subName ? ` · ${r.subName}` : ""} · qoldiq: {fmtQty(r.currentStock)}
                    </p>
                  </div>
                  {r.inList ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">
                      <Check className="h-3.5 w-3.5" /> Ro&apos;yxatda
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      disabled={addingId === r.productId}
                      onClick={() => add(r)}
                    >
                      {addingId === r.productId
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Plus className="h-3 w-3" />}
                      Qo&apos;shish
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
