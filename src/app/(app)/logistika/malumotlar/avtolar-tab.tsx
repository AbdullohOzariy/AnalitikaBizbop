"use client";

/**
 * Avtopark ma'lumotnomasi — CRUD + hujjat muddati nazorati.
 *
 * Sug'urta / tex ko'rik muddati BLOKLAMAYDI: muddati o'tgan avto ham reysga
 * chiqishi mumkin (qaror foydalanuvchida) — biz faqat ko'rsatamiz va yuqorida
 * ogohlantiramiz.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Pencil, Search, X, AlertTriangle, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { todayTashkentISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { avtoSaqlaAction, avtoOchirAction, type AvtoInput } from "./actions";

export type AvtoRow = {
  id: number;
  plateNumber: string;
  brand: string;
  model: string | null;
  capacityM3: number | null;
  capacityVagonetka: number | null;
  insuranceUntil: string | null; // "YYYY-MM-DD"
  techInspectionUntil: string | null;
  isActive: boolean;
  note: string | null;
  tripCount: number;
};

const DAY_MS = 86_400_000;
/** "YYYY-MM-DD" → nuqtali ko'rinish. */
const dmy = (s: string) => s.split("-").reverse().join(".");

/** Ikki ISO kun orasidagi farq (kun). Manfiy = o'tgan. */
function kunFarq(iso: string, today: string): number {
  return Math.round(
    (Date.parse(`${iso}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / DAY_MS
  );
}

type Muddat =
  | { holat: "yoq" }
  | { holat: "otgan" | "yaqin" | "ok"; kun: number; matn: string };

/** Hujjat muddati holati. Ogohlantirish chegarasi — 7 kun. */
function muddatHolati(iso: string | null, today: string): Muddat {
  if (!iso) return { holat: "yoq" };
  const kun = kunFarq(iso, today);
  if (kun < 0) return { holat: "otgan", kun, matn: `${-kun} kun o'tgan` };
  if (kun <= 7)
    return { holat: "yaqin", kun, matn: kun === 0 ? "Bugun tugaydi" : `${kun} kundan keyin` };
  return { holat: "ok", kun, matn: dmy(iso) };
}

function MuddatKatak({ iso, today }: { iso: string | null; today: string }) {
  const m = muddatHolati(iso, today);
  if (!iso || m.holat === "yoq") return <span className="text-muted-foreground/60">—</span>;
  if (m.holat === "ok")
    return <span className="text-xs tabular-nums text-muted-foreground">{m.matn}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <Pill tone={m.holat === "otgan" ? "red" : "amber"}>{m.matn}</Pill>
      <span className="text-[10px] tabular-nums text-muted-foreground">{dmy(iso)}</span>
    </div>
  );
}

type Forma = {
  plateNumber: string;
  brand: string;
  model: string;
  capacityM3: string;
  capacityVagonetka: string;
  insuranceUntil: string;
  techInspectionUntil: string;
  note: string;
  isActive: boolean;
};

const BOSH_FORMA: Forma = {
  plateNumber: "",
  brand: "",
  model: "",
  capacityM3: "",
  capacityVagonetka: "",
  insuranceUntil: "",
  techInspectionUntil: "",
  note: "",
  isActive: true,
};

const formaOl = (v: AvtoRow): Forma => ({
  plateNumber: v.plateNumber,
  brand: v.brand,
  model: v.model ?? "",
  capacityM3: v.capacityM3 == null ? "" : String(v.capacityM3),
  capacityVagonetka: v.capacityVagonetka == null ? "" : String(v.capacityVagonetka),
  insuranceUntil: v.insuranceUntil ?? "",
  techInspectionUntil: v.techInspectionUntil ?? "",
  note: v.note ?? "",
  isActive: v.isActive,
});

/** Bo'sh matn → null, aks holda son. */
const sonOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

type Filtr = "hammasi" | "faol" | "nofaol" | "muammo";

const FILTRLAR: { v: Filtr; l: string }[] = [
  { v: "hammasi", l: "Hammasi" },
  { v: "faol", l: "Faol" },
  { v: "nofaol", l: "Nofaol" },
  { v: "muammo", l: "Hujjat muammosi" },
];

export function AvtolarTab({ rows }: { rows: AvtoRow[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const [q, setQ] = useState("");
  const [filtr, setFiltr] = useState<Filtr>("hammasi");
  const [ochir, setOchir] = useState<AvtoRow | null>(null);
  const [editId, setEditId] = useState<number | null>(null); // null + formaOchiq = yangi
  const [formaOchiq, setFormaOchiq] = useState(false);
  const [forma, setForma] = useState<Forma>(BOSH_FORMA);

  // Bugungi kun Toshkent bo'yicha — muddat solishtirish "YYYY-MM-DD" string ustida.
  const today = todayTashkentISO();

  const set = <K extends keyof Forma>(k: K, v: Forma[K]) =>
    setForma((f) => ({ ...f, [k]: v }));

  // ── Ogohlantirish hisoblari ────────────────────────────────────────────────
  const hisob = useMemo(() => {
    const c = { sugurtaOtgan: 0, sugurtaYaqin: 0, texOtgan: 0, texYaqin: 0 };
    for (const v of rows) {
      if (!v.isActive) continue; // nofaol avto yo'lga chiqmaydi — bezovta qilmaymiz
      const s = muddatHolati(v.insuranceUntil, today);
      const t = muddatHolati(v.techInspectionUntil, today);
      if (s.holat === "otgan") c.sugurtaOtgan++;
      else if (s.holat === "yaqin") c.sugurtaYaqin++;
      if (t.holat === "otgan") c.texOtgan++;
      else if (t.holat === "yaqin") c.texYaqin++;
    }
    return c;
  }, [rows, today]);

  const ogohlar = [
    hisob.sugurtaOtgan && `${hisob.sugurtaOtgan} ta avtoning sug'urtasi o'tgan`,
    hisob.texOtgan && `${hisob.texOtgan} ta avtoning tex ko'rigi o'tgan`,
    hisob.sugurtaYaqin && `${hisob.sugurtaYaqin} ta avtoning sug'urtasi 7 kun ichida tugaydi`,
    hisob.texYaqin && `${hisob.texYaqin} ta avtoning tex ko'rigi 7 kun ichida tugaydi`,
  ].filter((s): s is string => typeof s === "string");

  const jiddiy = hisob.sugurtaOtgan > 0 || hisob.texOtgan > 0;

  // ── Filtr ──────────────────────────────────────────────────────────────────
  const Q = q.trim().toUpperCase();
  const shown = useMemo(() => {
    const muammoli = (v: AvtoRow) => {
      const s = muddatHolati(v.insuranceUntil, today).holat;
      const t = muddatHolati(v.techInspectionUntil, today).holat;
      return s === "otgan" || s === "yaqin" || t === "otgan" || t === "yaqin";
    };
    return rows.filter((v) => {
      if (filtr === "faol" && !v.isActive) return false;
      if (filtr === "nofaol" && v.isActive) return false;
      if (filtr === "muammo" && !muammoli(v)) return false;
      if (!Q) return true;
      return (
        v.plateNumber.toUpperCase().includes(Q) ||
        v.brand.toUpperCase().includes(Q) ||
        (v.model ?? "").toUpperCase().includes(Q)
      );
    });
  }, [rows, Q, filtr, today]);

  // ── Amallar ────────────────────────────────────────────────────────────────
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    done?: () => void
  ) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        done?.();
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });

  const yangiOch = () => {
    setEditId(null);
    setForma(BOSH_FORMA);
    setFormaOchiq(true);
  };

  const tahrirOch = (v: AvtoRow) => {
    setEditId(v.id);
    setForma(formaOl(v));
    setFormaOchiq(true);
  };

  const saqla = () => {
    const plate = forma.plateNumber.trim();
    const brand = forma.brand.trim();
    if (!plate) {
      toast.error("Davlat raqamini kiriting.");
      return;
    }
    if (!brand) {
      toast.error("Markani kiriting.");
      return;
    }
    const input: AvtoInput = {
      plateNumber: plate,
      brand,
      model: forma.model.trim() || null,
      capacityM3: sonOrNull(forma.capacityM3),
      capacityVagonetka: sonOrNull(forma.capacityVagonetka),
      insuranceUntil: forma.insuranceUntil || null,
      techInspectionUntil: forma.techInspectionUntil || null,
      note: forma.note.trim() || null,
      isActive: forma.isActive,
    };
    run(
      () => avtoSaqlaAction(editId, input),
      editId ? "Avtomobil yangilandi." : "Avtomobil qo'shildi.",
      () => setFormaOchiq(false)
    );
  };

  const ochirish = () => {
    if (!ochir) return;
    run(() => avtoOchirAction(ochir.id), "Avtomobil o'chirildi.", () => setOchir(null));
  };

  return (
    <div className="space-y-3">
      {/* Hujjat muddati ogohlantirishi — bloklamaydi, faqat xabar beradi */}
      {ogohlar.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-2xl border p-4",
            jiddiy
              ? "border-destructive/25 bg-destructive/[0.06]"
              : "border-amber-500/25 bg-amber-500/[0.06]"
          )}
        >
          <AlertTriangle
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              jiddiy ? "text-destructive" : "text-amber-600 dark:text-amber-400"
            )}
          />
          <div className="flex-1 space-y-0.5">
            {ogohlar.map((o) => (
              <p key={o} className="text-sm font-medium">
                {o}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              Bu reysni to&apos;xtatmaydi — qaror sizda. Hujjat yangilangach muddatni
              tahrirlab qo&apos;ying.
            </p>
          </div>
          <Button
            variant="outline"
            className="h-8 shrink-0 rounded-lg text-xs"
            onClick={() => setFiltr("muammo")}
          >
            Ko&apos;rsatish
          </Button>
        </div>
      )}

      {/* Qidiruv + filtr + qo'shish */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Qidirish — davlat raqami, marka, model..."
            className="h-9 pl-8 pr-8"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTRLAR.map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFiltr(f.v)}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                filtr === f.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
        <Button className="h-9 gap-1.5 rounded-xl" onClick={yangiOch}>
          <Plus className="h-4 w-4" /> Avtomobil
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Avtopark bo'sh"
          description="Reys ochilishi uchun kamida bitta avtomobil kiritilgan bo'lishi kerak."
        >
          <Button className="rounded-xl" onClick={yangiOch}>
            <Plus className="h-4 w-4" /> Birinchi avtomobil
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[130px]">Davlat raqami</TableHead>
                  <TableHead>Marka / model</TableHead>
                  <TableHead className="w-[140px]" title="Yuk shu birlikda o'lchanadi">
                    Sig&apos;im
                  </TableHead>
                  <TableHead className="w-[150px]">Sug&apos;urta</TableHead>
                  <TableHead className="w-[150px]">Tex ko&apos;rik</TableHead>
                  <TableHead className="w-[90px] text-right">Reyslar</TableHead>
                  <TableHead className="w-[100px]">Holat</TableHead>
                  <TableHead className="w-[90px] text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Filtrga mos avtomobil yo&apos;q.
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((v) => {
                    const s = muddatHolati(v.insuranceUntil, today);
                    const t = muddatHolati(v.techInspectionUntil, today);
                    const qizil = s.holat === "otgan" || t.holat === "otgan";
                    return (
                      <TableRow
                        key={v.id}
                        className={cn(
                          "text-sm",
                          !v.isActive && "opacity-55",
                          v.isActive && qizil && "bg-destructive/[0.05]"
                        )}
                      >
                        <TableCell className="font-mono font-semibold uppercase">
                          {v.plateNumber}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{v.brand}</span>
                          {v.model && (
                            <span className="ml-1 text-xs text-muted-foreground">{v.model}</span>
                          )}
                          {v.note && (
                            <div className="text-[11px] text-muted-foreground/80">{v.note}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {v.capacityM3 == null && v.capacityVagonetka == null ? (
                            <span className="text-muted-foreground/60">—</span>
                          ) : (
                            [
                              v.capacityM3 == null ? null : `${v.capacityM3} m³`,
                              v.capacityVagonetka == null ? null : `${v.capacityVagonetka} vag.`,
                            ]
                              .filter(Boolean)
                              .join(" / ")
                          )}
                        </TableCell>
                        <TableCell>
                          <MuddatKatak iso={v.insuranceUntil} today={today} />
                        </TableCell>
                        <TableCell>
                          <MuddatKatak iso={v.techInspectionUntil} today={today} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {v.tripCount > 0 ? v.tripCount.toLocaleString("uz-UZ") : "—"}
                        </TableCell>
                        <TableCell>
                          <Pill tone={v.isActive ? "green" : "muted"}>
                            {v.isActive ? "Faol" : "Nofaol"}
                          </Pill>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                              disabled={isPending}
                              onClick={() => tahrirOch(v)}
                              aria-label={`${v.plateNumber} — tahrirlash`}
                              title="Tahrirlash"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                              disabled={isPending || v.tripCount > 0}
                              onClick={() => setOchir(v)}
                              aria-label={`${v.plateNumber} — o'chirish`}
                              title={
                                v.tripCount > 0
                                  ? "Reysi bor — o'chirib bo'lmaydi, nofaol qiling"
                                  : "O'chirish"
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border/60 px-3 py-2 text-xs tabular-nums text-muted-foreground">
            {shown.length.toLocaleString("uz-UZ")} ta avtomobil
            {shown.length !== rows.length && ` (jami ${rows.length.toLocaleString("uz-UZ")})`}
          </div>
        </div>
      )}

      {/* Qo'shish / tahrirlash formasi */}
      <Dialog open={formaOchiq} onOpenChange={(o) => !o && setFormaOchiq(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Avtomobilni tahrirlash" : "Yangi avtomobil"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Sug&apos;urta va tex ko&apos;rik muddati ixtiyoriy — kiritilsa, tugashiga 7 kun
              qolganda ogohlantirish chiqadi.
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saqla();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Davlat raqami *</Label>
              <Input
                value={forma.plateNumber}
                onChange={(e) => set("plateNumber", e.target.value)}
                placeholder="01 A 123 BC"
                maxLength={20}
                autoFocus
                className="h-9 font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Marka *</Label>
              <Input
                value={forma.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Isuzu"
                maxLength={60}
                className="h-9"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input
                value={forma.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="NQR 75"
                maxLength={60}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sig&apos;im, m³</Label>
              <Input
                value={forma.capacityM3}
                onChange={(e) => set("capacityM3", e.target.value)}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                className="h-9 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sig&apos;im, vagonetka</Label>
              <Input
                value={forma.capacityVagonetka}
                onChange={(e) => set("capacityVagonetka", e.target.value)}
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                className="h-9 text-right"
              />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              Yuk shu birlikda o&apos;lchanadi — reysda haydovchi qaysi birlikda kiritsa,
              to&apos;lganlik shunga qarab hisoblanadi.
            </p>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sug&apos;urta muddati</Label>
              <Input
                value={forma.insuranceUntil}
                onChange={(e) => set("insuranceUntil", e.target.value)}
                type="date"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tex ko&apos;rik muddati</Label>
              <Input
                value={forma.techInspectionUntil}
                onChange={(e) => set("techInspectionUntil", e.target.value)}
                type="date"
                className="h-9"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Izoh</Label>
              <Input
                value={forma.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Masalan: sovutgichli kuzov"
                maxLength={500}
                className="h-9"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={forma.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm">Faol</span>
              <span className="text-xs text-muted-foreground">
                — nofaol avto miniappda reys ochishda ko&apos;rinmaydi
              </span>
            </label>

            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isPending}
              onClick={() => setFormaOchiq(false)}
            >
              Bekor
            </Button>
            <Button className="rounded-xl" disabled={isPending} onClick={saqla}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O'chirish tasdiq */}
      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Avtomobilni o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.plateNumber}</strong> ({ochir?.brand}) avtoparkdan
              o&apos;chiriladi. Reysi bo&apos;lgan avtoni o&apos;chirib bo&apos;lmaydi —
              o&apos;rniga <em>nofaol</em> qilib qo&apos;ying.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isPending}
              onClick={() => setOchir(null)}
            >
              Bekor
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={isPending}
              onClick={ochirish}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
