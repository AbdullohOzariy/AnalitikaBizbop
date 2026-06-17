"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Search, X, Loader2, Save, Calculator, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TransferSuggest } from "@/lib/transfer";
import { transferSuggestAction, createTransferAction } from "../../actions";

export function KochirishBuilder({ branches }: { branches: { id: number; name: string }[] }) {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [targetDays, setTargetDays] = useState("7");
  const [items, setItems] = useState<TransferSuggest[]>([]);
  const [qty, setQty] = useState<Map<number, string>>(new Map());
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [computed, setComputed] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const fromLabels = useMemo(() => {
    const o: Record<string, React.ReactNode> = {};
    for (const b of branches) o[String(b.id)] = b.name;
    return o;
  }, [branches]);
  const toLabels = fromLabels;

  const reset = () => { setComputed(false); setItems([]); setQty(new Map()); };

  const compute = () => {
    if (!fromId) { toast.error("Manba filialni tanlang."); return; }
    if (!toId) { toast.error("Qabul qiluvchi filialni tanlang."); return; }
    if (fromId === toId) { toast.error("Manba va qabul qiluvchi bir xil bo'lmasin."); return; }
    const td = Number(targetDays);
    if (!Number.isInteger(td) || td < 1 || td > 60) { toast.error("Qoplash kunlari 1–60 oralig'ida."); return; }
    startLoad(async () => {
      const res = await transferSuggestAction(Number(fromId), Number(toId), td);
      if (res.ok) {
        setItems(res.items);
        setQty(new Map(res.items.map((it) => [it.productId, String(it.suggest)])));
        setComputed(true);
      } else toast.error(res.error);
    });
  };

  const setRowQty = (pid: number, v: string) => setQty((prev) => { const n = new Map(prev); n.set(pid, v); return n; });

  const Q = q.trim().toUpperCase();
  const shown = useMemo(
    () => (Q ? items.filter((i) => i.name.toUpperCase().includes(Q) || String(i.code).includes(Q)) : items),
    [items, Q]
  );

  const chosen = useMemo(() => {
    const out: { productId: number; qty: number }[] = [];
    for (const it of items) {
      const v = Number(qty.get(it.productId));
      if (v > 0) out.push({ productId: it.productId, qty: v });
    }
    return out;
  }, [items, qty]);

  const save = () => {
    if (!fromId || !toId) { toast.error("Filiallarni tanlang."); return; }
    if (chosen.length === 0) { toast.error("Kamida bitta SKU uchun miqdor kiriting."); return; }
    startSave(async () => {
      const res = await createTransferAction({ fromBranchId: Number(fromId), toBranchId: Number(toId), targetDays: Number(targetDays), note, items: chosen });
      if (res.ok) { toast.success("Ko'chirish yaratildi (qoralama)."); router.push(`/logistika/kochirish/${res.id}`); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Manba (ortiqcha qoldiqli)</Label>
          <Select value={fromId} onValueChange={(v) => { setFromId(typeof v === "string" ? v : ""); reset(); }} disabled={loading || saving} items={fromLabels}>
            <SelectTrigger className="h-9 w-52 text-sm"><SelectValue placeholder="Manba filial…" /></SelectTrigger>
            <SelectContent>
              {branches.filter((b) => String(b.id) !== toId).map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Qabul qiluvchi (kam/OOS)</Label>
          <Select value={toId} onValueChange={(v) => { setToId(typeof v === "string" ? v : ""); reset(); }} disabled={loading || saving} items={toLabels}>
            <SelectTrigger className="h-9 w-52 text-sm"><SelectValue placeholder="Qabul qiluvchi filial…" /></SelectTrigger>
            <SelectContent>
              {branches.filter((b) => String(b.id) !== fromId).map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Qoplash (kun)</Label>
          <Input type="number" inputMode="numeric" value={targetDays} onChange={(e) => setTargetDays(e.target.value)}
            className="h-9 w-24" min={1} max={60} />
        </div>
        <Button type="button" onClick={compute} disabled={loading || saving} className="h-9 gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Hisoblash
        </Button>
        {items.length > 0 && (
          <div className="relative min-w-56 flex-1">
            <Label className="text-xs text-muted-foreground">Qidirish</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
              {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Hisoblanmoqda…</p>
      ) : !computed ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Manba, qabul qiluvchi va qoplash kunlarini tanlab, &quot;Hisoblash&quot;ni bosing.</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Ko&apos;chirish tavsiyasi yo&apos;q (manbada ortiqcha qoldiq yo&apos;q yoki qabul qiluvchining ehtiyoji 0).</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[80px]">Kod</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right w-[90px]" title="Manba qoldig'i">Manba</TableHead>
                    <TableHead className="text-right w-[90px]" title="Manbadagi ortiqcha (o'ziga kerakdan ortig'i)">Ortiqcha</TableHead>
                    <TableHead className="text-right w-[90px]" title="Qabul qiluvchi qoldig'i">Qabul q.</TableHead>
                    <TableHead className="text-right w-[80px]" title="Qabul qiluvchining ehtiyoji">Ehtiyoj</TableHead>
                    <TableHead className="text-right w-[80px]" title="Tavsiya (ortiqcha bilan cheklangan ehtiyoj)">Tavsiya</TableHead>
                    <TableHead className="w-[110px] bg-primary/[0.03]">Miqdor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((it) => {
                    const v = Number(qty.get(it.productId)) || 0;
                    return (
                      <TableRow key={it.productId} className={cn("text-sm", v > 0 && "bg-emerald-500/10")}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{it.code}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={it.name}>
                          {it.name}
                          {it.sub && <span className="ml-1.5 text-[10px] text-muted-foreground">· {it.sub}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{it.sourceStock.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.sourceSurplus.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.targetStock.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{it.need.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">{it.suggest.toLocaleString("uz-UZ")}</TableCell>
                        <TableCell className="bg-primary/[0.03] px-2">
                          <Input type="number" inputMode="decimal" value={qty.get(it.productId) ?? ""}
                            placeholder={String(it.suggest)} onChange={(e) => setRowQty(it.productId, e.target.value)}
                            className="h-7 w-24 px-1.5 text-right text-xs tabular-nums" aria-label="Miqdor" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Izoh (ixtiyoriy)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ko'chirish haqida izoh..." className="h-9" />
          </div>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            <span className="text-sm">
              <span className="text-muted-foreground">Tanlandi:</span> <span className="font-semibold text-emerald-700 dark:text-emerald-400">{chosen.length} SKU</span>
            </span>
            <Button onClick={save} disabled={saving || chosen.length === 0} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Saqlash (qoralama)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
