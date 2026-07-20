"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { shiftPeriod } from "@/lib/period";

/**
 * Kanban davr + postavshik filtri — zakaz YARATILGAN sanasi va ta'minotchisi
 * bo'yicha. O'qchalar davrni oldinga/orqaga siljitadi (to'liq oy tanlansa oyma-oy,
 * aks holda davr uzunligiga teng qadam). ChiqimFilter naqshi: har o'zgarish darhol
 * URL'ga yoziladi, tugma kutilmaydi.
 */
function KanbanFilterInner({
  defaultStart,
  defaultEnd,
  defaultSupplierId,
  suppliers,
  basePath = "/sotuv/sotib-olish",
}: {
  defaultStart: string;
  defaultEnd: string;
  defaultSupplierId?: string;
  suppliers?: { id: number; name: string }[];
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "all");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Server yangi default'larni uzatganda (navigatsiyadan keyin) lokal holatni
  // URL bilan qayta sinxronlaymiz — aks holda inputlar eski qiymatda qotib qoladi.
  const propsKey = `${defaultStart}|${defaultEnd}|${defaultSupplierId ?? ""}`;
  const [seenKey, setSeenKey] = useState(propsKey);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setStart(defaultStart);
    setEnd(defaultEnd);
    setSupplierId(defaultSupplierId ?? "all");
  }

  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (!v || v === "all") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${basePath}?${p.toString()}`, { scroll: false });
  };

  const onDate = (key: "start" | "end", value: string) => {
    if (key === "start") setStart(value);
    else setEnd(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
        navigate({ [key]: value || undefined });
    }, 500);
  };

  const onDateCommit = (key: "start" | "end", value: string) => {
    clearTimeout(debounceRef.current);
    if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
      navigate({ [key]: value || undefined });
  };

  const shift = (dir: 1 | -1) => {
    const next = shiftPeriod(start, end, dir);
    if (!next) return;
    clearTimeout(debounceRef.current);
    setStart(next.start);
    setEnd(next.end);
    navigate({ start: next.start, end: next.end });
  };

  const onSupplier = (v: string | null) => {
    const next = v ?? "all";
    setSupplierId(next);
    navigate({ supplierId: next });
  };

  // Ikkala sana to'ldirilmagan bo'lsa siljitadigan davr yo'q
  const canShift = Boolean(start && end);
  const hasFilters = Boolean(start || end || (supplierId && supplierId !== "all"));

  const reset = () => {
    clearTimeout(debounceRef.current);
    setStart("");
    setEnd("");
    setSupplierId("all");
    router.replace(basePath, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Ta'minotchi filtri */}
      {suppliers && suppliers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ta&apos;minotchi</Label>
          <Select value={supplierId} onValueChange={onSupplier}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Barchasi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barchasi</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Davr (yaratilgan sana)</Label>
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="outline"
            onClick={() => shift(-1)}
            disabled={!canShift}
            className="h-9 w-9 shrink-0"
            title="Oldingi davr"
            aria-label="Oldingi davr"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            aria-label="Boshlanish sanasi"
            value={start}
            onChange={(e) => onDate("start", e.target.value)}
            onBlur={(e) => onDateCommit("start", e.target.value)}
            className="h-9 w-40"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Tugash sanasi"
            value={end}
            onChange={(e) => onDate("end", e.target.value)}
            onBlur={(e) => onDateCommit("end", e.target.value)}
            className="h-9 w-40"
          />
          <Button
            size="icon"
            variant="outline"
            onClick={() => shift(1)}
            disabled={!canShift}
            className="h-9 w-9 shrink-0"
            title="Keyingi davr"
            aria-label="Keyingi davr"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {hasFilters && (
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          className="h-9 gap-1.5 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Tozalash
        </Button>
      )}
    </div>
  );
}

// useSearchParams Suspense chegarasini talab qiladi (statik prerender'da xato).
export function KanbanFilter(props: ComponentProps<typeof KanbanFilterInner>) {
  return (
    <Suspense fallback={null}>
      <KanbanFilterInner {...props} />
    </Suspense>
  );
}
