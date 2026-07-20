"use client";

/**
 * Nuqtalar tabi — reys nuqtalari ma'lumotnomasi (CRUD).
 *
 * Nuqta = reysda boriladigan joy: markaziy sklad, filial, boshqa shahar.
 * Miniappda haydovchi erkin matn yozmaydi — faqat shu ro'yxatdan tanlaydi,
 * shuning uchun reysda ishlatilgan nuqta o'chirilmaydi (nofaol qilinadi).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Pencil, Search, X, MapPin, Star, Route,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-error";
import { nuqtaSaqlaAction, nuqtaOchirAction } from "./actions";

// ── Tiplar ────────────────────────────────────────────────────────────────────

type Kind = "WAREHOUSE" | "BRANCH" | "CITY" | "OTHER";

export type NuqtaRow = {
  id: number;
  name: string;
  kind: Kind;
  branchId: number | null;
  branchName: string | null;
  isHub: boolean;
  isActive: boolean;
  sortOrder: number;
  lat: number | null;
  lng: number | null;
  isLongHaul: boolean;
  staleHours: number | null;
};

const KIND_LABEL: Record<Kind, string> = {
  WAREHOUSE: "Markaziy sklad",
  BRANCH: "Filial",
  CITY: "Shahar",
  OTHER: "Boshqa",
};

const KIND_ITEMS: Record<string, React.ReactNode> = KIND_LABEL;

const KIND_TONE: Record<Kind, "violet" | "blue" | "amber" | "muted"> = {
  WAREHOUSE: "violet",
  BRANCH: "blue",
  CITY: "amber",
  OTHER: "muted",
};

/** Formaning ichki holati — hammasi string (input'lar bilan bir xil). */
type Form = {
  name: string;
  kind: Kind;
  branchId: string; // "0" = biriktirilmagan
  isHub: boolean;
  lat: string;
  lng: string;
  isLongHaul: boolean;
  staleHours: string;
  sortOrder: string;
  isActive: boolean;
};

const BOSH_FORM: Form = {
  name: "",
  kind: "BRANCH",
  branchId: "0",
  isHub: false,
  lat: "",
  lng: "",
  isLongHaul: false,
  staleHours: "",
  sortOrder: "0",
  isActive: true,
};

const formadan = (r: NuqtaRow): Form => ({
  name: r.name,
  kind: r.kind,
  branchId: r.branchId == null ? "0" : String(r.branchId),
  isHub: r.isHub,
  lat: r.lat == null ? "" : String(r.lat),
  lng: r.lng == null ? "" : String(r.lng),
  isLongHaul: r.isLongHaul,
  staleHours: r.staleHours == null ? "" : String(r.staleHours),
  sortOrder: String(r.sortOrder),
  isActive: r.isActive,
});

