"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye, Trash2, CheckCircle2, Loader2, Plus, Save, GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import {
  saveAnketaFieldAction, deleteAnketaFieldAction,
  setAnketaStatusAction, deleteAnketaSubmissionAction,
} from "./actions";

export type FieldRow = {
  id: number; section: string; label: string; type: string;
  required: boolean; sortOrder: number; active: boolean;
};
export type SubmissionRow = {
  id: number; companyName: string; phone: string | null;
  status: string; createdAt: string; answers: Record<string, string>;
};

const TYPE_LABEL: Record<string, string> = {
  text: "Matn", textarea: "Katta matn", number: "Raqam", yesno: "Ha/Yo'q", consent: "Tasdiqlash",
};

// ─── Javoblar ro'yxati ────────────────────────────────────────────────────────

export function SubmissionsList({ rows, fields }: { rows: SubmissionRow[]; fields: FieldRow[] }) {
  const router = useRouter();
  const [view, setView] = useState<SubmissionRow | null>(null);
  const [isPending, start] = useTransition();
  const fieldById = new Map(fields.map((f) => [String(f.id), f]));

  const toggleStatus = (r: SubmissionRow) => {
    start(async () => {
      const res = await setAnketaStatusAction(r.id, r.status === "NEW" ? "REVIEWED" : "NEW");
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  };
  const remove = (id: number) => {
    if (!confirm("Bu anketani o'chirasizmi?")) return;
    start(async () => {
      const res = await deleteAnketaSubmissionAction(id);
      if (res.ok) { toast.success("O'chirildi."); setView(null); router.refresh(); }
      else toast.error(res.error);
    });
  };

  // Ko'rish dialogida javoblarni bo'lim bo'yicha guruhlash
  const grouped = (r: SubmissionRow) => {
    const out: { section: string; items: { label: string; value: string }[] }[] = [];
    for (const f of fields) {
      const v = r.answers[String(f.id)];
      if (v === undefined) continue;
      let sec = out.find((s) => s.section === f.section);
      if (!sec) { sec = { section: f.section, items: [] }; out.push(sec); }
      sec.items.push({ label: f.label, value: v });
    }
    // O'chirilgan maydon javoblari ham yo'qolmasin
    for (const [k, v] of Object.entries(r.answers)) {
      if (!fieldById.has(k)) {
        let sec = out.find((s) => s.section === "Boshqa");
        if (!sec) { sec = { section: "Boshqa", items: [] }; out.push(sec); }
        sec.items.push({ label: `Maydon #${k} (o'chirilgan)`, value: v });
      }
    }
    return out;
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm italic text-muted-foreground">
            Hozircha anketa kelmagan. Forma: supplier.oilagroup.uz
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[60px]">№</TableHead>
                <TableHead>Kompaniya</TableHead>
                <TableHead className="w-[150px]">Telefon</TableHead>
                <TableHead className="w-[110px]">Holat</TableHead>
                <TableHead className="w-[140px]">Sana</TableHead>
                <TableHead className="w-[120px] text-right">Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={cn("text-sm", r.status === "NEW" && "bg-emerald-500/5 font-medium")}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{r.id}</TableCell>
                  <TableCell className="max-w-[240px] truncate">{r.companyName}</TableCell>
                  <TableCell className="text-xs">{r.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Pill tone={r.status === "NEW" ? "green" : "muted"} className="text-[10px]">
                      {r.status === "NEW" ? "Yangi" : "Ko'rildi"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setView(r)} aria-label="Ko'rish">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                        onClick={() => toggleStatus(r)} aria-label="Holatni almashtirish"
                        title={r.status === "NEW" ? "Ko'rildi deb belgilash" : "Yangi deb belgilash"}>
                        <CheckCircle2 className={cn("h-3.5 w-3.5", r.status === "REVIEWED" && "text-emerald-500")} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                        onClick={() => remove(r.id)} aria-label="O'chirish">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Ko'rish dialogi */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle>{view.companyName}</DialogTitle>
                <DialogDescription>
                  #{view.id} · {view.createdAt}{view.phone ? ` · ${view.phone}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {grouped(view).map((s) => (
                  <div key={s.section}>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{s.section}</p>
                    <div className="space-y-1.5">
                      {s.items.map((it, i) => (
                        <div key={i} className="rounded-lg border border-border/60 px-3 py-1.5">
                          <p className="text-[11px] text-muted-foreground">{it.label}</p>
                          <p className="text-sm">{it.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Maydonlar tahriri ────────────────────────────────────────────────────────

const emptyNew = { section: "", label: "", type: "text", required: false };

export function FieldsEditor({ fields }: { fields: FieldRow[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, Partial<FieldRow>>>({});
  const [isPending, start] = useTransition();
  const [nf, setNf] = useState<typeof emptyNew>(emptyNew);

  const sections = [...new Set(fields.map((f) => f.section))];
  const val = <K extends keyof FieldRow>(f: FieldRow, k: K): FieldRow[K] =>
    (edits[f.id]?.[k] ?? f[k]) as FieldRow[K];
  const setVal = (id: number, patch: Partial<FieldRow>) =>
    setEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const save = (f: FieldRow) => {
    const merged = { ...f, ...edits[f.id] };
    start(async () => {
      const res = await saveAnketaFieldAction({
        id: f.id, section: merged.section, label: merged.label,
        type: merged.type as "text", required: merged.required,
        sortOrder: merged.sortOrder, active: merged.active,
      });
      if (res.ok) {
        toast.success("Saqlandi.");
        setEdits((p) => { const n = { ...p }; delete n[f.id]; return n; });
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const remove = (f: FieldRow) => {
    if (!confirm(`"${f.label}" maydonini o'chirasizmi? (Tarixiy javoblar uchun "Aktiv"ni o'chirish tavsiya etiladi)`)) return;
    start(async () => {
      const res = await deleteAnketaFieldAction(f.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const addNew = () => {
    if (!nf.section.trim() || !nf.label.trim()) { toast.error("Bo'lim va savol matnini kiriting."); return; }
    const maxSort = Math.max(0, ...fields.filter((f) => f.section === nf.section.trim()).map((f) => f.sortOrder));
    start(async () => {
      const res = await saveAnketaFieldAction({
        section: nf.section.trim(), label: nf.label.trim(),
        type: nf.type as "text", required: nf.required, sortOrder: maxSort + 10, active: true,
      });
      if (res.ok) { toast.success("Maydon qo'shildi."); setNf(emptyNew); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Yangi maydon */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-44 space-y-1">
            <Label className="text-xs text-muted-foreground">Bo&apos;lim</Label>
            <Input list="anketa-sections" value={nf.section} onChange={(e) => setNf({ ...nf, section: e.target.value })}
              placeholder="Bo'lim nomi" className="h-9" />
            <datalist id="anketa-sections">
              {sections.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="min-w-64 flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Savol matni</Label>
            <Input value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })}
              placeholder="Yangi savol..." className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Turi</Label>
            <select value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label className="flex h-9 items-center gap-1.5 text-sm">
            <input type="checkbox" checked={nf.required} onChange={(e) => setNf({ ...nf, required: e.target.checked })}
              className="h-4 w-4 accent-emerald-600" />
            Majburiy
          </label>
          <Button onClick={addNew} disabled={isPending} className="h-9 gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Qo&apos;shish
          </Button>
        </CardContent>
      </Card>

      {/* Mavjud maydonlar — bo'lim bo'yicha */}
      {sections.map((sec) => (
        <Card key={sec} className="overflow-hidden">
          <CardContent className="p-0">
            <div className="border-b border-border/60 bg-muted/30 px-4 py-2 text-sm font-bold">{sec}</div>
            <div className="divide-y divide-border/40">
              {fields.filter((f) => f.section === sec).map((f) => {
                const dirty = !!edits[f.id];
                return (
                  <div key={f.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !val(f, "active") && "opacity-50")}>
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    <Input type="number" value={val(f, "sortOrder")} onChange={(e) => setVal(f.id, { sortOrder: Number(e.target.value) })}
                      className="h-8 w-16 text-center text-xs" title="Tartib" />
                    <Input value={val(f, "label")} onChange={(e) => setVal(f.id, { label: e.target.value })}
                      className="h-8 min-w-56 flex-1 text-xs" />
                    <select value={val(f, "type")} onChange={(e) => setVal(f.id, { type: e.target.value })}
                      className="h-8 rounded-md border border-input bg-background px-1.5 text-xs">
                      {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs" title="Majburiy">
                      <input type="checkbox" checked={val(f, "required")} onChange={(e) => setVal(f.id, { required: e.target.checked })}
                        className="h-3.5 w-3.5 accent-emerald-600" /> maj.
                    </label>
                    <label className="flex items-center gap-1 text-xs" title="Formada ko'rinadi">
                      <input type="checkbox" checked={val(f, "active")} onChange={(e) => setVal(f.id, { active: e.target.checked })}
                        className="h-3.5 w-3.5 accent-emerald-600" /> aktiv
                    </label>
                    <Button size="icon" variant={dirty ? "default" : "ghost"} className="h-7 w-7" disabled={isPending || !dirty}
                      onClick={() => save(f)} aria-label="Saqlash">
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                      onClick={() => remove(f)} aria-label="O'chirish">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
