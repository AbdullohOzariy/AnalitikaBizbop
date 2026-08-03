"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ShieldOff,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight as BothIcon,
  Loader2,
  Plus,
  X,
  AlertTriangle,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Pill, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { moddaYangilaAction, aliasQoshAction, aliasOchirAction } from "./actions";

type Direction = "IN_ONLY" | "OUT_ONLY" | "BOTH";

type Article = {
  id: number;
  code: string;
  name: string;
  groupId: number;
  direction: string;
  isNeutral: boolean;
  isTransfer: boolean;
  isActive: boolean;
  note: string | null;
  aliases: { id: number; alias: string }[];
};

type Group = {
  id: number;
  code: string;
  name: string;
  section: string;
  sortOrder: number;
  articles: Article[];
};

const SECTIONS: Record<string, { label: string; hint: string; tone: string }> = {
  OPERATING: {
    label: "Operatsion",
    hint: "Kundalik faoliyat — savdo tushumi, ta'minotchi, ish haqi, kommunal",
    tone: "border-l-primary",
  },
  INVESTING: {
    label: "Investitsion",
    hint: "Kapital qo'yilma — qurilish, yer, uzoq muddatli aktivlar",
    tone: "border-l-blue-500",
  },
  FINANCING: {
    label: "Moliyaviy",
    hint: "Egasi va kreditorlar bilan hisob-kitob — dividend, qarz, moliyaviy yordam",
    tone: "border-l-violet-500",
  },
  TECHNICAL: {
    label: "Texnik",
    hint: "Pul kompaniya ICHIDA ko'chdi yoki texnik yozuv — hisobotlarga kirmaydi",
    tone: "border-l-muted-foreground",
  },
};

const DIRECTIONS: { value: Direction; label: string; icon: typeof ArrowDownLeft }[] = [
  { value: "IN_ONLY", label: "Faqat kirim", icon: ArrowDownLeft },
  { value: "OUT_ONLY", label: "Faqat chiqim", icon: ArrowUpRight },
  { value: "BOTH", label: "Ikkalasi", icon: BothIcon },
];

