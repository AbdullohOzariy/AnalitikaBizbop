"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pill } from "@/components/common/page";
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, Tag, CalendarDays, Building2, Boxes } from "lucide-react";
import { formatDateUZ } from "@/lib/format";
import { isoDay } from "@/lib/date";
import { toast } from "sonner";
import { DOIMIY_PROMO_TYPES, PROMO_TYPE_META, type DoimiyPromoType } from "@/lib/promo";
import {
  listCampaignsAction, createCampaignAction, updateCampaignAction, deleteCampaignAction,
  type PromoCampaignRow,
} from "./actions";
import { CampaignItems } from "./campaign-items";
import { PromoExportButtons } from "../export-buttons";

type Branch = { id: number; name: string };
// Prisma client'ni (server-only) import qilmaymiz — string union yetarli
type PromoStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
const NO_BRANCH = "__all__";

const STATUS_META: Record<PromoStatus, { label: string; tone: "muted" | "green" | "blue" | "red" }> = {
  DRAFT: { label: "Qoralama", tone: "muted" },
  ACTIVE: { label: "Faol", tone: "green" },
  ENDED: { label: "Tugadi", tone: "blue" },
  CANCELLED: { label: "Bekor", tone: "red" },
};

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

export function DoimiyClient({ branches, canEdit }: { branches: Branch[]; canEdit: boolean }) {
  const [type, setType] = useState<DoimiyPromoType>(DOIMIY_PROMO_TYPES[0]);

  return (
    <Tabs value={type} onValueChange={(v) => setType(v as DoimiyPromoType)}>
      {/* Mobilda 4 tur sig'may qolsa gorizontal scroll bo'ladi (list o'zi w-fit, wrap qilinmaydi) */}
      <div className="overflow-x-auto">
        <TabsList>
          {DOIMIY_PROMO_TYPES.map((t) => (
            <TabsTrigger key={t} value={t} className="shrink-0">{PROMO_TYPE_META[t].label}</TabsTrigger>
          ))}
        </TabsList>
      </div>
      {DOIMIY_PROMO_TYPES.map((t) => (
        <TabsContent key={t} value={t} className="pt-4">
          <TypePanel type={t} branches={branches} canEdit={canEdit} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TypePanel({ type, branches, canEdit }: { type: DoimiyPromoType; branches: Branch[]; canEdit: boolean }) {
  const meta = PROMO_TYPE_META[type];
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
      const res = await listCampaignsAction({ type });
      if (my !== reqId.current) return;
      if (res.ok) setRows(res.rows);
      else toast.error(res.error);
    });
  }, [type, refreshKey]);

  const reload = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      {/* Tur haqida — signal, davomiylik, mas'ul */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-muted-foreground" />Signal: <Pill tone="amber">{meta.signal}</Pill></span>
        <span className="text-muted-foreground">Davomiyligi: <b className="text-foreground">{meta.durationDays != null ? `${meta.durationDays} kun` : "doimiy / oylik"}</b></span>
        {canEdit && (
          <Button size="sm" className="ml-auto h-9 gap-1.5 md:h-8" onClick={() => setForm({ mode: "create" })}>
            <Plus className="h-3.5 w-3.5" /> Yangi aksiya
          </Button>
        )}
      </div>

      {/* Aksiyalar ro'yxati */}
      {loading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Bu turda hali aksiya yo&apos;q.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const open = openId === c.id;
            const st = STATUS_META[c.status];
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
                  <button onClick={() => setOpenId(open ? null : c.id)}
                    className="flex min-w-0 basis-full items-center gap-2 text-left md:basis-auto md:flex-1" aria-expanded={open}>
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-semibold">{c.title}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </button>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    {formatDateUZ(c.startDate)}{c.endDate ? ` – ${formatDateUZ(c.endDate)}` : " – doimiy"}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" /><span className="max-w-[160px] truncate">{c.branchName ?? "Barcha filiallar"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Boxes className="h-3.5 w-3.5 shrink-0" />{c.itemsCount} SKU
                  </span>
                  <PromoExportButtons campaignId={c.id} itemsCount={c.itemsCount} showCatalog={type === "HAFTA_CHEGIRMA"} />
                  {canEdit && (
                    <span className="ml-auto flex items-center gap-0.5 md:ml-0">
                      <Button size="icon" variant="ghost" className="h-9 w-9 md:h-7 md:w-7" onClick={() => setForm({ mode: "edit", row: c })} aria-label="Tahrirlash">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive md:h-7 md:w-7" onClick={() => setDel(c)} aria-label="O'chirish">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                </div>
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
        <CampaignFormDialog
          type={type}
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

function CampaignFormDialog({
  type, branches, edit, onClose, onSaved,
}: {
  type: DoimiyPromoType;
  branches: Branch[];
  edit: PromoCampaignRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = PROMO_TYPE_META[type];
  const [title, setTitle] = useState(edit?.title ?? meta.label);
  const [startDate, setStartDate] = useState(edit?.startDate ?? "");
  const [endDate, setEndDate] = useState(edit?.endDate ?? "");
  const [branchId, setBranchId] = useState<string>(edit?.branchId != null ? String(edit.branchId) : NO_BRANCH);
  const [status, setStatus] = useState<PromoStatus>(edit?.status ?? "DRAFT");
  const [isPending, start] = useTransition();

  // startDate tanlanganda endDate avto (turning davomiyligiga ko'ra); foydalanuvchi keyin o'zgartira oladi
  const onStart = (v: string) => {
    setStartDate(v);
    if (v && meta.durationDays != null) setEndDate(addDays(v, meta.durationDays - 1));
  };

  const save = () => {
    const t = title.trim();
    if (!t) { toast.error("Nom kerak."); return; }
    if (!startDate) { toast.error("Boshlanish sanasi kerak."); return; }
    if (endDate && endDate < startDate) { toast.error("Tugash sanasi boshlanishidan oldin bo'lmasin."); return; }
    const bid = branchId === NO_BRANCH ? null : Number(branchId);
    start(async () => {
      const res = edit
        ? await updateCampaignAction({ id: edit.id, title: t, startDate, endDate: endDate || null, branchId: bid, status })
        : await createCampaignAction({ type, title: t, startDate, endDate: endDate || null, branchId: bid });
      if (res.ok) { toast.success(edit ? "Saqlandi." : "Aksiya yaratildi."); onSaved(); }
      else toast.error(res.error);
    });
  };

  const branchItems: Record<string, string> = { [NO_BRANCH]: "Barcha filiallar", ...Object.fromEntries(branches.map((b) => [String(b.id), b.name])) };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? "Aksiyani tahrirlash" : `Yangi aksiya — ${meta.label}`}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {meta.durationDays != null ? `Odatiy davomiyligi ${meta.durationDays} kun (o'zgartirsa bo'ladi).` : "Doimiy — tugash sanasi ixtiyoriy."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nom</Label>
            <Input value={title} disabled={isPending} className="h-10" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Boshlanishi</Label>
              <Input type="date" value={startDate} disabled={isPending} className="h-10" onChange={(e) => onStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tugashi{meta.durationDays == null && " (ixtiyoriy)"}</Label>
              <Input type="date" value={endDate} disabled={isPending} min={startDate || undefined} className="h-10" onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Filial</Label>
            <Select items={branchItems} value={branchId} onValueChange={(v) => setBranchId((v as string) ?? NO_BRANCH)} disabled={isPending}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRANCH}>Barcha filiallar</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
      const res = await deleteCampaignAction({ id: row.id });
      if (res.ok) { toast.success("Aksiya o'chirildi."); onDeleted(); }
      else toast.error(res.error);
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Aksiyani o&apos;chirish</DialogTitle>
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
