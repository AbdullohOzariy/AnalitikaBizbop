"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pill } from "@/components/common/page";
import { Loader2, Save, CheckCircle2, Trash2, Truck, FileDown } from "lucide-react";
import { formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateDistributionItemsAction, confirmDistributionAction, deleteDistributionAction } from "../../actions";

export type DetailData = {
  id: number; status: string; targetDays: number; note: string;
  branch: string; createdBy: string; createdAt: string; confirmedAt: string | null;
  items: { productId: number; code: number; name: string; sub: string | null; qty: number; warehouseQty: number }[];
};

const STATUS: Record<string, { label: string; tone: "muted" | "green" | "red" }> = {
  DRAFT: { label: "Qoralama", tone: "muted" },
  CONFIRMED: { label: "Tasdiqlandi", tone: "green" },
  CANCELLED: { label: "Bekor", tone: "red" },
};

export function TaqsimotDetail({ data }: { data: DetailData }) {
  const router = useRouter();
  const isDraft = data.status === "DRAFT";
  const [qty, setQty] = useState<Map<number, string>>(() => new Map(data.items.map((i) => [i.productId, String(i.qty)])));
  const [note, setNote] = useState(data.note);
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();
  const busy = saving || acting;

  const setRow = (pid: number, v: string) => setQty((prev) => { const n = new Map(prev); n.set(pid, v); return n; });

  const chosen = useMemo(() => {
    const out: { productId: number; qty: number }[] = [];
    for (const it of data.items) { const v = Number(qty.get(it.productId)); if (v > 0) out.push({ productId: it.productId, qty: v }); }
    return out;
  }, [data.items, qty]);

  const save = () => {
    if (chosen.length === 0) { toast.error("Kamida bitta SKU miqdori kerak."); return; }
    startSave(async () => {
      const res = await updateDistributionItemsAction(data.id, chosen, note);
      if (res.ok) { toast.success("Saqlandi."); router.refresh(); } else toast.error(res.error);
    });
  };
  const confirm = () => {
    if (!window.confirm("Tasdiqlash — ombor qoldig'idan ayiriladi va qulflanadi. Davom etilsinmi?")) return;
    startAct(async () => {
      const res = await confirmDistributionAction(data.id);
      if (res.ok) { toast.success("Tasdiqlandi — ombordan ayirildi."); router.refresh(); } else toast.error(res.error);
    });
  };
  const remove = () => {
    if (!window.confirm(`#${data.id} taqsimot o'chirilsinmi?`)) return;
    startAct(async () => {
      const res = await deleteDistributionAction(data.id);
      if (res.ok) { toast.success("O'chirildi."); router.push("/logistika?tab=taqsimot"); } else toast.error(res.error);
    });
  };

  const st = STATUS[data.status] ?? { label: data.status, tone: "muted" as const };
  const total = data.items.reduce((s, i) => s + (Number(qty.get(i.productId)) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Truck className="h-4 w-4 text-muted-foreground" /> {data.branch}</span>
        <Pill tone={st.tone}>{st.label}</Pill>
        <span className="text-xs text-muted-foreground">Yaratdi: {data.createdBy} · {formatDateTimeUZ(data.createdAt)}</span>
        {data.confirmedAt && <span className="text-xs text-muted-foreground">Tasdiqlandi: {formatDateTimeUZ(data.confirmedAt)}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <a href={`/api/taqsimot/${data.id}/pdf`} target="_blank" rel="noopener noreferrer"
            title="Omborchi uchun pikking ro'yxati (PDF)"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <FileDown className="h-3.5 w-3.5" /> Pikking (PDF)
          </a>
          {isDraft ? (
            <>
              <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={save}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Saqlash
              </Button>
              <Button size="sm" variant="default" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={confirm}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Tasdiqlash
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" disabled={busy} onClick={remove}>
                <Trash2 className="h-3.5 w-3.5" /> O&apos;chirish
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Tasdiqlangan — tahrirlash yopiq.</span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[80px]">Kod</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="w-[140px]">Subkategoriya</TableHead>
                <TableHead className="text-right w-[100px]" title="Hozirgi ombor qoldig'i">Ombor</TableHead>
                <TableHead className="w-[120px] text-right">Miqdor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((i) => (
                <TableRow key={i.productId} className="text-sm">
                  <TableCell className="font-mono text-xs text-muted-foreground">{i.code}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={i.name}>{i.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{i.sub ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{i.warehouseQty.toLocaleString("uz-UZ")}</TableCell>
                  <TableCell className="text-right">
                    {isDraft ? (
                      <Input type="number" inputMode="decimal" value={qty.get(i.productId) ?? ""} disabled={busy}
                        onChange={(e) => setRow(i.productId, e.target.value)} className="h-7 w-24 px-1.5 text-right text-xs tabular-nums" />
                    ) : <span className="tabular-nums text-sm font-medium">{i.qty.toLocaleString("uz-UZ")}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">{data.items.length} ta SKU</span>
          <span><span className="text-muted-foreground">Jami miqdor:</span> <span className="font-bold tabular-nums">{total.toLocaleString("uz-UZ")}</span></span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Izoh</label>
        <Input value={note} disabled={!isDraft || busy} onChange={(e) => setNote(e.target.value)} placeholder="Taqsimot haqida izoh..." className="h-9" />
      </div>

      <p className={cn("text-[11px] text-muted-foreground", isDraft ? "" : "hidden")}>
        ⚠ Tasdiqlaganda har SKU miqdori hozirgi ombor qoldig&apos;idan ayiriladi (0 dan past tushmaydi). Kunlik import qoldiqlarni qayta tiklaydi.
      </p>
    </div>
  );
}
