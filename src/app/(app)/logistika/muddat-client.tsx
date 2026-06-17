"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pill } from "@/components/common/page";
import { Search, X, Loader2, Upload, Plus, Save, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpiryBatch, ExpiryStatus } from "@/lib/expiry";
import { addBatchAction, updateBatchAction, deleteBatchAction, importBatchesAction } from "./actions";

const dmy = (s: string) => s.split("-").reverse().join(".");

const ST: Record<ExpiryStatus, { label: string; tone: "red" | "orange" | "amber" | "muted" }> = {
  expired: { label: "Muddati o'tgan", tone: "red" },
  critical: { label: "Kritik", tone: "orange" },
  warn: { label: "Yaqin", tone: "amber" },
  ok: { label: "Yetarli", tone: "muted" },
};

export function MuddatClient({
  rows, branches, canEdit,
}: { rows: ExpiryBatch[]; branches: { id: number; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<"all" | ExpiryStatus>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [importing, startImport] = useTransition();
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Joy (location) tanlovi: "0" = Ombor, aks holda branch id
  const locItems = useMemo(() => {
    const o: Record<string, React.ReactNode> = { "0": "Ombor (markaziy)" };
    for (const b of branches) o[String(b.id)] = b.name;
    return o;
  }, [branches]);

  // Import joyi
  const [impLoc, setImpLoc] = useState("0");

  // Qo'shish formasi
  const [code, setCode] = useState("");
  const [addLoc, setAddLoc] = useState("0");
  const [aQty, setAQty] = useState("");
  const [aExp, setAExp] = useState("");
  const [aNote, setANote] = useState("");

  // Tahrirlash
  const [editId, setEditId] = useState<number | null>(null);
  const [eQty, setEQty] = useState("");
  const [eExp, setEExp] = useState("");
  const [eNote, setENote] = useState("");

  const Q = q.trim().toUpperCase();
  const shown = useMemo(
    () => rows.filter((r) =>
      (statusF === "all" || r.status === statusF) &&
      (!Q || r.name.toUpperCase().includes(Q) || String(r.code).includes(Q))
    ),
    [rows, Q, statusF]
  );

  const counts = useMemo(() => {
    const c = { expired: 0, critical: 0, warn: 0, atRisk: 0 };
    for (const r of rows) {
      if (r.status === "expired") c.expired++;
      else if (r.status === "critical") c.critical++;
      else if (r.status === "warn") c.warn++;
      c.atRisk += r.atRisk;
    }
    return c;
  }, [rows]);

  const onImport = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    if (impLoc !== "0") fd.set("branchId", impLoc);
    startImport(async () => {
      const res = await importBatchesAction(fd);
      if (res.ok) {
        toast.success(`${res.matched.toLocaleString("uz-UZ")} ta partiya import qilindi${res.unmatched ? `, ${res.unmatched} kod topilmadi` : ""}.`);
        router.refresh();
      } else toast.error(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const onAdd = () => {
    if (!code.trim() || !aQty.trim() || !aExp) { toast.error("Kod, miqdor va muddat shart."); return; }
    startSave(async () => {
      const res = await addBatchAction({
        code: Number(code), branchId: addLoc === "0" ? null : Number(addLoc),
        qty: Number(aQty), expiry: aExp, note: aNote,
      });
      if (res.ok) {
        toast.success(`Saqlandi: ${res.productName}`);
        setCode(""); setAQty(""); setAExp(""); setANote("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const startEdit = (r: ExpiryBatch) => { setEditId(r.id); setEQty(String(r.qty)); setEExp(r.expiryDate); setENote(r.note ?? ""); };
  const saveEdit = () => {
    if (!eQty.trim() || !eExp) { toast.error("Miqdor va muddat shart."); return; }
    startSave(async () => {
      const res = await updateBatchAction({ id: editId!, qty: Number(eQty), expiry: eExp, note: eNote });
      if (res.ok) { toast.success("Saqlandi."); setEditId(null); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const onDelete = (r: ExpiryBatch) => {
    if (!window.confirm(`${r.name} (${dmy(r.expiryDate)}) partiyasi o'chirilsinmi?`)) return;
    startSave(async () => {
      const res = await deleteBatchAction(r.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); } else toast.error(res.error);
    });
  };

  const SF: { v: "all" | ExpiryStatus; l: string }[] = [
    { v: "all", l: "Hammasi" }, { v: "expired", l: "Muddati o'tgan" },
    { v: "critical", l: "Kritik" }, { v: "warn", l: "Yaqin" }, { v: "ok", l: "Yetarli" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chip label="Muddati o'tgan" value={counts.expired} tone="red" />
        <Chip label="Kritik (≤3 kun)" value={counts.critical} tone="orange" />
        <Chip label="Yaqin (≤14 kun)" value={counts.warn} tone="amber" />
        <Chip label="Markdown xavfi" value={Math.round(counts.atRisk)} tone="muted" hint="muddatgacha sotilmaydigan dona" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish — SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
          {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="flex flex-wrap gap-1">
          {SF.map((f) => (
            <button key={f.v} onClick={() => setStatusF(f.v)}
              className={cn("inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                statusF === f.v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary")}>
              {f.l}
            </button>
          ))}
        </div>
        {canEdit && (
          <>
            <Button className="h-9 gap-1.5" onClick={() => setShowAdd((s) => !s)}>
              <Plus className="h-4 w-4" /> Partiya qo&apos;shish
            </Button>
            <div className="flex items-center gap-1.5">
              <Select value={impLoc} onValueChange={(v) => setImpLoc(typeof v === "string" ? v : "0")} items={locItems}>
                <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Ombor (markaziy)</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
              <Button variant="outline" className="h-9 gap-1.5" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
              </Button>
            </div>
          </>
        )}
      </div>

      {canEdit && showAdd && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Kod</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="SKU kodi" className="h-9 w-28" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Joy</Label>
            <Select value={addLoc} onValueChange={(v) => setAddLoc(typeof v === "string" ? v : "0")} items={locItems}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Ombor (markaziy)</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Miqdor</Label>
            <Input value={aQty} onChange={(e) => setAQty(e.target.value)} type="number" inputMode="decimal" className="h-9 w-24 text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Muddat</Label>
            <Input value={aExp} onChange={(e) => setAExp(e.target.value)} type="date" className="h-9 w-40" />
          </div>
          <div className="space-y-1 min-w-40 flex-1">
            <Label className="text-xs text-muted-foreground">Izoh (ixtiyoriy)</Label>
            <Input value={aNote} onChange={(e) => setANote(e.target.value)} placeholder="Partiya raqami va h.k." className="h-9" />
          </div>
          <Button className="h-9 gap-1.5" disabled={saving} onClick={onAdd}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Saqlash
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[80px]">Kod</TableHead>
                <TableHead>Mahsulot</TableHead>
                <TableHead className="w-[130px]">Joy</TableHead>
                <TableHead className="text-right w-[90px]">Qoldiq</TableHead>
                <TableHead className="w-[120px]">Muddat</TableHead>
                <TableHead className="text-right w-[80px]" title="Muddatgacha qolgan kun">Qolgan</TableHead>
                <TableHead className="text-right w-[80px]" title="Kunlik o'rtacha sotuv">Kunlik</TableHead>
                <TableHead className="text-right w-[100px]" title="Muddatgacha sotilmaydigan miqdor (chegirma kerak)">Markdown</TableHead>
                <TableHead>Holat</TableHead>
                {canEdit && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow><TableCell colSpan={canEdit ? 10 : 9} className="py-8 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "Partiya kiritilmagan — qo'lda qo'shing yoki fayl (kod + muddat + qoldiq) import qiling." : "Filtrga mos partiya yo'q."}
                </TableCell></TableRow>
              ) : shown.map((r) => {
                const st = ST[r.status];
                const editing = editId === r.id;
                return (
                  <TableRow key={r.id} className={cn("text-sm", r.status === "expired" && "bg-red-500/[0.05]", r.status === "critical" && "bg-orange-500/[0.05]")}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={r.name}>
                      {r.name}{r.sub && <span className="ml-1 text-[10px] text-muted-foreground">· {r.sub}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.location}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editing ? <Input value={eQty} onChange={(e) => setEQty(e.target.value)} type="number" inputMode="decimal" className="h-7 w-20 px-1.5 text-right text-xs" />
                        : r.qty.toLocaleString("uz-UZ")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {editing ? <Input value={eExp} onChange={(e) => setEExp(e.target.value)} type="date" className="h-7 w-36 px-1.5 text-xs" />
                        : dmy(r.expiryDate)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums text-xs", r.daysUntil < 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {r.daysUntil < 0 ? `${-r.daysUntil} kun o'tdi` : `${r.daysUntil} kun`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{r.dailyAvg > 0 ? r.dailyAvg.toLocaleString("uz-UZ", { maximumFractionDigits: 1 }) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-xs", r.atRisk > 0 ? "font-medium text-orange-600 dark:text-orange-400" : "text-muted-foreground/50")}>
                      {r.atRisk > 0 ? r.atRisk.toLocaleString("uz-UZ", { maximumFractionDigits: 1 }) : "—"}
                    </TableCell>
                    <TableCell><Pill tone={st.tone}>{st.label}</Pill></TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        {editing ? (
                          <div className="flex justify-end gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={saveEdit} aria-label="Saqlash"><Save className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)} aria-label="Bekor"><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)} aria-label="Tahrirlash"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={saving} onClick={() => onDelete(r)} aria-label="O'chirish"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground tabular-nums">{shown.length.toLocaleString("uz-UZ")} ta partiya</div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <b>Markdown</b> = qoldiq − (kunlik o&apos;rtacha × muddatgacha qolgan kun): joriy sur&apos;atda muddatgacha
        sotilmaydigan, ya&apos;ni chegirma/aksiya kerak bo&apos;ladigan miqdor. Import: Excel/CSV, ustunlar
        <b> kod</b>, <b>muddat</b> (sana), <b>qoldiq</b> — tanlangan joyga (kod+muddat bo&apos;yicha yangilanadi).
      </p>
    </div>
  );
}

function Chip({ label, value, tone, hint }: { label: string; value: number; tone: "red" | "orange" | "amber" | "muted"; hint?: string }) {
  const cls = tone === "red" ? "text-red-600 dark:text-red-400" : tone === "orange" ? "text-orange-600 dark:text-orange-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", cls)}>{value.toLocaleString("uz-UZ")}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
