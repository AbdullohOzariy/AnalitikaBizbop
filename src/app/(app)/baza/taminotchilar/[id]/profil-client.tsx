"use client";

import { Fragment as FragmentRows, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Star, Phone, User, Save, Loader2, Check, AlertCircle, Plus, Trash2, Pencil,
  ExternalLink, X, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { skuRowBg, skuBadgeCls, skuBadgeLabel, skuBadgeTitle } from "@/lib/sku-rang";
import {
  updateSupplierProfileAction,
  setOrderWeekdaysAction,
  saveContractAction,
  deleteContractAction,
  setLeadTimeAction,
  bulkLeadTimeAction,
  type ContractRow,
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
};

const WD_UZ = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const WD_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

// ─── Baho (yulduzlar) + kontakt ───────────────────────────────────────────────

export function ProfilHeader({
  supplierId, rating, ratingNote, phone, contactName,
}: {
  supplierId: number; rating: number | null; ratingNote: string | null;
  phone: string | null; contactName: string | null;
}) {
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
        supplierId, phone: tel, contactName: kontakt, ratingNote: note,
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
                onClick={() => setRating(v)}
                disabled={isPending}
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

        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> Mas&apos;ul shaxs</Label>
            <Input value={kontakt} onChange={(e) => { setKontakt(e.target.value); setDirty(true); }} placeholder="Ism" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> Telefon</Label>
            <Input value={tel} onChange={(e) => { setTel(e.target.value); setDirty(true); }} placeholder="+998 ..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Baho izohi</Label>
            <Input value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} placeholder="Masalan: o'z vaqtida yetkazadi" className="h-9" />
          </div>
        </div>

        <Button onClick={saveInfo} disabled={isPending || !dirty} className="h-9 gap-1.5">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Saqlash
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Zakaz kunlari kalendari ──────────────────────────────────────────────────
// Haftalik takrorlanuvchi naqsh: kalendarda istalgan kunni bossangiz — o'sha HAFTA
// KUNI butun oyda yonadi/o'chadi (ta'minotchilar haftalik jadval bilan ishlaydi).

export function OrderDaysCalendar({
  supplierId, weekdays,
}: {
  supplierId: number; weekdays: number[];
}) {
  const [days, setDays] = useState<Set<number>>(new Set(weekdays));
  const [isPending, start] = useTransition();

  // Joriy vaqt faqat mount'da o'qiladi (render purity — React Compiler talabi)
  const [now] = useState(() => new Date());
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-asosli, lokal — kalendar shunchaki vizual
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  // Dushanbadan boshlanadigan to'r: 0=Du ... 6=Ya
  const leadEmpty = (first.getDay() + 6) % 7;

  const toggle = (wd: number) => {
    const next = new Set(days);
    if (next.has(wd)) next.delete(wd); else next.add(wd);
    setDays(next);
    start(async () => {
      const res = await setOrderWeekdaysAction({ supplierId, weekdays: [...next] });
      if (!res.ok) { toast.error(res.error); setDays(new Set(days)); }
    });
  };

  // Keyingi zakaz kuni (bugundan boshlab) — arzon hisob, memo shart emas
  const nextOrderDay = (() => {
    if (days.size === 0) return null;
    for (let off = 0; off < 7; off++) {
      const d = new Date(year, month, today + off);
      if (days.has(d.getDay())) return { date: d, off };
    }
    return null;
  })();

  const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Zakaz qabul kunlari</span>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Kunni bosing — o&apos;sha hafta kuni har hafta zakaz kuni sifatida belgilanadi (qayta bossangiz — bekor).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hafta kuni tugmalari */}
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <button
              key={wd}
              onClick={() => toggle(wd)}
              className={cn(
                "h-8 rounded-lg border px-3 text-xs font-semibold transition-colors",
                days.has(wd)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              )}
            >
              {WD_SHORT[wd]}
            </button>
          ))}
        </div>

        {/* Joriy oy kalendari (vizual) */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{MONTHS[month]} {year}</p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <div key={wd} className="py-1 text-[10px] font-semibold uppercase text-muted-foreground">{WD_SHORT[wd]}</div>
            ))}
            {Array.from({ length: leadEmpty }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dnum = i + 1;
              const wd = new Date(year, month, dnum).getDay();
              const active = days.has(wd);
              const isToday = dnum === today;
              return (
                <button
                  key={dnum}
                  onClick={() => toggle(wd)}
                  title={`${WD_UZ[wd]} — ${active ? "zakaz kuni (bekor qilish uchun bosing)" : "belgilash uchun bosing"}`}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-lg border text-xs tabular-nums transition-colors",
                    active
                      ? "border-emerald-500/60 bg-emerald-500/20 font-bold text-emerald-800 dark:text-emerald-300"
                      : "border-border/50 text-muted-foreground hover:bg-muted/40",
                    isToday && "ring-2 ring-primary/60"
                  )}
                >
                  {dnum}
                </button>
              );
            })}
          </div>
        </div>

        {/* Keyingi zakaz kuni */}
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          {days.size === 0 ? (
            <span className="text-muted-foreground">Zakaz kunlari belgilanmagan.</span>
          ) : nextOrderDay ? (
            <>
              Keyingi zakaz kuni:{" "}
              <span className="font-semibold">
                {nextOrderDay.off === 0 ? "Bugun" : nextOrderDay.off === 1 ? "Ertaga" : WD_UZ[nextOrderDay.date.getDay()]}
                {" "}({nextOrderDay.date.getDate()}-{["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"][nextOrderDay.date.getMonth()]})
              </span>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lead time editor (ketma-ket kiritish) ────────────────────────────────────
// Enter → saqlanadi va fokus KEYINGI qatorga o'tadi. O'zgartirish 700ms dan keyin
// avtomatik saqlanadi. Subkat bo'yicha guruhlangan, ABC×XYZ rang fonlari bilan.

type CellSt = "idle" | "saving" | "saved" | "error";

export function LeadTimeEditor({ supplierId, skus }: { supplierId: number; skus: ProfilSku[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {};
    for (const s of skus) o[s.id] = s.leadTimeDays != null ? String(s.leadTimeDays) : "";
    return o;
  });
  const [st, setSt] = useState<Record<number, CellSt>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const inputs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [, startT] = useTransition();

  // Bulk
  const [bulkDays, setBulkDays] = useState("");
  const [bulkPending, startBulk] = useTransition();

  // Subkat bo'yicha guruhlash (savdo tartibini saqlab — skus allaqachon tartiblangan)
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

  const save = (pid: number, raw: string) => {
    clearTimeout(timers.current[pid]);
    const days = raw.trim() === "" ? null : parseInt(raw, 10);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) {
      setSt((p) => ({ ...p, [pid]: "error" }));
      return;
    }
    setSt((p) => ({ ...p, [pid]: "saving" }));
    startT(async () => {
      const res = await setLeadTimeAction({ productId: pid, days });
      setSt((p) => ({ ...p, [pid]: res.ok ? "saved" : "error" }));
      if (!res.ok) toast.error(res.error);
    });
  };

  const onChange = (pid: number, v: string) => {
    setVals((p) => ({ ...p, [pid]: v }));
    setSt((p) => ({ ...p, [pid]: "idle" }));
    clearTimeout(timers.current[pid]);
    timers.current[pid] = setTimeout(() => save(pid, v), 700);
  };

  // Enter — saqla va keyingi inputga o't (ketma-ket tez kiritish)
  const onKeyDown = (pid: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    save(pid, vals[pid] ?? "");
    const idx = flatOrder.indexOf(pid);
    for (let j = idx + 1; j < flatOrder.length; j++) {
      const el = inputs.current.get(flatOrder[j]);
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
          for (const s of skus) if (!onlyEmpty || prev[s.id] === "") next[s.id] = String(d);
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

  const filled = skus.filter((s) => (vals[s.id] ?? "") !== "").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>SKU lead time (zakazdan kelguncha, kun)</span>
          <span className="text-xs font-normal text-muted-foreground">
            kiritilgan: {filled.toLocaleString("uz-UZ")}/{skus.length.toLocaleString("uz-UZ")}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Enter — saqlaydi va keyingi qatorga o&apos;tadi. Fon rangi — SKU&apos;ning ABC×XYZ holati.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {/* Bulk */}
        <div className="flex flex-wrap items-end gap-2 border-b border-border/60 px-4 pb-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Barchasiga kun</Label>
            <Input type="number" min={0} max={365} value={bulkDays} onChange={(e) => setBulkDays(e.target.value)}
              placeholder="masalan 3" className="h-8 w-28 text-xs" />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bulkPending} onClick={() => runBulk(true)}>
            {bulkPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Bo&apos;shlarga qo&apos;llash
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bulkPending} onClick={() => runBulk(false)}>
            Hammasiga qo&apos;llash
          </Button>
        </div>

        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 font-semibold">SKU</th>
                <th className="w-[130px] px-2 py-2 text-right font-semibold">Lead time (kun)</th>
                <th className="w-[40px]" />
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
                      <td className="px-4 py-2" colSpan={3}>
                        <span className="flex items-center gap-1.5">
                          <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", open && "rotate-90")} />
                          {g.name}
                          <span className="font-normal text-muted-foreground">· {g.items.length} SKU</span>
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
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            ref={(el) => { if (el) inputs.current.set(s.id, el); else inputs.current.delete(s.id); }}
                            type="number" min={0} max={365} inputMode="numeric"
                            value={vals[s.id] ?? ""}
                            onChange={(e) => onChange(s.id, e.target.value)}
                            onKeyDown={(e) => onKeyDown(s.id, e)}
                            onBlur={(e) => { if (st[s.id] !== "saved") save(s.id, e.target.value); }}
                            placeholder="—"
                            className="h-7 w-full text-right text-xs tabular-nums"
                          />
                        </td>
                        <td className="pr-3 text-center"><StatusIcon s={st[s.id]} /></td>
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

export function ContractsSection({ supplierId, contracts }: { supplierId: number; contracts: ContractRow[] }) {
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
      today: new Date(t).toISOString().slice(0, 10),
      soon: new Date(t + 30 * 86400000).toISOString().slice(0, 10),
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Shartnomalar <span className="text-xs font-normal text-muted-foreground">· {contracts.length} ta</span></span>
          <Button size="sm" variant={showForm ? "outline" : "default"} className="h-8 gap-1 text-xs"
            onClick={() => { setShowForm((v) => !v); if (showForm) setForm(emptyForm); }}>
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? "Bekor" : "Qo'shish"}
          </Button>
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
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => edit(c)} aria-label="Tahrirlash">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(c.id)} disabled={isPending} aria-label="O'chirish">
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
}
