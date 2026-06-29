"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, FileText, Store } from "lucide-react";
import {
  updateSupplierTermsAction, updateSupplierBranchProfileAction,
  type SupplierTerms, type BranchProfileRow,
} from "../actions";

// ── Yordamchilar ──────────────────────────────────────────────────────────────
const numStr = (v: number | null) => (v == null ? "" : String(v));
const parseNum = (s: string): number | null => {
  const n = Number(s);
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Bool3({ value, onChange, disabled }: { value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  const btn = (val: boolean, label: string) => (
    <button type="button" disabled={disabled} onClick={() => onChange(value === val ? null : val)}
      className={cn("h-9 flex-1 rounded-md border text-xs font-medium transition-colors",
        value === val ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50",
        disabled && "opacity-60")}>
      {label}
    </button>
  );
  return <div className="flex gap-1.5">{btn(true, "Ha")}{btn(false, "Yo'q")}</div>;
}

const RESP_ROLES = ["Supervayzer", "Reg. menejer", "Diller", "Filial rahbari", "Direktor"] as const;

// ── Umumiy shartlar ───────────────────────────────────────────────────────────
export function SupplierTermsSection({ supplierId, terms, canEdit }: {
  supplierId: number; terms: SupplierTerms; canEdit: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<SupplierTerms>(terms);
  const [dirty, setDirty] = useState(false);
  const [isPending, start] = useTransition();
  const set = <K extends keyof SupplierTerms>(k: K, v: SupplierTerms[K]) => { setF((p) => ({ ...p, [k]: v })); setDirty(true); };
  const txt = (k: keyof SupplierTerms) => (f[k] as string | null) ?? "";
  const num = (k: keyof SupplierTerms) => numStr(f[k] as number | null);

  const save = () => start(async () => {
    const res = await updateSupplierTermsAction({ supplierId, ...f });
    if (res.ok) { toast.success("Shartlar saqlandi."); setDirty(false); router.refresh(); } else toast.error(res.error);
  });

  const dis = !canEdit || isPending;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-muted-foreground" /> Shartlar / Profil</CardTitle>
        {canEdit && (
          <Button size="sm" className="h-8 gap-1.5" disabled={dis || !dirty} onClick={save}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Saqlash
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* To'lov */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="To'lov turi">
            <Select value={f.paymentType ?? ""} onValueChange={(v) => set("paymentType", (typeof v === "string" && v ? v : null))} disabled={dis}>
              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PERECHISLENIYE">Perechisleniye</SelectItem>
                <SelectItem value="NAQD">Naqd</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {f.paymentType === "PERECHISLENIYE" && (
            <Field label="EHF fakturada 1:1">
              <Bool3 value={f.ehfMatch} onChange={(v) => set("ehfMatch", v)} disabled={dis} />
            </Field>
          )}
          <Field label="Otsrochka (kun)">
            <Input type="number" inputMode="numeric" value={num("otsrochkaDays")} disabled={dis}
              placeholder="30 / 45 / 60 / 90" className="h-9" onChange={(e) => set("otsrochkaDays", parseNum(e.target.value))} />
          </Field>
        </div>

        {/* Moliyaviy */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Debitorka limiti bormi">
            <Bool3 value={f.debitorHas} onChange={(v) => { set("debitorHas", v); if (v === false) set("debitorLimit", null); }} disabled={dis} />
          </Field>
          <Field label="Debitorka limiti (summa)">
            <Input type="number" inputMode="decimal" value={num("debitorLimit")} disabled={dis || f.debitorHas === false}
              placeholder="summa" className="h-9" onChange={(e) => set("debitorLimit", parseNum(e.target.value))} />
          </Field>
          <Field label="Asosiy chegirma (%)">
            <Input type="number" inputMode="decimal" value={num("discountPct")} disabled={dis}
              placeholder="%" className="h-9" onChange={(e) => set("discountPct", parseNum(e.target.value))} />
          </Field>
          <Field label="Retrobonus (%)">
            <Input type="number" inputMode="decimal" value={num("retrobonusPct")} disabled={dis}
              placeholder="%" className="h-9" onChange={(e) => set("retrobonusPct", parseNum(e.target.value))} />
          </Field>
          <Field label="Marketing skidkasi bormi">
            <Bool3 value={f.marketingDiscount} onChange={(v) => set("marketingDiscount", v)} disabled={dis} />
          </Field>
        </div>

        {/* Boshqaruv */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Agent/merchandiser tartibi" className="lg:col-span-2">
            <Input value={txt("agentMerchNote")} disabled={dis} placeholder="ishlash tartibi"
              className="h-9" onChange={(e) => set("agentMerchNote", e.target.value)} />
          </Field>
          <Field label="Promo kalendari tuzilganmi">
            <Bool3 value={f.promoCalendar} onChange={(v) => set("promoCalendar", v)} disabled={dis} />
          </Field>
          <Field label="Promo tizimi (izoh)" className="lg:col-span-3">
            <Input value={txt("promoSystem")} disabled={dis} placeholder="promo tizimi haqida"
              className="h-9" onChange={(e) => set("promoSystem", e.target.value)} />
          </Field>
        </div>

        {/* Kontaktlar */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mas'ul shaxslar</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mas'ul — lavozim">
              <Select value={f.responsibleRole ?? ""} onValueChange={(v) => set("responsibleRole", (typeof v === "string" && v ? v : null))} disabled={dis}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{RESP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Mas'ul — F.I.SH">
              <Input value={txt("responsibleName")} disabled={dis} placeholder="Ism" className="h-9" onChange={(e) => set("responsibleName", e.target.value)} />
            </Field>
            <Field label="Mas'ul — tel">
              <Input value={txt("responsiblePhone")} disabled={dis} placeholder="+998 ..." className="h-9" onChange={(e) => set("responsiblePhone", e.target.value)} />
            </Field>
            <ContactPair label="Sverka" name={txt("sverkaName")} phone={txt("sverkaPhone")} dis={dis}
              onName={(v) => set("sverkaName", v)} onPhone={(v) => set("sverkaPhone", v)} />
            <ContactPair label="Buxgalteriya (EHF)" name={txt("accountingName")} phone={txt("accountingPhone")} dis={dis}
              onName={(v) => set("accountingName", v)} onPhone={(v) => set("accountingPhone", v)} />
            <ContactPair label="Dastavka (logistika)" name={txt("logisticsName")} phone={txt("logisticsPhone")} dis={dis}
              onName={(v) => set("logisticsName", v)} onPhone={(v) => set("logisticsPhone", v)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContactPair({ label, name, phone, dis, onName, onPhone }: {
  label: string; name: string; phone: string; dis: boolean; onName: (v: string) => void; onPhone: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1.5">
        <Input value={name} disabled={dis} placeholder="Ism" className="h-9" onChange={(e) => onName(e.target.value)} />
        <Input value={phone} disabled={dis} placeholder="nomer" className="h-9 w-32" onChange={(e) => onPhone(e.target.value)} />
      </div>
    </Field>
  );
}

// ── Filial bo'yicha profil ─────────────────────────────────────────────────────
export function BranchProfilesSection({ supplierId, profiles, canEdit }: {
  supplierId: number; profiles: BranchProfileRow[]; canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4 text-muted-foreground" /> Filial bo'yicha profil</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profiles.length === 0
          ? <p className="text-sm text-muted-foreground">Filial yo'q.</p>
          : profiles.map((p) => <BranchProfileCard key={p.branchId} supplierId={supplierId} row={p} canEdit={canEdit} />)}
      </CardContent>
    </Card>
  );
}

function BranchProfileCard({ supplierId, row, canEdit }: { supplierId: number; row: BranchProfileRow; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<BranchProfileRow>(row);
  const [dirty, setDirty] = useState(false);
  const [isPending, start] = useTransition();
  const set = <K extends keyof BranchProfileRow>(k: K, v: BranchProfileRow[K]) => { setF((p) => ({ ...p, [k]: v })); setDirty(true); };
  const num = (k: keyof BranchProfileRow) => numStr(f[k] as number | null);
  const txt = (k: keyof BranchProfileRow) => (f[k] as string | null) ?? "";
  const dis = !canEdit || isPending;

  const save = () => start(async () => {
    const res = await updateSupplierBranchProfileAction({
      supplierId, branchId: row.branchId,
      shelfLengthCm: f.shelfLengthCm, faceCount: f.faceCount, skuCount: f.skuCount,
      orderDay: f.orderDay, deliveryDays: f.deliveryDays, deliveryWeekday: f.deliveryWeekday,
      deliveryTime: f.deliveryTime, dpPaymentTerms: f.dpPaymentTerms,
      forecastYearly: f.forecastYearly, forecastMonthly: f.forecastMonthly,
    });
    if (res.ok) { toast.success(`${row.branchName} saqlandi.`); setDirty(false); router.refresh(); } else toast.error(res.error);
  });

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{row.branchName}</span>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={dis || !dirty} onClick={save}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Saqlash
          </Button>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Dolya polka (sm)">
          <Input type="number" inputMode="numeric" value={num("shelfLengthCm")} disabled={dis} className="h-8" onChange={(e) => set("shelfLengthCm", parseNum(e.target.value))} />
        </Field>
        <Field label="Face soni">
          <Input type="number" inputMode="numeric" value={num("faceCount")} disabled={dis} className="h-8" onChange={(e) => set("faceCount", parseNum(e.target.value))} />
        </Field>
        <Field label="SKU soni">
          <Input type="number" inputMode="numeric" value={num("skuCount")} disabled={dis} className="h-8" onChange={(e) => set("skuCount", parseNum(e.target.value))} />
        </Field>
        <Field label="Zakaz kuni">
          <Input value={txt("orderDay")} disabled={dis} placeholder="mas. Du, Pa" className="h-8" onChange={(e) => set("orderDay", e.target.value)} />
        </Field>
        <Field label="Dastavka (necha kun)">
          <Input type="number" inputMode="numeric" value={num("deliveryDays")} disabled={dis} className="h-8" onChange={(e) => set("deliveryDays", parseNum(e.target.value))} />
        </Field>
        <Field label="Dastavka kuni">
          <Input value={txt("deliveryWeekday")} disabled={dis} placeholder="qaysi kun" className="h-8" onChange={(e) => set("deliveryWeekday", e.target.value)} />
        </Field>
        <Field label="Dastavka soati">
          <Input value={txt("deliveryTime")} disabled={dis} placeholder="mas. 09:00–12:00" className="h-8" onChange={(e) => set("deliveryTime", e.target.value)} />
        </Field>
        <Field label="Qo'shimcha polka (DP) sharti">
          <Input value={txt("dpPaymentTerms")} disabled={dis} placeholder="summa / matn" className="h-8" onChange={(e) => set("dpPaymentTerms", e.target.value)} />
        </Field>
        <Field label="Prognoz — yillik">
          <Input type="number" inputMode="decimal" value={num("forecastYearly")} disabled={dis} className="h-8" onChange={(e) => set("forecastYearly", parseNum(e.target.value))} />
        </Field>
        <Field label="Prognoz — oylik">
          <Input type="number" inputMode="decimal" value={num("forecastMonthly")} disabled={dis} className="h-8" onChange={(e) => set("forecastMonthly", parseNum(e.target.value))} />
        </Field>
      </div>
    </div>
  );
}
