"use client";

import { Fragment as FragmentRows, useMemo, useRef, useState, useTransition } from "react";
import { isoDay } from "@/lib/date";
import { useRouter } from "next/navigation";
import {
  Star, Phone, User, Save, Loader2, Check, AlertCircle, Plus, Trash2, Pencil,
  ExternalLink, X, ChevronRight, ChevronLeft, Users, CalendarDays, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { skuRowBg, skuBadgeCls, skuBadgeLabel, skuBadgeTitle } from "@/lib/sku-rang";
import { weekdayOf, WEEKDAY_FULL, nextOrderDate } from "@/lib/order-days";
import {
  updateSupplierProfileAction,
  toggleOrderDateAction,
  toggleAgentOrderDateAction,
  toggleOrderWeekdayAction,
  toggleAgentOrderWeekdayAction,
  saveContractAction,
  deleteContractAction,
  updateSkuPurchaseAction,
  bulkLeadTimeAction,
  deleteSupplierAction,
  createAgentAction,
  updateAgentAction,
  deleteAgentAction,
  assignSkuAgentAction,
  bulkAssignSkuAgentAction,
  unassignedSkusAction,
  assignSkusToSupplierAction,
  type ContractRow,
  type AgentRow,
  type UnassignedSku,
} from "../actions";

// ─── Tiplar ───────────────────────────────────────────────────────────────────

export type ProfilSku = {
  id: number;
  code: number;
  name: string;
  sub: string | null;
  subId: number;
  abc: string | null;
  xyz: string | null;
  leadTimeDays: number | null;
  packSize: number | null; // pachkadagi dona
  purchasePrice: number | null; // kelishilgan dona narxi
  agentId: number | null; // biriktirilgan agent (brend)
  arxiv: boolean; // no-aktiv (arxivlangan)
};

const WD_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

// ─── Baho (yulduzlar) + kontakt ───────────────────────────────────────────────

export function ProfilHeader({
  supplierId, name, rating, ratingNote, phone, contactName, canEdit = true,
}: {
  supplierId: number; name: string; rating: number | null; ratingNote: string | null;
  phone: string | null; contactName: string | null; canEdit?: boolean;
}) {
  const [nom, setNom] = useState(name);
  const router = useRouter();
  const [stars, setStars] = useState(rating ?? 0);
  const [note, setNote] = useState(ratingNote ?? "");
  const [tel, setTel] = useState(phone ?? "");
  const [kontakt, setKontakt] = useState(contactName ?? "");
  const [isPending, start] = useTransition();
  const [dirty, setDirty] = useState(false);

  const setRating = (v: number) => {
    const next = v === stars ? 0 : v; // o'sha yulduz qayta bosilsa — bekor
    setStars(next);
    start(async () => {
      const res = await updateSupplierProfileAction({ supplierId, rating: next || null });
      if (res.ok) { toast.success(next ? `Baho: ${next} yulduz` : "Baho olib tashlandi"); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const saveInfo = () => {
    start(async () => {
      const res = await updateSupplierProfileAction({
        supplierId, name: nom.trim() || undefined, phone: tel, contactName: kontakt, ratingNote: note,
      });
      if (res.ok) { toast.success("Saqlandi."); setDirty(false); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end">
        {/* Baho */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Baho</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => canEdit && setRating(v)}
                disabled={isPending || !canEdit}
                aria-label={`${v} yulduz`}
                className="rounded p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    "h-6 w-6",
                    v <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                  )}
                />
              </button>
            ))}
            {stars > 0 && <span className="ml-1 text-sm font-semibold tabular-nums">{stars}/5</span>}
          </div>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nomi</Label>
            <Input value={nom} onChange={(e) => { setNom(e.target.value); setDirty(true); }} disabled={!canEdit} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> Mas&apos;ul shaxs</Label>
            <Input value={kontakt} onChange={(e) => { setKontakt(e.target.value); setDirty(true); }} placeholder="Ism" disabled={!canEdit} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> Telefon</Label>
            <Input value={tel} onChange={(e) => { setTel(e.target.value); setDirty(true); }} placeholder="+998 ..." disabled={!canEdit} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Baho izohi</Label>
            <Input value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} placeholder="Masalan: o'z vaqtida yetkazadi" disabled={!canEdit} className="h-9" />
          </div>
        </div>

        <span className="flex flex-col gap-1.5">
          <Button onClick={saveInfo} disabled={isPending || !dirty || !canEdit} className="h-9 gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Saqlash
          </Button>
          {canEdit && (
            <Button variant="outline" disabled={isPending}
              className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
              title="Zakaz tarixi bo'lsa bloklanadi; SKU'lar yo'qolmaydi"
              onClick={() => {
                if (!confirm(`"${nom || name}" o'chirilsinmi?\n\nSKU'lari yo'qolmaydi (yetkazib beruvchisiz qoladi), profil va shartnomalar o'chadi. Zakaz tarixi bo'lsa o'chirish bloklanadi.`)) return;
                start(async () => {
                  const res = await deleteSupplierAction(supplierId);
                  if (res.ok) { toast.success("O'chirildi."); router.push("/baza/taminotchilar"); router.refresh(); }
                  else toast.error(res.error);
                });
              }}>
              <Trash2 className="h-3.5 w-3.5" /> O'chirish
            </Button>
          )}
        </span>
      </CardContent>
    </Card>
  );
}

// ─── Zakaz kunlari kalendari ──────────────────────────────────────────────────
// Haftalik takrorlanuvchi naqsh: kalendarda istalgan kunni bossangiz — o'sha HAFTA
// KUNI butun oyda yonadi/o'chadi (yetkazib beruvchilar haftalik jadval bilan ishlaydi).

export function OrderDaysCalendar({
  supplierId, agentId, orderDates, orderWeekdays = [], canEdit = true, title = "Zakaz qabul kunlari", compact = false,
}: {
  // supplierId YOKI agentId beriladi — agentId bo'lsa agent kalendari (AgentOrderDay)
  supplierId?: number; agentId?: number; orderDates: string[]; orderWeekdays?: number[]; canEdit?: boolean; title?: string; compact?: boolean;
}) {
  const [dates, setDates] = useState<Set<string>>(new Set(orderDates));
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set(orderWeekdays));
  const [isPending, start] = useTransition();
  const toggleAction = (dstr: string) =>
    agentId != null
      ? toggleAgentOrderDateAction({ agentId, sana: dstr })
      : toggleOrderDateAction({ supplierId: supplierId!, sana: dstr });

  // Doimiy hafta kunini belgilash/bekor — optimistik
  const toggleWeekday = (wd: number) => {
    if (!canEdit) return;
    const next = new Set(weekdays);
    if (next.has(wd)) next.delete(wd); else next.add(wd);
    setWeekdays(next);
    start(async () => {
      const res = agentId != null
        ? await toggleAgentOrderWeekdayAction({ agentId, weekday: wd })
        : await toggleOrderWeekdayAction({ supplierId: supplierId!, weekday: wd });
      if (!res.ok) { toast.error(res.error); setWeekdays(new Set(weekdays)); }
    });
  };

  // Joriy vaqt faqat mount'da o'qiladi (render purity — React Compiler talabi)
  const [now] = useState(() => new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());

  // Ko'rinayotgan oy — navigatsiya bilan
  const [view, setView] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  // Dushanbadan boshlanadigan to'r: 0=Du ... 6=Ya
  const leadEmpty = (first.getDay() + 6) % 7;

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // Bitta SANANI belgilash/bekor qilish — optimistik
  const toggle = (dstr: string) => {
    if (!canEdit) return;
    const next = new Set(dates);
    if (next.has(dstr)) next.delete(dstr); else next.add(dstr);
    setDates(next);
    start(async () => {
      const res = await toggleAction(dstr);
      if (!res.ok) { toast.error(res.error); setDates(new Set(dates)); }
    });
  };

  const futureCount = [...dates].filter((d) => d >= todayStr).length;
  const nextDate = nextOrderDate(todayStr, [...dates], [...weekdays]);
  const fmtUz = (dstr: string) => {
    const [y, m, d] = dstr.split("-").map(Number);
    const OYLAR = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
    return `${d}-${OYLAR[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ""}`;
  };

  const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>{title}</span>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Hafta kuni tugmalari — <b>doimiy</b> qabul kunlari (har hafta takror, ko&apos;k).
            Kalendardan <b>qo&apos;shimcha aniq kun</b> ham belgilash mumkin (yashil).
            &quot;Bugun&quot;, buyurtma oynasi va Stockday hisoblarida ishlatiladi.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Doimiy hafta kunlari — bir marta bosing, har hafta shu kun qabul kuni bo'ladi */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">Doimiy hafta kunlari (har hafta takror):</p>
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
              const on = weekdays.has(wd);
              return (
                <button
                  key={wd}
                  onClick={() => toggleWeekday(wd)}
                  disabled={!canEdit || isPending}
                  title={`${WEEKDAY_FULL[wd]} — har hafta ${on ? "bekor qilish" : "belgilash"}`}
                  className={cn(
                    "h-8 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50",
                    on
                      ? "border-sky-500/60 bg-sky-500/20 text-sky-700 dark:text-sky-300"
                      : "border-border/50 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {WD_SHORT[wd]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Oy navigatsiyasi */}
        <div className="flex items-center justify-between">
          <button onClick={() => shiftMonth(-1)} aria-label="Oldingi oy"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">{MONTHS[view.m]} {view.y}</p>
          <button onClick={() => shiftMonth(1)} aria-label="Keyingi oy"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Oy kalendari — har kun alohida belgilanadi */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <div key={wd} className="py-1 text-[10px] font-semibold uppercase text-muted-foreground">{WD_SHORT[wd]}</div>
          ))}
          {Array.from({ length: leadEmpty }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dnum = i + 1;
            const dstr = ymd(view.y, view.m, dnum);
            const explicit = dates.has(dstr);
            const recurring = weekdays.has(weekdayOf(dstr));
            const active = explicit || recurring;
            const isToday = dstr === todayStr;
            const otgan = dstr < todayStr;
            return (
              <button
                key={dnum}
                onClick={() => toggle(dstr)}
                title={
                  recurring && !explicit
                    ? `Doimiy (${WEEKDAY_FULL[weekdayOf(dstr)]}) — hafta kuni tugmasidan boshqariladi`
                    : explicit
                    ? "Aniq kun — bekor qilish uchun bosing"
                    : "Qo'shimcha aniq kun belgilash uchun bosing"
                }
                className={cn(
                  "flex h-9 items-center justify-center rounded-lg border text-xs tabular-nums transition-colors",
                  explicit
                    ? "border-emerald-500/60 bg-emerald-500/20 font-bold text-emerald-800 dark:text-emerald-300"
                    : recurring
                    ? "border-sky-500/50 bg-sky-500/15 font-semibold text-sky-700 dark:text-sky-300"
                    : "border-border/50 text-muted-foreground hover:bg-muted/40",
                  otgan && !active && "opacity-40",
                  isToday && "ring-2 ring-primary/60"
                )}
              >
                {dnum}
              </button>
            );
          })}
        </div>

        {/* Holat: keyingi kun + tugayotgan kunlar ogohlantirishi */}
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          {!nextDate ? (
            <span className="text-muted-foreground">Zakaz kunlari belgilanmagan.</span>
          ) : (
            <>
              Keyingi zakaz kuni:{" "}
              <span className="font-semibold">
                {nextDate === todayStr ? "Bugun" : fmtUz(nextDate)}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {weekdays.size > 0 && `· ${weekdays.size} ta doimiy hafta kuni`}
                {futureCount > 0 && ` · ${futureCount} ta qo'shimcha aniq kun`}
              </span>
            </>
          )}
        </div>
        {weekdays.size === 0 && futureCount > 0 && futureCount < 3 && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠ Kelgusi aniq kunlar kam qoldi — doimiy hafta kunini belgilang (yuqorida) yoki kalendardan qo&apos;shing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Agentlar (brend) ─────────────────────────────────────────────────────────
// Yetkazib beruvchi ichidagi agentlar: qo'shish/tahrir/o'chirish + har agent uchun
// alohida zakaz kunlari. SKU'lar pastdagi jadvalda agentga biriktiriladi.

const emptyAgentForm = { name: "", contactName: "", phone: "" };

export function AgentsSection({ supplierId, agents, canEdit = true }: { supplierId: number; agents: AgentRow[]; canEdit?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<typeof emptyAgentForm & { id?: number }>(emptyAgentForm);
  const [showForm, setShowForm] = useState(false);
  const [openCal, setOpenCal] = useState<number | null>(null);
  const [isPending, start] = useTransition();

  const set = (k: keyof typeof emptyAgentForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) { toast.error("Agent nomini kiriting."); return; }
    start(async () => {
      const res = form.id
        ? await updateAgentAction({ agentId: form.id, name: form.name, contactName: form.contactName, phone: form.phone })
        : await createAgentAction({ supplierId, name: form.name, contactName: form.contactName, phone: form.phone });
      if (res.ok) {
        toast.success(form.id ? "Agent yangilandi." : "Agent qo'shildi.");
        setForm(emptyAgentForm); setShowForm(false); router.refresh();
      } else toast.error(res.error);
    });
  };

  const edit = (a: AgentRow) => {
    setForm({ id: a.id, name: a.name, contactName: a.contactName ?? "", phone: a.phone ?? "" });
    setShowForm(true);
  };

  const remove = (a: AgentRow) => {
    if (!confirm(`"${a.name}" agentini o'chirasizmi?\n\nSKU'lari yo'qolmaydi (agentsiz qoladi), zakaz kunlari o'chadi. Zakaz tarixi bo'lsa bloklanadi.`)) return;
    start(async () => {
      const res = await deleteAgentAction(a.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  // Keyingi zakaz kuni hint uchun. Joriy sana faqat mount'da (render purity).
  const [todayStr] = useState(() => {
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  });
  const nextDate = (a: AgentRow) => nextOrderDate(todayStr, a.orderDates, a.orderWeekdays);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" /> Agentlar (brend)
            <span className="text-xs font-normal text-muted-foreground">· {agents.length} ta</span>
          </span>
          {canEdit && (
            <Button size="sm" variant={showForm ? "outline" : "default"} className="h-8 gap-1 text-xs"
              onClick={() => { setShowForm((v) => !v); if (showForm) setForm(emptyAgentForm); }}>
              {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showForm ? "Bekor" : "Qo'shish"}
            </Button>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Agent — yetkazib beruvchi ichidagi brend. SKU'larni o'ngdagi jadvalda agentga biriktiring;
          zakaz har agentga ALOHIDA beriladi.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nomi (brend) *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Masalan: Coca-Cola" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mas&apos;ul shaxs</Label>
              <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Ism" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Telefon</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 ..." className="h-9" />
            </div>
            <div className="sm:col-span-3">
              <Button onClick={submit} disabled={isPending} className="h-9 gap-1.5">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {form.id ? "Yangilash" : "Saqlash"}
              </Button>
            </div>
          </div>
        )}

        {agents.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">
            Hozircha agent yo'q — SKU'lar to&apos;g&apos;ridan yetkazib beruvchiga tegishli.
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => {
              const nd = nextDate(a);
              return (
                <div key={a.id} className="rounded-xl border border-border">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {a.name}
                        <span className="text-xs font-normal text-muted-foreground">{a.skuCount} SKU</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[a.contactName, a.phone].filter(Boolean).join(" · ") || "kontakt yo'q"}
                        {nd && <> · keyingi zakaz: {nd === todayStr ? "bugun" : nd}</>}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                      onClick={() => setOpenCal((v) => (v === a.id ? null : a.id))}>
                      <CalendarDays className="h-3.5 w-3.5" /> Zakaz kunlari
                    </Button>
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => edit(a)} aria-label="Tahrirlash"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(a)} disabled={isPending} aria-label="O'chirish"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </>
                    )}
                  </div>
                  {openCal === a.id && (
                    <div className="border-t border-border/60 p-3">
                      <OrderDaysCalendar agentId={a.id} orderDates={a.orderDates} orderWeekdays={a.orderWeekdays} canEdit={canEdit} title={`Zakaz kunlari — ${a.name}`} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SKU sotib olish sozlamalari (lead · pachka · narx) — ketma-ket kiritish ──
// Enter → saqlanadi va fokus KEYINGI qatorning O'SHA ustuniga o'tadi. O'zgartirish
// 700ms dan keyin avtomatik saqlanadi. Subkat bo'yicha guruhlangan, ABC×XYZ ranglar.

type CellSt = "idle" | "saving" | "saved" | "error";
type SkuField = "lead" | "pack" | "price";

const FIELD_CFG: Record<SkuField, { label: string; max: number; int: boolean }> = {
  lead: { label: "Lead (kun)", max: 365, int: true },
  pack: { label: "Pachka", max: 100_000, int: false },
  price: { label: "Narx (dona)", max: 1_000_000_000_000, int: false },
};

const AGENT_NONE = "__none__"; // Radix Select bo'sh qiymatni qo'llamaydi — "agentsiz" sentineli

// ─── Ta'minotchisiz SKU biriktirish ───────────────────────────────────────────
export function AssignSkusSection({ supplierId, canEdit = true }: { supplierId: number; canEdit?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UnassignedSku[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef(0);

  const doLoad = (p: number, query: string) => {
    const myId = ++reqId.current;
    startLoad(async () => {
      const res = await unassignedSkusAction({ q: query || undefined, page: p });
      if (myId !== reqId.current) return;
      if (res.ok) { setRows(res.rows); setTotal(res.total); setPageSize(res.pageSize); setPage(res.page); }
      else { toast.error(res.error); setRows([]); setTotal(0); }
    });
  };

  const toggleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && rows.length === 0) doLoad(1, q);
  };

  const onSearch = (v: string) => {
    setQInput(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setQ(v.trim()); doLoad(1, v.trim()); }, 350);
  };

  const toggleSel = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPageSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAllPage = () => setSel((s) => {
    const n = new Set(s);
    if (allOnPageSelected) rows.forEach((r) => n.delete(r.id));
    else rows.forEach((r) => n.add(r.id));
    return n;
  });

  const assign = () => {
    if (sel.size === 0) { toast.error("Kamida bitta SKU tanlang."); return; }
    startSave(async () => {
      const res = await assignSkusToSupplierAction({ supplierId, productIds: [...sel] });
      if (res.ok) {
        toast.success(`${res.count.toLocaleString("uz-UZ")} ta SKU biriktirildi.`);
        setSel(new Set());
        doLoad(1, q);     // biriktirilganlar ro'yxatdan chiqadi
        router.refresh(); // pastdagi SKU jadvalida ko'rinadi
      } else toast.error(res.error);
    });
  };

  if (!canEdit) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Ta&apos;minotchisiz SKU biriktirish</CardTitle>
        <Button size="sm" variant={open ? "secondary" : "default"} className="h-8 gap-1.5" onClick={toggleOpen}>
          <Plus className="h-3.5 w-3.5" /> {open ? "Yopish" : "SKU qo'shish"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Hech qaysi yetkazib beruvchiga biriktirilmagan SKU&apos;lar. Tanlab, shu yetkazib beruvchiga qo&apos;shing.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={qInput} onChange={(e) => onSearch(e.target.value)} placeholder="Qidirish — SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
            {qInput && <button onClick={() => { setQInput(""); setQ(""); doLoad(1, ""); }} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="text-xs text-muted-foreground">
                    <th className="w-[40px] px-2 py-2">
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Sahifani tanlash" className="h-4 w-4 rounded border-border accent-primary" />
                    </th>
                    <th className="w-[80px] px-2 py-2 text-left font-semibold">Kod</th>
                    <th className="px-2 py-2 text-left font-semibold">Nom (SKU)</th>
                    <th className="w-[150px] px-2 py-2 text-left font-semibold">Subkategoriya</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Yuklanmoqda…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">{q ? "Topilmadi." : "Ta'minotchisiz SKU yo'q."}</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.id} className={cn("cursor-pointer border-t border-border/40 hover:bg-muted/20", sel.has(r.id) && "bg-emerald-500/10")} onClick={() => toggleSel(r.id)}>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-border accent-primary" /></td>
                      <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{r.code}</td>
                      <td className="max-w-[280px] truncate px-2 py-1.5" title={r.name}>{r.name}</td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.sub ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
              <span className="text-xs tabular-nums text-muted-foreground">{total.toLocaleString("uz-UZ")} ta · sahifa {page}/{totalPages}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={loading || page <= 1} onClick={() => doLoad(page - 1, q)} aria-label="Oldingi"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={loading || page >= totalPages} onClick={() => doLoad(page + 1, q)} aria-label="Keyingi"><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm"><span className="text-muted-foreground">Tanlandi:</span> <span className="font-semibold text-emerald-700 dark:text-emerald-400">{sel.size}</span></span>
            <Button className="gap-1.5" disabled={saving || sel.size === 0} onClick={assign}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Qo&apos;shish{sel.size > 0 ? ` (${sel.size})` : ""}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function LeadTimeEditor({ supplierId, skus, agents, canEdit = true }: { supplierId: number; skus: ProfilSku[]; agents: { id: number; name: string }[]; canEdit?: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<number, Record<SkuField, string>>>(() => {
    const o: Record<number, Record<SkuField, string>> = {};
    for (const s of skus) {
      o[s.id] = {
        lead: s.leadTimeDays != null ? String(s.leadTimeDays) : "",
        pack: s.packSize != null ? String(s.packSize) : "",
        price: s.purchasePrice != null ? String(s.purchasePrice) : "",
      };
    }
    return o;
  });
  const [st, setSt] = useState<Record<string, CellSt>>({}); // `${pid}:${field}`
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [, startT] = useTransition();

  // Agent biriktirish (har SKU + subkat bulk)
  const hasAgents = agents.length > 0;
  // base-ui Select: trigger'da id emas, NOM ko'rinishi uchun items (qiymat→label) kerak
  const agentLabels = useMemo(() => {
    const o: Record<string, React.ReactNode> = { [AGENT_NONE]: "— agentsiz" };
    for (const a of agents) o[String(a.id)] = a.name;
    return o;
  }, [agents]);
  const [agentVals, setAgentVals] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {};
    for (const s of skus) o[s.id] = s.agentId != null ? String(s.agentId) : "";
    return o;
  });
  const setAgent = (pid: number, val: string) => {
    const agentId = val === AGENT_NONE ? null : Number(val);
    setAgentVals((p) => ({ ...p, [pid]: agentId == null ? "" : String(agentId) }));
    startT(async () => {
      const res = await assignSkuAgentAction({ productId: pid, agentId });
      if (!res.ok) toast.error(res.error);
    });
  };
  const bulkAssignSub = (subId: number, val: string) => {
    const agentId = val === AGENT_NONE ? null : Number(val);
    startT(async () => {
      const res = await bulkAssignSkuAgentAction({ supplierId, agentId, subId });
      if (res.ok) {
        toast.success(`${res.count} ta SKU ${agentId == null ? "agentsiz qilindi" : "biriktirildi"}.`);
        setAgentVals((prev) => {
          const next = { ...prev };
          for (const s of skus) if (s.subId === subId) next[s.id] = agentId == null ? "" : String(agentId);
          return next;
        });
      } else toast.error(res.error);
    });
  };

  // Bulk (faqat lead uchun)
  const [bulkDays, setBulkDays] = useState("");
  const [bulkPending, startBulk] = useTransition();

  const groups = useMemo(() => {
    const m = new Map<number, { name: string; items: ProfilSku[] }>();
    for (const s of skus) {
      if (!m.has(s.subId)) m.set(s.subId, { name: s.sub ?? "Moslanmagan", items: [] });
      m.get(s.subId)!.items.push(s);
    }
    return [...m.entries()];
  }, [skus]);
  const flatOrder = useMemo(() => skus.map((s) => s.id), [skus]);
  const [openSubs, setOpenSubs] = useState<Set<number>>(() => new Set(groups.map(([id]) => id)));

  const save = (pid: number, field: SkuField, raw: string) => {
    const key = `${pid}:${field}`;
    clearTimeout(timers.current[key]);
    const cfg = FIELD_CFG[field];
    const num = raw.trim() === "" ? null : Number(raw);
    const bad =
      num !== null &&
      (!isFinite(num) || num < 0 || num > cfg.max || (cfg.int && !Number.isInteger(num)) || (field === "pack" && num === 0));
    if (bad) { setSt((p) => ({ ...p, [key]: "error" })); return; }
    setSt((p) => ({ ...p, [key]: "saving" }));
    startT(async () => {
      const res = await updateSkuPurchaseAction({
        productId: pid,
        ...(field === "lead" ? { leadTimeDays: num } : {}),
        ...(field === "pack" ? { packSize: num } : {}),
        ...(field === "price" ? { purchasePrice: num } : {}),
      });
      setSt((p) => ({ ...p, [key]: res.ok ? "saved" : "error" }));
      if (!res.ok) toast.error(res.error);
    });
  };

  const onChange = (pid: number, field: SkuField, v: string) => {
    setVals((p) => ({ ...p, [pid]: { ...p[pid], [field]: v } }));
    const key = `${pid}:${field}`;
    setSt((p) => ({ ...p, [key]: "idle" }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => save(pid, field, v), 700);
  };

  // Enter — saqla va o'sha USTUN bo'ylab keyingi qatorga o't
  const onKeyDown = (pid: number, field: SkuField, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    save(pid, field, vals[pid]?.[field] ?? "");
    const idx = flatOrder.indexOf(pid);
    for (let j = idx + 1; j < flatOrder.length; j++) {
      const el = inputs.current.get(`${flatOrder[j]}:${field}`);
      if (el) { el.focus(); el.select(); break; }
    }
  };

  const runBulk = (onlyEmpty: boolean) => {
    const d = parseInt(bulkDays, 10);
    if (!Number.isInteger(d) || d < 0 || d > 365) { toast.error("0–365 oralig'ida kun kiriting."); return; }
    startBulk(async () => {
      const res = await bulkLeadTimeAction({ supplierId, days: d, onlyEmpty });
      if (res.ok) {
        toast.success(`${res.count} ta SKU yangilandi.`);
        setVals((prev) => {
          const next = { ...prev };
          for (const s of skus) {
            if (!onlyEmpty || (prev[s.id]?.lead ?? "") === "") next[s.id] = { ...next[s.id], lead: String(d) };
          }
          return next;
        });
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const StatusIcon = ({ s }: { s: CellSt | undefined }) => {
    if (s === "saving") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" />;
    if (s === "saved") return <Check className="h-3 w-3 text-emerald-500" />;
    if (s === "error") return <AlertCircle className="h-3 w-3 text-destructive" />;
    return <span className="inline-block h-3 w-3" />;
  };

  const rowSt = (pid: number): CellSt | undefined => {
    const states = (["lead", "pack", "price"] as SkuField[]).map((f) => st[`${pid}:${f}`]);
    if (states.includes("error")) return "error";
    if (states.includes("saving")) return "saving";
    if (states.includes("saved")) return "saved";
    return undefined;
  };

  const filledLead = skus.filter((s) => (vals[s.id]?.lead ?? "") !== "").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>SKU sozlamalari — lead time · pachka · narx</span>
          <span className="text-xs font-normal text-muted-foreground">
            lead kiritilgan: {filledLead.toLocaleString("uz-UZ")}/{skus.length.toLocaleString("uz-UZ")}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Enter — saqlaydi va o'sha ustun bo'ylab keyingi qatorga o'tadi. Pachka va narx zakaz
          oynasida avtomatik to'lib turadi (zakazdan ham eslab qolinadi).
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {/* Bulk — lead uchun */}
        <div className="flex flex-wrap items-end gap-2 border-b border-border/60 px-4 pb-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Barchasiga lead (kun)</Label>
            <Input type="number" min={0} max={365} value={bulkDays} onChange={(e) => setBulkDays(e.target.value)}
              placeholder="masalan 3" className="h-8 w-28 text-xs" />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bulkPending || !canEdit} onClick={() => runBulk(true)}>
            {bulkPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Bo'shlarga qo'llash
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bulkPending || !canEdit} onClick={() => runBulk(false)}>
            Hammasiga qo'llash
          </Button>
        </div>

        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 font-semibold">SKU</th>
                {hasAgents && <th className="w-[150px] px-1 py-2 font-semibold">Agent (brend)</th>}
                <th className="w-[90px] px-1 py-2 text-right font-semibold">Lead (kun)</th>
                <th className="w-[95px] px-1 py-2 text-right font-semibold" title="Blok/yashikdagi dona soni">Pachka</th>
                <th className="w-[120px] px-1 py-2 text-right font-semibold" title="Kelishilgan dona narxi">Narx</th>
                <th className="w-[36px]" />
              </tr>
            </thead>
            <tbody>
              {groups.map(([subId, g]) => {
                const open = openSubs.has(subId);
                return (
                  <FragmentRows key={subId}>
                    <tr
                      className="cursor-pointer border-b border-border bg-muted/40 text-xs font-semibold hover:bg-muted/60"
                      onClick={() => setOpenSubs((p) => { const n = new Set(p); if (n.has(subId)) n.delete(subId); else n.add(subId); return n; })}
                      tabIndex={0} role="button" aria-expanded={open}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenSubs((p) => { const n = new Set(p); if (n.has(subId)) n.delete(subId); else n.add(subId); return n; }); } }}
                    >
                      <td className="px-4 py-2" colSpan={hasAgents ? 6 : 5}>
                        <span className="flex items-center gap-1.5">
                          <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", open && "rotate-90")} />
                          {g.name}
                          <span className="font-normal text-muted-foreground">· {g.items.length} SKU</span>
                          {hasAgents && canEdit && (
                            <span className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] font-normal text-muted-foreground">→ agentga:</span>
                              <Select onValueChange={(v) => { if (typeof v === "string") bulkAssignSub(subId, v); }} items={agentLabels}>
                                <SelectTrigger className="h-6 w-[140px] text-[11px]"><SelectValue placeholder="biriktirish…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={AGENT_NONE}>— agentsiz</SelectItem>
                                  {agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                    {open && g.items.map((s) => (
                      <tr key={s.id} className={cn("border-b border-border/30 text-xs", skuRowBg(s.abc, s.xyz))}>
                        <td className="px-4 py-1.5">
                          <span className="flex items-baseline gap-2">
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.code}</span>
                            <span
                              title={skuBadgeTitle(s.abc, s.xyz)}
                              className={cn("shrink-0 rounded border px-1 py-px text-[9px] font-bold leading-none", skuBadgeCls(s.abc, s.xyz))}
                            >
                              {skuBadgeLabel(s.abc, s.xyz)}
                            </span>
                            <span className="line-clamp-1">{s.name}</span>
                            {s.arxiv && (
                              <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-px text-[9px] font-semibold uppercase text-muted-foreground"
                                title="Arxivlangan (no-aktiv) — yana sotila boshlasa avtomatik aktivga qaytadi">
                                no aktiv
                              </span>
                            )}
                          </span>
                        </td>
                        {hasAgents && (
                          <td className="px-1 py-1">
                            <Select value={agentVals[s.id] === "" ? AGENT_NONE : agentVals[s.id]}
                              onValueChange={(v) => setAgent(s.id, typeof v === "string" ? v : AGENT_NONE)} disabled={!canEdit} items={agentLabels}>
                              <SelectTrigger className="h-7 w-full text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={AGENT_NONE}>— agentsiz</SelectItem>
                                {agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                        )}
                        {(["lead", "pack", "price"] as SkuField[]).map((field) => (
                          <td key={field} className="px-1 py-1">
                            <Input
                              ref={(el) => { const k = `${s.id}:${field}`; if (el) inputs.current.set(k, el); else inputs.current.delete(k); }}
                              type="number" min={0} inputMode={FIELD_CFG[field].int ? "numeric" : "decimal"}
                              value={vals[s.id]?.[field] ?? ""}
                              onChange={(e) => onChange(s.id, field, e.target.value)}
                              onKeyDown={(e) => onKeyDown(s.id, field, e)}
                              onBlur={(e) => { if (st[`${s.id}:${field}`] !== "saved") save(s.id, field, e.target.value); }}
                              disabled={!canEdit}
                              placeholder="—"
                              className="h-7 w-full text-right text-xs tabular-nums"
                            />
                          </td>
                        ))}
                        <td className="pr-3 text-center"><StatusIcon s={rowSt(s.id)} /></td>
                      </tr>
                    ))}
                  </FragmentRows>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shartnomalar ─────────────────────────────────────────────────────────────

const emptyForm = { title: "", number: "", signedAt: "", endDate: "", amount: "", url: "", note: "" };

export function ContractsSection({ supplierId, contracts, canEdit = true }: { supplierId: number; contracts: ContractRow[]; canEdit?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<typeof emptyForm & { id?: number }>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [isPending, start] = useTransition();

  const set = (k: keyof typeof emptyForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) { toast.error("Shartnoma nomini kiriting."); return; }
    start(async () => {
      const res = await saveContractAction({
        id: form.id,
        supplierId,
        title: form.title,
        number: form.number || undefined,
        signedAt: form.signedAt || "",
        endDate: form.endDate || "",
        amount: form.amount === "" ? null : Number(form.amount),
        url: form.url || "",
        note: form.note || undefined,
      });
      if (res.ok) {
        toast.success(form.id ? "Shartnoma yangilandi." : "Shartnoma qo'shildi.");
        setForm(emptyForm); setShowForm(false); router.refresh();
      } else toast.error(res.error);
    });
  };

  const remove = (id: number) => {
    if (!confirm("Bu shartnomani o'chirasizmi?")) return;
    start(async () => {
      const res = await deleteContractAction(id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const edit = (c: ContractRow) => {
    setForm({
      id: c.id, title: c.title, number: c.number ?? "", signedAt: c.signedAt ?? "",
      endDate: c.endDate ?? "", amount: c.amount != null ? String(c.amount) : "", url: c.url ?? "", note: c.note ?? "",
    });
    setShowForm(true);
  };

  // Sana chegaralari faqat mount'da hisoblanadi (render purity)
  const [dateRef] = useState(() => {
    const t = Date.now();
    return {
      today: isoDay(new Date(t)),
      soon: isoDay(new Date(t + 30 * 86400000)),
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Shartnomalar <span className="text-xs font-normal text-muted-foreground">· {contracts.length} ta</span></span>
          {canEdit && <Button size="sm" variant={showForm ? "outline" : "default"} className="h-8 gap-1 text-xs"
            onClick={() => { setShowForm((v) => !v); if (showForm) setForm(emptyForm); }}>
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? "Bekor" : "Qo'shish"}
          </Button>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs text-muted-foreground">Nomi *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Yetkazib berish shartnomasi 2026" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Raqami</Label>
              <Input value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="№ 123" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Imzolangan sana</Label>
              <Input type="date" value={form.signedAt} onChange={(e) => set("signedAt", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amal qilish muddati</Label>
              <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Summa (so&apos;m)</Label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" className="h-9 text-right tabular-nums" />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs text-muted-foreground">Hujjat havolasi (Drive va h.k.)</Label>
              <Input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Izoh</Label>
              <Input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="..." className="h-9" />
            </div>
            <div className="flex items-end lg:col-span-3">
              <Button onClick={submit} disabled={isPending} className="h-9 gap-1.5">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {form.id ? "Yangilash" : "Saqlash"}
              </Button>
            </div>
          </div>
        )}

        {contracts.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">Hozircha shartnoma kiritilmagan.</p>
        ) : (
          <div className="space-y-2">
            {contracts.map((c) => {
              const expired = c.endDate != null && c.endDate < dateRef.today;
              const soon = !expired && c.endDate != null && c.endDate <= dateRef.soon;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {c.title}
                      {c.number && <span className="text-xs font-normal text-muted-foreground">{c.number}</span>}
                      {expired && <Pill tone="red" className="px-1.5 py-0 text-[10px]">muddati tugagan</Pill>}
                      {soon && <Pill tone="amber" className="px-1.5 py-0 text-[10px]">tez orada tugaydi</Pill>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.signedAt && <>imzolangan: {c.signedAt}</>}
                      {c.endDate && <> · muddati: {c.endDate}</>}
                      {c.amount != null && <> · {Number(c.amount).toLocaleString("uz-UZ")} so&apos;m</>}
                      {c.note && <> · {c.note}</>}
                    </p>
                  </div>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" /> Hujjat
                    </a>
                  )}
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => edit(c)} aria-label="Tahrirlash">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(c.id)} disabled={isPending} aria-label="O'chirish">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
