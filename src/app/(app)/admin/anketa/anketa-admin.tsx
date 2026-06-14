"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye, Trash2, CheckCircle2, Loader2, Plus, Save, GripVertical, X, Check,
  ChevronUp, ChevronDown, Pencil, FolderPlus,
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
  addAnketaSectionAction, renameAnketaSectionAction,
  deleteAnketaSectionAction, moveAnketaSectionAction,
  setAnketaStatusAction, deleteAnketaSubmissionAction,
} from "./actions";

export type SectionRow = { id: number; title: string; sortOrder: number };
export type FieldRow = {
  id: number; sectionId: number; sectionTitle: string; label: string; type: string;
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

export function SubmissionsList({ rows, fields, canDelete = true }: { rows: SubmissionRow[]; fields: FieldRow[]; canDelete?: boolean }) {
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

  // Ko'rish dialogida javoblarni bo'lim bo'yicha guruhlash (sectionId bo'yicha —
  // bir xil nomli ikki bo'lim aralashib ketmasin). -1 = o'chirilgan maydonlar.
  const grouped = (r: SubmissionRow) => {
    const out: { sectionId: number; section: string; items: { label: string; value: string }[] }[] = [];
    for (const f of fields) {
      const v = r.answers[String(f.id)];
      if (v === undefined) continue;
      let sec = out.find((s) => s.sectionId === f.sectionId);
      if (!sec) { sec = { sectionId: f.sectionId, section: f.sectionTitle, items: [] }; out.push(sec); }
      sec.items.push({ label: f.label, value: v });
    }
    // O'chirilgan maydon javoblari ham yo'qolmasin
    for (const [k, v] of Object.entries(r.answers)) {
      if (!fieldById.has(k)) {
        let sec = out.find((s) => s.sectionId === -1);
        if (!sec) { sec = { sectionId: -1, section: "Boshqa", items: [] }; out.push(sec); }
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
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                          onClick={() => remove(r.id)} aria-label="O'chirish">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
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
                  <div key={s.sectionId}>
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

const emptyNewField = { sectionId: 0, label: "", type: "text", required: false };

export function FieldsEditor({ sections, fields }: { sections: SectionRow[]; fields: FieldRow[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, Partial<FieldRow>>>({});
  const [isPending, start] = useTransition();
  const [nf, setNf] = useState<typeof emptyNewField>(emptyNewField);
  const [newSecTitle, setNewSecTitle] = useState("");
  // Inline rename rejimi (bir vaqtda bitta bo'lim)
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);

  // Yangi maydon formasidagi bo'lim — tanlangan id mavjud bo'lmasa birinchi bo'limga tushadi
  const nfSectionId = sections.some((s) => s.id === nf.sectionId) ? nf.sectionId : (sections[0]?.id ?? 0);

  const val = <K extends keyof FieldRow>(f: FieldRow, k: K): FieldRow[K] =>
    (edits[f.id]?.[k] ?? f[k]) as FieldRow[K];
  const setVal = (id: number, patch: Partial<FieldRow>) =>
    setEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  // ── Bo'lim amallari ──
  const addSection = () => {
    const title = newSecTitle.trim();
    if (!title) { toast.error("Bo'lim nomini kiriting."); return; }
    start(async () => {
      const res = await addAnketaSectionAction({ title });
      if (res.ok) { toast.success("Bo'lim qo'shildi."); setNewSecTitle(""); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const saveRename = () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (!title) { toast.error("Bo'lim nomini kiriting."); return; }
    const id = renaming.id;
    start(async () => {
      const res = await renameAnketaSectionAction({ id, title });
      if (res.ok) { toast.success("Bo'lim nomi yangilandi."); setRenaming(null); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const removeSection = (s: SectionRow) => {
    const count = fields.filter((f) => f.sectionId === s.id).length;
    const msg = count > 0
      ? `"${s.title}" bo'limini va undagi ${count} ta maydonni o'chirasizmi?\n\n` +
        `Diqqat: bu maydonlarga oldin kelgan anketa javoblari "o'chirilgan maydon" ` +
        `sifatida ko'rinadi (qiymat saqlanadi, lekin savol matni yo'qoladi). Amalni qaytarib bo'lmaydi.`
      : `"${s.title}" bo'limini o'chirasizmi?`;
    if (!confirm(msg)) return;
    start(async () => {
      const res = await deleteAnketaSectionAction(s.id);
      if (res.ok) { toast.success("Bo'lim o'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const moveSection = (id: number, dir: "up" | "down") => {
    start(async () => {
      const res = await moveAnketaSectionAction({ id, dir });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  };

  // ── Maydon amallari ──
  const addField = () => {
    if (!nfSectionId) { toast.error("Avval bo'lim qo'shing."); return; }
    if (!nf.label.trim()) { toast.error("Savol matnini kiriting."); return; }
    start(async () => {
      const res = await saveAnketaFieldAction({
        sectionId: nfSectionId, label: nf.label.trim(),
        type: nf.type as "text", required: nf.required,
      });
      if (res.ok) {
        toast.success("Maydon qo'shildi.");
        setNf((p) => ({ ...p, sectionId: nfSectionId, label: "", required: false }));
        router.refresh();
      } else toast.error(res.error);
    });
  };
  const saveField = (f: FieldRow) => {
    const m = { ...f, ...edits[f.id] };
    start(async () => {
      const res = await saveAnketaFieldAction({
        id: f.id, sectionId: m.sectionId, label: m.label,
        type: m.type as "text", required: m.required, sortOrder: m.sortOrder, active: m.active,
      });
      if (res.ok) {
        toast.success("Saqlandi.");
        setEdits((p) => { const n = { ...p }; delete n[f.id]; return n; });
        router.refresh();
      } else toast.error(res.error);
    });
  };
  const removeField = (f: FieldRow) => {
    if (!confirm(`"${f.label}" maydonini o'chirasizmi? (Tarixiy javoblar uchun "Aktiv"ni o'chirish tavsiya etiladi)`)) return;
    start(async () => {
      const res = await deleteAnketaFieldAction(f.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Yangi bo'lim + yangi maydon */}
      <Card>
        <CardContent className="space-y-3 p-4">
          {/* Bo'sh bo'lim qo'shish */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Yangi bo&apos;lim</Label>
              <Input value={newSecTitle} onChange={(e) => setNewSecTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection(); } }}
                placeholder="Bo'lim nomi (mas. TIJORAT SHARTLARI)" className="h-9" />
            </div>
            <Button onClick={addSection} disabled={isPending} variant="secondary" className="h-9 gap-1.5">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} Bo&apos;lim qo&apos;shish
            </Button>
          </div>

          <div className="border-t border-border/60" />

          {/* Yangi maydon */}
          {sections.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Maydon qo&apos;shish uchun avval bo&apos;lim yarating.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-44 space-y-1">
                <Label className="text-xs text-muted-foreground">Bo&apos;lim</Label>
                <select value={nfSectionId} onChange={(e) => setNf({ ...nf, sectionId: Number(e.target.value) })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div className="min-w-64 flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Savol matni</Label>
                <Input value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }}
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
              <Button onClick={addField} disabled={isPending} className="h-9 gap-1.5">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Qo&apos;shish
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {sections.length === 0 && (
        <p className="py-8 text-center text-sm italic text-muted-foreground">Hali bo&apos;lim yo&apos;q.</p>
      )}

      {/* Bo'limlar — tartib bo'yicha */}
      {sections.map((sec, si) => {
        const secFields = fields.filter((f) => f.sectionId === sec.id);
        return (
          <Card key={sec.id} className="overflow-hidden">
            <CardContent className="p-0">
              {/* Bo'lim sarlavhasi */}
              <div className="flex items-center gap-1 border-b border-border/60 bg-muted/30 px-3 py-1.5">
                {renaming?.id === sec.id ? (
                  <>
                    <Input autoFocus value={renaming.title}
                      onChange={(e) => setRenaming({ id: sec.id, title: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveRename(); }
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-7 flex-1 text-sm font-bold" />
                    <Button size="icon" variant="default" className="h-7 w-7" disabled={isPending}
                      onClick={saveRename} aria-label="Saqlash">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setRenaming(null)} aria-label="Bekor qilish">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-bold">{sec.title}</span>
                    <span className="mr-1 text-[11px] text-muted-foreground">{secFields.length} maydon</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                      onClick={() => setRenaming({ id: sec.id, title: sec.title })}
                      aria-label="Nomini tahrirlash" title="Bo'lim nomini tahrirlash">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending || si === 0}
                      onClick={() => moveSection(sec.id, "up")} aria-label="Yuqoriga" title="Bo'limni yuqoriga">
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending || si === sections.length - 1}
                      onClick={() => moveSection(sec.id, "down")} aria-label="Pastga" title="Bo'limni pastga">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                      onClick={() => removeSection(sec)} aria-label="Bo'limni o'chirish" title="Bo'limni o'chirish">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </>
                )}
              </div>

              {/* Maydonlar */}
              {secFields.length === 0 ? (
                <p className="px-4 py-3 text-xs italic text-muted-foreground">Maydon yo&apos;q — yuqoridagi formadan qo&apos;shing.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {secFields.map((f) => {
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
                        {sections.length > 1 && (
                          <select value={val(f, "sectionId")} onChange={(e) => setVal(f.id, { sectionId: Number(e.target.value) })}
                            className="h-8 max-w-36 rounded-md border border-input bg-background px-1.5 text-xs"
                            title="Bo'limni o'zgartirish">
                            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                          </select>
                        )}
                        <label className="flex items-center gap-1 text-xs" title="Majburiy">
                          <input type="checkbox" checked={val(f, "required")} onChange={(e) => setVal(f.id, { required: e.target.checked })}
                            className="h-3.5 w-3.5 accent-emerald-600" /> maj.
                        </label>
                        <label className="flex items-center gap-1 text-xs" title="Formada ko'rinadi">
                          <input type="checkbox" checked={val(f, "active")} onChange={(e) => setVal(f.id, { active: e.target.checked })}
                            className="h-3.5 w-3.5 accent-emerald-600" /> aktiv
                        </label>
                        <Button size="icon" variant={dirty ? "default" : "ghost"} className="h-7 w-7" disabled={isPending || !dirty}
                          onClick={() => saveField(f)} aria-label="Saqlash">
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                          onClick={() => removeField(f)} aria-label="O'chirish">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
