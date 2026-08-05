"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Check, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { onecShopBoglaAction } from "./actions";

export type OnecShopBranch = {
  id: number;
  name: string;
  onecShopId: number | null;
  /** Shu do'kondan kelgan cheklar soni — biriktirish to'g'riligini tekshirish uchun. */
  chekSoni?: number;
};

/**
 * 1C do'kon ID (chekdagi `shop`) → filial bog'lash.
 *
 * Biriktirilmagan bo'lsa chek BARIBIR saqlanadi, faqat filialsiz turadi.
 * Biriktirilgach — o'sha do'konning eski filialsiz cheklari ham bog'lanadi.
 */
export function OnecShopEditor({
  branches,
  bogliqsizShoplar,
}: {
  branches: OnecShopBranch[];
  /** Cheklarda uchragan, lekin hech bir filialga biriktirilmagan shop ID lar. */
  bogliqsizShoplar: { shop: number; soni: number }[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const saqla = (b: OnecShopBranch) => {
    const qiymat = (draft[b.id] ?? String(b.onecShopId ?? "")).trim();
    if (qiymat === String(b.onecShopId ?? "")) return;
    setSavingId(b.id);
    setSavedId(null);
    start(async () => {
      const res = await onecShopBoglaAction({ branchId: b.id, shopId: qiymat });
      setSavingId(null);
      if (res.ok) {
        toast.success(
          qiymat ? `"${b.name}" → 1C do'kon ${qiymat} bog'landi.` : `"${b.name}" bog'lanishi olib tashlandi.`
        );
        setSavedId(b.id);
        router.refresh();
      } else {
        toast.error(res.error ?? "Xato.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        1C chekida <code>shop</code> raqami keladi — u qaysi filial ekanini shu yerda
        ko&apos;rsatasiz. Biriktirilmagan do&apos;kon cheklari ham saqlanadi, keyin
        biriktirilgach avtomatik bog&apos;lanadi.
      </p>

      {bogliqsizShoplar.length > 0 && (
        <div className="rounded-lg bg-amber-500/[0.07] px-3 py-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Store className="h-3.5 w-3.5" />
            Cheklarda uchragan, lekin biriktirilmagan do&apos;konlar:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bogliqsizShoplar.map((s) => (
              <span key={s.shop} className="rounded-md bg-background px-2 py-0.5 font-mono">
                shop {s.shop} · {s.soni} chek
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-border/60">
        {branches.map((b) => {
          const qiymat = draft[b.id] ?? String(b.onecShopId ?? "");
          const ozgargan = qiymat !== String(b.onecShopId ?? "");
          return (
            <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.onecShopId != null ? (
                      <span>
                        1C do&apos;kon: <span className="text-foreground/80">{b.onecShopId}</span>
                        {b.chekSoni != null && ` · ${b.chekSoni.toLocaleString("uz-UZ")} chek`}
                      </span>
                    ) : (
                      <span className="opacity-60">Biriktirilmagan</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Input
                  inputMode="numeric"
                  value={qiymat}
                  placeholder="shop ID"
                  onChange={(e) => setDraft({ ...draft, [b.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && saqla(b)}
                  className="h-9 w-28 text-sm tabular-nums"
                />
                <Button
                  size="sm"
                  variant={ozgargan ? "default" : "outline"}
                  disabled={isPending || !ozgargan}
                  onClick={() => saqla(b)}
                  className="h-9"
                >
                  {savingId === b.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : savedId === b.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    "Saqlash"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
