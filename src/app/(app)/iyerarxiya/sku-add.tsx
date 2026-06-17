"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SubcatTreePicker, type SubItem } from "@/components/common/subcat-tree-picker";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { HGroup } from "./iyerarxiya-client";
import { createSkuAction } from "./actions";

export function SkuAdd({ groups }: { groups: HGroup[] }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [subId, setSubId] = useState<number | null>(null);
  const [subLabel, setSubLabel] = useState("");
  const [isPending, start] = useTransition();

  // Tekis subkat ro'yxati (daraxt tanlagich uchun)
  const subsFlat: SubItem[] = useMemo(
    () => groups.flatMap((g) => g.categories.flatMap((c) =>
      c.children.map((s) => ({ id: s.id, name: s.name, cat: c.name, group: g.name })))),
    [groups]
  );

  const reset = () => { setName(""); setCode(""); setSubId(null); setSubLabel(""); };

  const submit = () => {
    const nm = name.trim();
    if (!nm) { toast.error("SKU nomini kiriting."); return; }
    if (subId == null) { toast.error("Subkategoriya tanlang."); return; }
    const codeNum = code.trim() === "" ? undefined : Number(code);
    if (codeNum !== undefined && (!Number.isInteger(codeNum) || codeNum <= 0)) {
      toast.error("Kod musbat butun son bo'lishi kerak (yoki bo'sh qoldiring)."); return;
    }
    start(async () => {
      const res = await createSkuAction({ name: nm, code: codeNum, categoryId: subId });
      if (res.ok) {
        toast.success(
          codeNum != null
            ? `SKU qo'shildi (kod ${res.code}).`
            : `SKU qo'shildi — vaqtinchalik kod ${res.code}. Haqiqiy kodni keyin "Ro'yxat (SKU)" tabidan kiriting.`
        );
        reset();
      } else toast.error(res.error);
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          Yangi SKU qo&apos;shing. Qoldiq va sotuv <b>0</b> turadi — keyingi kunlarda sotuv ma&apos;lumotlari
          kelganda <b>kod</b> bo&apos;yicha avtomatik to&apos;ladi.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">SKU nomi *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isPending}
              placeholder="Masalan: Coca-Cola 1L" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Kod (1C) — ixtiyoriy</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isPending}
              type="number" inputMode="numeric" placeholder="Keyin biriktirsa ham bo'ladi" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subkategoriya *</Label>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {subLabel || <span className="text-muted-foreground">tanlanmagan</span>}
              </span>
              <SubcatTreePicker subs={subsFlat} disabled={isPending} triggerLabel="Tanlash"
                currentSubId={subId} onPick={(sid, label) => { setSubId(sid); setSubLabel(label); }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Qo&apos;shish
          </Button>
          <span className="text-xs text-muted-foreground">
            Kod bo&apos;sh qolsa — vaqtinchalik kod beriladi; sotuv biriktirilishi uchun keyin haqiqiy 1C kodni kiriting.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
