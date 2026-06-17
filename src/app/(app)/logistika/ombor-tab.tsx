"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, X, Loader2, Upload, ChevronLeft, ChevronRight, Save, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { WarehouseRow } from "@/lib/warehouse";
import { warehouseStockAction, adjustWarehouseStockAction, importWarehouseStockAction } from "./actions";

export function OmborTab({ canEdit }: { canEdit: boolean }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [refresh, setRefresh] = useState(0);
  const [isPending, start] = useTransition();
  const [importing, startImport] = useTransition();
  const [editId, setEditId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const onQ = (v: string) => {
    setQInput(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setQ(v.trim()); setPage(1); }, 350);
  };

  useEffect(() => {
    const myId = ++reqId.current;
    start(async () => {
      const res = await warehouseStockAction({ q: q || undefined, page });
      if (myId !== reqId.current) return;
      if (res.ok) { setRows(res.rows); setTotal(res.total); setPageSize(res.pageSize); }
      else { toast.error(res.error); setRows([]); setTotal(0); }
    });
  }, [q, page, refresh]);

  const onImport = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    startImport(async () => {
      const res = await importWarehouseStockAction(fd);
      if (res.ok) {
        toast.success(`${res.matched.toLocaleString("uz-UZ")} ta SKU qoldig'i yangilandi${res.unmatched ? `, ${res.unmatched} kod topilmadi` : ""}.`);
        setPage(1);
        setRefresh((k) => k + 1);
      } else toast.error(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const saveQty = (r: WarehouseRow) => {
    const qty = Number(editQty);
    if (!Number.isFinite(qty) || qty < 0) { toast.error("Qoldiq manfiy bo'lmasligi kerak."); return; }
    start(async () => {
      const res = await adjustWarehouseStockAction({ productId: r.productId, qty });
      if (res.ok) { toast.success("Saqlandi."); setEditId(null); setRefresh((k) => k + 1); }
      else toast.error(res.error);
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => onQ(e.target.value)} placeholder="Qidirish — SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
          {qInput && (
            <button onClick={() => { setQInput(""); setQ(""); setPage(1); }} aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
            <Button variant="outline" className="h-9 gap-1.5" disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import (kod + qoldiq)
            </Button>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[90px]">Kod</TableHead>
                <TableHead>Nom (SKU)</TableHead>
                <TableHead className="w-[160px]">Subkategoriya</TableHead>
                <TableHead className="w-[120px] text-right">Qoldiq</TableHead>
                {canEdit && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && rows.length === 0 ? (
                <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Yuklanmoqda…
                </TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground">
                  {q ? "Hech narsa topilmadi." : "Ombor qoldig'i hali import qilinmagan — fayl (kod + qoldiq) yuklang."}
                </TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.productId} className="text-sm">
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={r.name}>{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.sub ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editId === r.productId ? (
                        <Input type="number" inputMode="decimal" value={editQty} disabled={isPending}
                          onChange={(e) => setEditQty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveQty(r)}
                          className="h-7 w-24 px-1.5 text-right text-xs tabular-nums" autoFocus />
                      ) : r.qty.toLocaleString("uz-UZ")}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        {editId === r.productId ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending} onClick={() => saveQty(r)} aria-label="Saqlash">
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditId(r.productId); setEditQty(String(r.qty)); }} aria-label="Tahrirlash">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <span className="text-xs text-muted-foreground tabular-nums">{total.toLocaleString("uz-UZ")} ta · sahifa {page}/{totalPages}</span>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={isPending || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Oldingi">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={isPending || page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Keyingi">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Import: Excel/CSV, ustunlar <b>kod</b> va <b>qoldiq</b> (sarlavha bo'yicha aniqlanadi; bo'lmasa 1- va 2-ustun).
        Kod bo'yicha yangilanadi (snapshot — kunlik). Topilmagan kodlar o'tkazib yuboriladi. Qoldiq 0 bo'lganlar ham import qilinadi.
      </p>
    </div>
  );
}
