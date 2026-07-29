"use client";

import { useState, useTransition } from "react";
import { Search, Save, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatCard, Pill } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveGlobalLimitAction, saveCategoryLimitAction } from "./actions";

export interface NazoratQator {
  id: number;
  nom: string;
  ota: string | null; // ota kategoriya nomi (subkategoriya bo'lsa)
  bolim: string | null;
  skuSoni: number;
  maxDays: number | null; // shu kategoriyaga belgilangan istisno
  note: string | null;
}

export function NazoratClient({
  global,
  rows,
  canEdit,
}: {
  global: number | null;
  rows: NazoratQator[];
  canEdit: boolean;
}) {
  const [globalRaw, setGlobalRaw] = useState(global != null ? String(global) : "");
  const [q, setQ] = useState("");
  const [faqatBelgilangan, setFaqatBelgilangan] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<number, string>>({});

  const belgilanganSoni = rows.filter((r) => r.maxDays != null).length;

  const korinadigan = rows.filter((r) => {
    if (faqatBelgilangan && r.maxDays == null) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return (
      r.nom.toLowerCase().includes(t) ||
      (r.ota ?? "").toLowerCase().includes(t) ||
      (r.bolim ?? "").toLowerCase().includes(t)
    );
  });

  function saqlaGlobal() {
    start(async () => {
      const r = await saveGlobalLimitAction(globalRaw);
      toast[r.ok ? "success" : "error"](
        r.ok
          ? globalRaw.trim() === "" || Number(globalRaw) <= 0
            ? "Nazorat o'chirildi"
            : `Global chegara: ${Number(globalRaw)} kun`
          : r.error
      );
    });
  }

  function saqlaKategoriya(id: number, nom: string) {
    const val = draft[id] ?? "";
    start(async () => {
      const r = await saveCategoryLimitAction({ categoryId: id, maxDays: val });
      if (r.ok) {
        setDraft((d) => {
          const n = { ...d };
          delete n[id];
          return n;
        });
        toast.success(
          val.trim() === "" || Number(val) <= 0
            ? `${nom}: istisno olib tashlandi`
            : `${nom}: ${Number(val)} kun`
        );
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Global chegara"
          value={global != null ? `${global} kun` : "o'chiq"}
          tone={global != null ? "green" : "default"}
          hint="Istisno belgilanmagan barcha kategoriyalar uchun"
        />
        <StatCard
          label="Istisnolar"
          value={belgilanganSoni}
          tone="violet"
          hint="Alohida chegara belgilangan kategoriyalar"
        />
        <StatCard label="Kategoriyalar" value={rows.length} hint="Kategoriya va subkategoriyalar" />
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Zakazga miqdor kiritilganda tizim natijaviy zaxirani hisoblaydi:{" "}
          <b className="text-foreground">(qoldiq + zakaz miqdori) ÷ kunlik o&apos;rtacha sotuv</b>.
          Natija chegaradan oshsa qator qizil bo&apos;ladi va zakazni qabul qilishda
          tasdiqlash so&apos;raladi — <b className="text-foreground">bloklanmaydi</b> (mavsum va
          aksiya uchun ataylab ko&apos;p olinishi mumkin).
          <div className="mt-1">
            Eng aniq qoida ustun turadi: <b className="text-foreground">subkategoriya → kategoriya → global</b>.
            Sotuvi yo&apos;q SKU tekshirilmaydi (zaxira kunini hisoblab bo&apos;lmaydi).
          </div>
        </div>
      </div>

      <SectionCard title="Global standart" description="Barcha kategoriyalar uchun asosiy chegara">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Maksimal zaxira (kun)
            </label>
            <Input
              type="number"
              inputMode="numeric"
              value={globalRaw}
              disabled={!canEdit || pending}
              onChange={(e) => setGlobalRaw(e.target.value)}
              placeholder="masalan 45"
              className="mt-1 h-9 w-32 text-right tabular-nums"
            />
          </div>
          {canEdit && (
            <Button size="sm" onClick={saqlaGlobal} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Saqlash
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Bo&apos;sh qoldirsangiz yoki 0 kiritsangiz — nazorat butunlay o&apos;chadi.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Kategoriya istisnolari"
        description="Faqat global standartdan farq qiladiganlarni kiriting"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFaqatBelgilangan((v) => !v)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                faqatBelgilangan
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              faqat belgilangan
            </button>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Kategoriya izlash…"
                className="h-8 w-52 pl-7 text-sm"
              />
            </div>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-border/60 bg-card text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Kategoriya</th>
                <th className="px-3 py-2 text-left font-semibold">Bo&apos;lim</th>
                <th className="px-3 py-2 text-right font-semibold">SKU</th>
                <th className="px-3 py-2 text-right font-semibold">Chegara (kun)</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {korinadigan.map((r) => {
                const val = draft[r.id] ?? (r.maxDays != null ? String(r.maxDays) : "");
                const ozgargan = draft[r.id] != null;
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-1.5">
                      <span className="font-medium">{r.nom}</span>
                      {r.ota && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">{r.ota}</span>
                      )}
                      {r.maxDays != null && <Pill tone="violet">istisno</Pill>}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.bolim ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                      {r.skuSoni || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={val}
                        disabled={!canEdit || pending}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                        placeholder={global != null ? String(global) : "—"}
                        className={cn(
                          "ml-auto h-7 w-20 text-right text-xs tabular-nums",
                          ozgargan && "border-primary"
                        )}
                      />
                    </td>
                    {canEdit && (
                      <td className="px-3 py-1.5 text-right">
                        {ozgargan && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => saqlaKategoriya(r.id, r.nom)}
                            className="h-7 px-2 text-xs"
                          >
                            <Save className="mr-1 h-3 w-3" />
                            Saqlash
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {korinadigan.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Mos kategoriya topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
