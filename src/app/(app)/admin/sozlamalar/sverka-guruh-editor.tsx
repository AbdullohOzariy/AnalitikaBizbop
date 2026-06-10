"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { sverkaGuruhSaqlaAction } from "./actions";

export function SverkaGuruhEditor({ initial }: { initial: string }) {
  const [chatId, setChatId] = useState(initial);
  const [isPending, start] = useTransition();
  const dirty = chatId.trim() !== initial.trim();

  const onSave = () => {
    start(async () => {
      const res = await sverkaGuruhSaqlaAction(chatId.trim());
      if (res.ok) toast.success("Sverka guruh chat ID saqlandi.");
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Har bir to&apos;ldirilgan sverka (nakladnoy rasmi + ma&apos;lumotlari bilan) shu guruhga
        yuboriladi. Bot guruhga a&apos;zo bo&apos;lishi shart. Chat ID odatda{" "}
        <span className="font-mono">-100…</span> ko&apos;rinishida. Bo&apos;sh qoldirilsa — yuborilmaydi.
      </p>
      <div className="flex gap-2">
        <Input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="-100xxxxxxxxxx"
          disabled={isPending}
          className="h-10 rounded-xl font-mono"
          inputMode="numeric"
        />
        <Button onClick={onSave} disabled={isPending || !dirty} className="h-10 rounded-xl shrink-0">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Saqlash</>}
        </Button>
      </div>
    </div>
  );
}
