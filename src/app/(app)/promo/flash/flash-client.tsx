"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, CalendarDays, Building2, Boxes, Zap } from "lucide-react";
import { formatDateUZ } from "@/lib/format";
import { toast } from "sonner";
import type { PromoCampaignRow } from "../doimiy/actions";
import { CampaignItems } from "../doimiy/campaign-items";
import { PromoExportButtons } from "../export-buttons";
import { listFlashAction, createFlashAction, updateFlashAction, deleteFlashAction } from "./actions";

type Branch = { id: number; name: string };
type PromoStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
const NO_BRANCH = "__all__";

const STATUS_META: Record<PromoStatus, { label: string; tone: "muted" | "green" | "blue" | "red" }> = {
  DRAFT: { label: "Qoralama", tone: "muted" },
  ACTIVE: { label: "Faol", tone: "green" },
  ENDED: { label: "Tugadi", tone: "blue" },
  CANCELLED: { label: "Bekor", tone: "red" },
};

export function FlashClient({ branches, canEdit }: { branches: Branch[]; canEdit: boolean }) {
  const [rows, setRows] = useState<PromoCampaignRow[]>([]);
  const [loading, startLoad] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "edit"; row: PromoCampaignRow }>(null);
  const [del, setDel] = useState<PromoCampaignRow | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const my = ++reqId.current;
    startLoad(async () => {
      const res = await listFlashAction();
      if (my !== reqId.current) return;
      if (res.ok) setRows(res.rows);
      else toast.error(res.error);
    });
  }, [refreshKey]);

  const reload = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Bayram yoki maxsus hodisalarga atalgan vaqtinchalik aksiyalar.
        </p>
        {canEdit && (
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setForm({ mode: "create" })}>
            <Plus className="h-4 w-4" /> Yangi flash aksiya
          </Button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Zap} title="Hali flash aksiya yo'q"
          description="Bayram yoki maxsus tadbirga atab vaqtinchalik aksiya yarating." />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const open = openId === c.id;
            const st = STATUS_META[c.status];
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <button onClick={() => setOpenId(open ? null : c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-semibold">{c.title}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </button>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateUZ(c.startDate)}{c.endDate ? ` – ${formatDateUZ(c.endDate)}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />{c.branchName ?? "Barcha filiallar"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Boxes className="h-3.5 w-3.5" />{c.itemsCount} SKU
                  </span>
                  <PromoExportButtons campaignId={c.id} itemsCount={c.itemsCount} />
                  {canEdit && (
                    <span className="flex items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm({ mode: "edit", row: c })} aria-label="Tahrirlash">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDel(c)} aria-label="O'chirish">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                </div>
                {c.note && <div className="px-4 pb-2 -mt-1 text-xs text-muted-foreground">{c.note}</div>}
                {open && (
                  <div className="border-t border-border/60 bg-muted/10 p-4">
                    <CampaignItems campaignId={c.id} canEdit={canEdit} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <FlashFormDialog
          branches={branches}
          edit={form.mode === "edit" ? form.row : null}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
      {del && (
        <DeleteDialog row={del} onClose={() => setDel(null)} onDeleted={() => { setDel(null); if (openId === del.id) setOpenId(null); reload(); }} />
      )}
    </div>
  );
}

function FlashFormDialog({
  branches, edit, onClose, onSaved,
}: {
  branches: Branch[];
  edit: PromoCampaignRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(edit?.title ?? "");
  const [startDate, setStartDate] = useState(edit?.startDate ?? "");
  const [endDate, setEndDate] = useState(edit?.endDate ?? "");
  const [note, setNote] = useState(edit?.note ?? "");
  const [branchId, setBranchId] = useState<string>(edit?.branchId != null ? String(edit.branchId) : NO_BRANCH);
  const [status, setStatus] = useState<PromoStatus>(edit?.status ?? "DRAFT");
  const [isPending, start] = useTransition();

  const save = () => {
    const t = title.trim();
    if (!t) { toast.error("Nom kerak."); return; }
    if (!startDate) { toast.error("Boshlanish sanasi kerak."); return; }
    if (endDate && endDate < startDate) { toast.error("Tugash sanasi boshlanishidan oldin bo'lmasin."); return; }
    const bid = branchId === NO_BRANCH ? null : Number(branchId);
    const nt = note.trim() || null;
    start(async () => {
      const res = edit
        ? await updateFlashAction({ id: edit.id, title: t, startDate, endDate: endDate || null, note: nt, branchId: bid, status })
        : await createFlashAction({ title: t, startDate, endDate: endDate || null, note: nt, branchId: bid });
      if (res.ok) { toast.success(edit ? "Saqlandi." : "Flash aksiya yaratildi."); onSaved(); }
      else toast.error(res.error);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? "Flash aksiyani tahrirlash" : "Yangi flash aksiya"}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Bayram yoki maxsus tadbir uchun vaqtinchalik aksiya.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nom</Label>
            <Input value={title} disabled={isPending} className="h-10" placeholder="Masalan: Navro'z chegirmalari"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Boshlanishi</Label>
              <Input type="date" value={startDate} disabled={isPending} className="h-10" onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tugashi (ixtiyoriy)</Label>
              <Input type="date" value={endDate} disabled={isPending} min={startDate || undefined} className="h-10" onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Filial</Label>
            <Select items={{ [NO_BRANCH]: "Barcha filiallar", ...Object.fromEntries(branches.map((b) => [String(b.id), b.name])) }}
              value={branchId} onValueChange={(v) => setBranchId((v as string) ?? NO_BRANCH)} disabled={isPending}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRANCH}>Barcha filiallar</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Izoh (ixtiyoriy)</Label>
            <textarea value={note} disabled={isPending} rows={2}
              className="w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              placeholder="Aksiya sababi / tafsilotlari" onChange={(e) => setNote(e.target.value)} />
          </div>
          {edit && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Holat</Label>
              <Select items={{ DRAFT: "Qoralama", ACTIVE: "Faol", ENDED: "Tugadi", CANCELLED: "Bekor" }}
                value={status} onValueChange={(v) => setStatus((v as PromoStatus) ?? "DRAFT")} disabled={isPending}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Qoralama</SelectItem>
                  <SelectItem value="ACTIVE">Faol</SelectItem>
                  <SelectItem value="ENDED">Tugadi</SelectItem>
                  <SelectItem value="CANCELLED">Bekor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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

function DeleteDialog({ row, onClose, onDeleted }: { row: PromoCampaignRow; onClose: () => void; onDeleted: () => void }) {
  const [isPending, start] = useTransition();
  const del = () => {
    start(async () => {
      const res = await deleteFlashAction({ id: row.id });
      if (res.ok) { toast.success("Flash aksiya o'chirildi."); onDeleted(); }
      else toast.error(res.error);
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Flash aksiyani o&apos;chirish</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <strong>{row.title}</strong> va undagi {row.itemsCount} ta SKU o&apos;chiriladi. Bu amalni qaytarib bo&apos;lmaydi.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
          <Button variant="destructive" className="rounded-xl" disabled={isPending} onClick={del}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