/** Bo'sh string → null, aks holda son. Noto'g'ri matn → undefined (xato). */
function sonOrNull(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

// ── Komponent ─────────────────────────────────────────────────────────────────

export function NuqtalarTab({
  rows,
  branches,
}: {
  rows: NuqtaRow[];
  branches: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const [q, setQ] = useState("");
  const [faqatFaol, setFaqatFaol] = useState(false);

  // Dialog holati: `ochiq` — forma ko'rinadimi, `editId` — null bo'lsa yangi nuqta.
  const [ochiq, setOchiq] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(BOSH_FORM);
  const [ochir, setOchir] = useState<NuqtaRow | null>(null);

  const branchItems = useMemo(() => {
    const o: Record<string, React.ReactNode> = { "0": "Biriktirilmagan" };
    for (const b of branches) o[String(b.id)] = b.name;
    return o;
  }, [branches]);

  const Q = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!faqatFaol || r.isActive) &&
          (!Q ||
            r.name.toLowerCase().includes(Q) ||
            (r.branchName ?? "").toLowerCase().includes(Q))
      ),
    [rows, Q, faqatFaol]
  );

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const run = (fn: () => Promise<ActionResult>, okMsg: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        done?.();
        router.refresh();
      } else toast.error(res.error);
    });

  const yangi = () => {
    setEditId(null);
    setForm(BOSH_FORM);
    setOchiq(true);
  };

  const tahrir = (r: NuqtaRow) => {
    setEditId(r.id);
    setForm(formadan(r));
    setOchiq(true);
  };

  const saqla = () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Nuqta nomini kiriting.");
      return;
    }

    const lat = sonOrNull(form.lat);
    const lng = sonOrNull(form.lng);
    if (lat === undefined || lng === undefined) {
      toast.error("Koordinata faqat raqam bo'lishi kerak (masalan: 41.311081).");
      return;
    }
    if ((lat === null) !== (lng === null)) {
      toast.error("Koordinata uchun kenglik (lat) va uzunlik (lng) birga kiritiladi.");
      return;
    }
    if (lat !== null && (lat < -90 || lat > 90)) {
      toast.error("Kenglik (lat) −90 va 90 orasida bo'lishi kerak.");
      return;
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
      toast.error("Uzunlik (lng) −180 va 180 orasida bo'lishi kerak.");
      return;
    }

    const staleHours = sonOrNull(form.staleHours);
    if (staleHours === undefined) {
      toast.error("Eskirish soati faqat raqam bo'lishi kerak.");
      return;
    }
    if (staleHours !== null && (staleHours < 1 || staleHours > 168)) {
      toast.error("Eskirish soati 1 va 168 orasida bo'lishi kerak.");
      return;
    }

    const sortOrder = sonOrNull(form.sortOrder);
    if (sortOrder === undefined || (sortOrder !== null && sortOrder < 0)) {
      toast.error("Tartib manfiy bo'lmagan raqam bo'lishi kerak.");
      return;
    }

    run(
      () =>
        nuqtaSaqlaAction(editId, {
          name,
          kind: form.kind,
          // Filial bog'lanishi faqat kind=BRANCH uchun ma'noli.
          branchId:
            form.kind === "BRANCH" && form.branchId !== "0" ? Number(form.branchId) : null,
          isHub: form.isHub,
          isActive: form.isActive,
          sortOrder: sortOrder ?? 0,
          lat,
          lng,
          isLongHaul: form.isLongHaul,
          staleHours,
        }),
      editId ? "Nuqta yangilandi." : "Nuqta qo'shildi.",
      () => setOchiq(false)
    );
  };

  return (
    <div className="space-y-3">
      {/* Filtr paneli */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Qidirish — nuqta yoki filial nomi..."
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
        <button
          type="button"
          onClick={() => setFaqatFaol((v) => !v)}
          className={cn(
            "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
            faqatFaol
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-secondary"
          )}
        >
          Faqat faol
        </button>
        <Button className="h-9 gap-1.5" onClick={yangi} disabled={isPending}>
          <Plus className="h-4 w-4" /> Nuqta qo&apos;shish
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Hali nuqta qo'shilmagan"
          description="Nuqta — reysda boriladigan joy: markaziy sklad, filial yoki boshqa shahar. Reys ochilishi uchun kamida bitta hub (reyslar boshlanadigan nuqta) va bitta manzil kerak."
        >
          <Button className="h-9 gap-1.5" onClick={yangi} disabled={isPending}>
            <Plus className="h-4 w-4" /> Birinchi nuqtani qo&apos;shish
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Nomi</TableHead>
                  <TableHead className="w-[140px]">Turi</TableHead>
                  <TableHead className="w-[150px]">Filial</TableHead>
                  <TableHead className="w-[120px]">Koordinata</TableHead>
                  <TableHead className="w-[130px]">Uzoq yo&apos;nalish</TableHead>
                  <TableHead className="w-[80px] text-right">Tartib</TableHead>
                  <TableHead className="w-[100px]">Holat</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Filtrga mos nuqta yo&apos;q.
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((r) => {
                    const koord = r.lat != null && r.lng != null;
                    return (
                      <TableRow key={r.id} className={cn("text-sm", !r.isActive && "opacity-55")}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {r.name}
                            {r.isHub && (
                              <span
                                title="Hub — reyslar shu yerdan boshlanadi"
                                className="text-amber-500 dark:text-amber-400"
                              >
                                <Star className="h-3.5 w-3.5 fill-current" />
                              </span>
                            )}
                          </span>
                        </TableCell>

                        <TableCell>
                          <Pill tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Pill>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">
                          {r.branchName ?? "—"}
                        </TableCell>

                        <TableCell>
                          {koord ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-primary"
                              title={`${r.lat}, ${r.lng}`}
                            >
                              <MapPin className="h-3.5 w-3.5" /> Bor
                            </span>
                          ) : (
                            <span
                              className="text-xs text-muted-foreground/60"
                              title="GPS tekshiruvi o'chirilgan"
                            >
                              Yo&apos;q
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          {r.isLongHaul ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Route className="h-3.5 w-3.5" />
                              Ha
                              {r.staleHours != null && (
                                <span className="text-muted-foreground/70">
                                  · {r.staleHours} soat
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {r.sortOrder}
                        </TableCell>

                        <TableCell>
                          <Pill tone={r.isActive ? "green" : "muted"}>
                            {r.isActive ? "Faol" : "Nofaol"}
                          </Pill>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={isPending}
                              onClick={() => tahrir(r)}
                              aria-label={`${r.name} — tahrirlash`}
                              title="Tahrirlash"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              disabled={isPending}
                              onClick={() => setOchir(r)}
                              aria-label={`${r.name} — o'chirish`}
                              title="O'chirish"
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
            {shown.length.toLocaleString("uz-UZ")} ta nuqta
          </div>
        </div>
      )}

      {/* Qo'shish / tahrirlash formasi */}
      <Dialog open={ochiq} onOpenChange={(o) => !o && setOchiq(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Nuqtani tahrirlash" : "Yangi nuqta"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Haydovchi miniappda faqat shu ro&apos;yxatdan tanlaydi — nomni tushunarli yozing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nomi</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={120}
                autoFocus
                placeholder="Masalan: Markaziy sklad (Sergeli)"
                className="h-9"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Turi</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => set("kind", typeof v === "string" ? (v as Kind) : "OTHER")}
                  items={KIND_ITEMS}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filial bog'lanishi faqat "Filial" turida ma'noli */}
              {form.kind === "BRANCH" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Filial</Label>
                  <Select
                    value={form.branchId}
                    onValueChange={(v) => set("branchId", typeof v === "string" ? v : "0")}
                    items={branchItems}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Biriktirilmagan</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Toggle
              checked={form.isHub}
              onChange={(v) => set("isHub", v)}
              disabled={isPending}
              label="Hub"
              hint="Reyslar shu yerdan boshlanadi"
            />

            {/* Koordinata — miniapp GPS tekshiruvi uchun */}
            <div className="space-y-1.5 rounded-xl border border-border/60 p-3">
              <Label className="text-xs text-muted-foreground">Koordinata (ixtiyoriy)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={form.lat}
                  onChange={(e) => set("lat", e.target.value)}
                  inputMode="decimal"
                  placeholder="Kenglik (lat) — 41.311081"
                  className="h-9"
                />
                <Input
                  value={form.lng}
                  onChange={(e) => set("lng", e.target.value)}
                  inputMode="decimal"
                  placeholder="Uzunlik (lng) — 69.240562"
                  className="h-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Miniapp GPS tekshiruvi uchun. Bo&apos;sh qoldirsangiz tekshirilmaydi.
              </p>
            </div>

            <Toggle
              checked={form.isLongHaul}
              onChange={(v) => set("isLongHaul", v)}
              disabled={isPending}
              label="Uzoq yo'nalish (boshqa shahar)"
              hint="Yo'lda uzoq yuriladi — kech xabar berish normal hisoblanadi"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Eskirish soati (ixtiyoriy)
                </Label>
                <Input
                  value={form.staleHours}
                  onChange={(e) => set("staleHours", e.target.value)}
                  inputMode="numeric"
                  placeholder="1–168"
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Shu soatdan keyin reys &laquo;eskirgan&raquo; deb belgilanadi.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tartib</Label>
                <Input
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                  inputMode="numeric"
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Kichik raqam ro&apos;yxatda yuqorida turadi.
                </p>
              </div>
            </div>

            <Toggle
              checked={form.isActive}
              onChange={(v) => set("isActive", v)}
              disabled={isPending}
              label="Faol"
              hint="Nofaol nuqta miniappda tanlash uchun ko'rinmaydi"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isPending}
              onClick={() => setOchiq(false)}
            >
              Bekor
            </Button>
            <Button className="rounded-xl" disabled={isPending} onClick={saqla}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O'chirish tasdig'i */}
      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuqtani o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.name}</strong> o&apos;chiriladi. Agar bu nuqta reyslarda
              ishlatilgan bo&apos;lsa, o&apos;chirib bo&apos;lmaydi — uning o&apos;rniga{" "}
              <em>nofaol</em> qilib qo&apos;ying.
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
              onClick={() =>
                ochir &&
                run(() => nuqtaOchirAction(ochir.id), "Nuqta o'chirildi.", () => setOchir(null))
              }
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
// Repoda shadcn `switch` komponenti yo'q — shu tab uchun mahalliy toggle.
function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 text-left transition-colors hover:bg-secondary/50 disabled:pointer-events-none disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-all",
            checked ? "left-[1.125rem]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}
