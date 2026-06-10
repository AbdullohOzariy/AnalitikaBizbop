"use client";

/**
 * Sverka: filial → guruh topigi (message_thread_id) bog'lash.
 * Mini App'da "Sklad" filial nomiga mos kelsa, xabar shu topikka boradi;
 * mos kelmasa — guruhning umumiy (General) qismiga.
 */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { sverkaTopicSaqlaAction } from "./actions";

export type SverkaTopicRow = { id: number; name: string; topicId: number | null };

export function SverkaTopiklarEditor({ filialar }: { filialar: SverkaTopicRow[] }) {
  const [vals, setVals] = useState<Record<number, string>>(() =>
    Object.fromEntries(filialar.map((f) => [f.id, f.topicId != null ? String(f.topicId) : ""]))
  );
  const [isPending, start] = useTransition();

  const save = (f: SverkaTopicRow) => {
    start(async () => {
      const res = await sverkaTopicSaqlaAction({ branchId: f.id, topicId: (vals[f.id] ?? "").trim() });
      if (res.ok) toast.success(`${f.name} — topic saqlandi.`);
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Mini App&apos;dagi &quot;Sklad&quot; filial nomiga mos kelsa, sverka shu topikka boradi;
        mos kelmasa (erkin matn) — guruhning umumiy qismiga. Topic ID — topikni ochib,
        xabar havolasidagi oxirgi raqamlardan oldingi son (masalan .../<b>12</b>/345).
      </p>
      <ul className="divide-y divide-border/40">
        {filialar.map((f) => {
          const dirty = (vals[f.id] ?? "") !== (f.topicId != null ? String(f.topicId) : "");
          return (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
              <Input
                value={vals[f.id] ?? ""}
                onChange={(e) => setVals((p) => ({ ...p, [f.id]: e.target.value }))}
                placeholder="topic ID"
                inputMode="numeric"
                disabled={isPending}
                className="h-8 w-28 text-right font-mono text-xs"
              />
              <Button size="icon" variant={dirty ? "default" : "ghost"} className="h-8 w-8 shrink-0"
                disabled={isPending || !dirty} onClick={() => save(f)} aria-label={`${f.name} topigini saqlash`}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