export function MalumotnomaClient({
  groups,
  canEdit,
}: {
  groups: Group[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        done?.();
        router.refresh();
      } else {
        toast.error(res.error ?? "Xato.");
      }
    });

  // Bo'limlar bo'yicha guruhlaymiz — tartib server tomonda belgilangan.
  const bySection = groups.reduce<Record<string, Group[]>>((acc, g) => {
    (acc[g.section] ??= []).push(g);
    return acc;
  }, {});

  const visible = (a: Article) => showInactive || a.isActive;

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Ma'lumotnoma bo'sh"
        description="Moddalar hali yuklanmagan. `npm run db:seed-moliya` buyrug'i bilan boshlang'ich ro'yxatni yuklang."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {canEdit
            ? "Moddani bosib bayroqlarini o'zgartiring. «Transfer» yoqilsa «Neytral» avtomatik yoqiladi."
            : "Ko'rish rejimi — tahrirlash uchun moliyachi yoki tizim admini huquqi kerak."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowInactive((v) => !v)}
          className="shrink-0 gap-1.5 text-xs"
        >
          <EyeOff className="h-3.5 w-3.5" />
          {showInactive ? "Nofaollarni yashirish" : "Nofaollarni ko'rsatish"}
        </Button>
      </div>

      {Object.entries(bySection).map(([section, secGroups]) => {
        const meta = SECTIONS[section] ?? { label: section, hint: "", tone: "border-l-border" };
        const count = secGroups.flatMap((g) => g.articles).filter(visible).length;
        return (
          <Card key={section} className={cn("border-l-4", meta.tone)}>
            <CardContent className="space-y-4 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{meta.label}</h2>
                  <Pill>{count} modda</Pill>
                </div>
                {meta.hint && <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>}
              </div>

              <div className="space-y-3">
                {secGroups.map((g) => {
                  const arts = g.articles.filter(visible);
                  if (arts.length === 0) return null;
                  return (
                    <div key={g.id}>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {g.name}
                      </div>
                      <div className="space-y-1">
                        {arts.map((a) => {
                          const open = openId === a.id;
                          return (
                            <div
                              key={a.id}
                              className={cn(
                                "rounded-xl border border-border bg-card/50 transition-colors",
                                !a.isActive && "opacity-50",
                                open && "border-primary/40 bg-card"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenId(open ? null : a.id);
                                  setAliasDraft("");
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                              >
                                <span className="flex-1 truncate text-sm">{a.name}</span>

                                {a.note && (
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                                )}
                                {a.isTransfer && (
                                  <Pill className="shrink-0 gap-1 bg-accent/10 text-accent">
                                    <ArrowLeftRight className="h-3 w-3" />
                                    transfer
                                  </Pill>
                                )}
                                {a.isNeutral && (
                                  <Pill className="shrink-0 gap-1 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                    <ShieldOff className="h-3 w-3" />
                                    neytral
                                  </Pill>
                                )}
                                {a.aliases.length > 0 && (
                                  <Pill className="shrink-0">{a.aliases.length} alias</Pill>
                                )}
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                    open && "rotate-180"
                                  )}
                                />
                              </button>

                              {open && (
                                <div className="space-y-3 border-t border-border px-3 py-3">
                                  {a.note && (
                                    <div className="flex gap-2 rounded-lg bg-destructive/5 p-2.5 text-xs text-muted-foreground">
                                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                                      <span>{a.note}</span>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-4">
                                    {/* Yo'nalish */}
                                    <div>
                                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                        Ruxsat etilgan yo'nalish
                                      </div>
                                      <div className="flex gap-1">
                                        {DIRECTIONS.map((d) => {
                                          const Icon = d.icon;
                                          const active = a.direction === d.value;
                                          return (
                                            <Button
                                              key={d.value}
                                              type="button"
                                              size="sm"
                                              variant={active ? "default" : "outline"}
                                              disabled={!canEdit || isPending || a.isTransfer}
                                              onClick={() =>
                                                run(
                                                  () =>
                                                    moddaYangilaAction({ id: a.id, direction: d.value }),
                                                  "Yo'nalish yangilandi."
                                                )
                                              }
                                              className="h-7 gap-1 px-2 text-xs"
                                            >
                                              <Icon className="h-3 w-3" />
                                              {d.label}
                                            </Button>
                                          );
                                        })}
                                      </div>
                                      {a.isTransfer && (
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                          Transfer ikki tomonlama — yo'nalish qulflangan
                                        </p>
                                      )}
                                    </div>

                                    {/* Bayroqlar */}
                                    <div>
                                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                        Bayroqlar
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={a.isNeutral ? "default" : "outline"}
                                          disabled={!canEdit || isPending || a.isTransfer}
                                          onClick={() =>
                                            run(
                                              () =>
                                                moddaYangilaAction({ id: a.id, isNeutral: !a.isNeutral }),
                                              a.isNeutral ? "Neytral olib tashlandi." : "Neytral qilindi."
                                            )
                                          }
                                          className="h-7 gap-1 px-2 text-xs"
                                        >
                                          <ShieldOff className="h-3 w-3" />
                                          Neytral
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={a.isTransfer ? "default" : "outline"}
                                          disabled={!canEdit || isPending}
                                          onClick={() =>
                                            run(
                                              () =>
                                                moddaYangilaAction({ id: a.id, isTransfer: !a.isTransfer }),
                                              a.isTransfer ? "Transfer olib tashlandi." : "Transfer qilindi."
                                            )
                                          }
                                          className="h-7 gap-1 px-2 text-xs"
                                        >
                                          <ArrowLeftRight className="h-3 w-3" />
                                          Transfer
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={a.isActive ? "outline" : "default"}
                                          disabled={!canEdit || isPending}
                                          onClick={() =>
                                            run(
                                              () =>
                                                moddaYangilaAction({ id: a.id, isActive: !a.isActive }),
                                              a.isActive ? "Nofaol qilindi." : "Faollashtirildi."
                                            )
                                          }
                                          className="h-7 gap-1 px-2 text-xs"
                                        >
                                          <EyeOff className="h-3 w-3" />
                                          {a.isActive ? "Nofaol qilish" : "Faollashtirish"}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Aliaslar */}
                                  <div>
                                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                      Aliaslar — tarix importida shu nomlar bilan kelgan qatorlar shu moddaga tushadi
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {a.aliases.map((al) => (
                                        <span
                                          key={al.id}
                                          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"
                                        >
                                          {al.alias}
                                          {canEdit && (
                                            <button
                                              type="button"
                                              disabled={isPending}
                                              onClick={() =>
                                                run(() => aliasOchirAction(al.id), "Alias o'chirildi.")
                                              }
                                              className="text-muted-foreground hover:text-destructive"
                                              aria-label="Aliasni o'chirish"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                      {a.aliases.length === 0 && (
                                        <span className="text-xs text-muted-foreground">yo&apos;q</span>
                                      )}
                                    </div>

                                    {canEdit && (
                                      <div className="mt-2 flex gap-1.5">
                                        <Input
                                          value={aliasDraft}
                                          onChange={(e) => setAliasDraft(e.target.value)}
                                          placeholder="Yangi alias (manbadagi yozilishi)"
                                          className="h-8 max-w-xs text-xs"
                                          onKeyDown={(e) => {
                                            if (e.key !== "Enter") return;
                                            e.preventDefault();
                                            const alias = aliasDraft.trim();
                                            if (!alias) return;
                                            run(
                                              () => aliasQoshAction({ articleId: a.id, alias }),
                                              "Alias qo'shildi.",
                                              () => setAliasDraft("")
                                            );
                                          }}
                                        />
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          disabled={isPending || !aliasDraft.trim()}
                                          onClick={() =>
                                            run(
                                              () =>
                                                aliasQoshAction({
                                                  articleId: a.id,
                                                  alias: aliasDraft.trim(),
                                                }),
                                              "Alias qo'shildi.",
                                              () => setAliasDraft("")
                                            )
                                          }
                                          className="h-8 gap-1 px-2 text-xs"
                                        >
                                          {isPending ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <Plus className="h-3 w-3" />
                                          )}
                                          Qo&apos;shish
                                        </Button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-muted-foreground">
                                    kod: <code>{a.code}</code>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
