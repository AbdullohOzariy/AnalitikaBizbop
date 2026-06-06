"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatCard, EmptyState } from "@/components/common/page";
import { Search, X, Loader2, Pencil, Check, PackageSearch, Truck, CheckCircle2 } from "lucide-react";
import { BazaPagination } from "../baza-pagination";
import { assignProductSubcatAction, renameProductAction } from "./actions";

export type UnmatchedProduct = { id: number; code: number; name: string; supplier: string | null };
export type SubOption = { id: number; name: string; cat: string; group: string | null };
type GroupedSubs = { cat: string; group: string | null; subs: { id: number; name: string }[] }[];

export function MoslanmaganClient({
  products, subs, total, page, pageSize,
}: {
  products: UnmatchedProduct[];
  subs: SubOption[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();

  const grouped: GroupedSubs = useMemo(() => {
    const byCat = new Map<string, { group: string | null; subs: { id: number; name: string }[] }>();
    for (const s of subs) {
      const key = s.cat;
      if (!byCat.has(key)) byCat.set(key, { group: s.group, subs: [] });
      byCat.get(key)!.subs.push({ id: s.id, name: s.name });
    }
    return [...byCat.entries()].map(([cat, v]) => ({ cat, group: v.group, subs: v.subs }));
  }, [subs]);

  const filtered = useMemo(
    () => (q ? products.filter((p) => p.name.toUpperCase().includes(q) || String(p.code).includes(q)) : products),
    [products, q]
  );
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Hammasi moslangan"
        description="Kategoriyasiz (moslanmagan) SKU yo'q. Yangi sotuv yuklanganda, master'da bo'lmagan SKU'lar shu yerda paydo bo'ladi."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Moslanmagan SKU" value={total.toLocaleString("uz-UZ")} icon={PackageSearch} tone="red" />
        <StatCard label="Subkategoriyalar" value={subs.length} icon={Search} />
        <StatCard label="Sahifa" value={`${page} / ${totalPages || 1}`} icon={PackageSearch} hint={`${pageSize} tadan`} />
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Shu sahifada qidirish — nom yoki kod..." className="h-9 pl-8 pr-8" />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Tozalash"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="Bu sahifada topilmadi" description="Boshqa nom/kod yoki keyingi sahifa." />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((p) => (
            <MoslanmaganRow key={p.id} product={p} grouped={grouped} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center pt-2">
          <BazaPagination page={page} totalPages={totalPages} basePath="/baza/moslanmagan" />
        </div>
      )}
    </div>
  );
}

function MoslanmaganRow({ product, grouped }: { product: UnmatchedProduct; grouped: GroupedSubs }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [subId, setSubId] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);

  const assign = () => {
    if (!subId) { toast.error("Subkategoriya tanlang."); return; }
    start(async () => {
      const res = await assignProductSubcatAction(product.id, Number(subId));
      if (res.ok) { toast.success("Joylashtirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const saveName = () => {
    const nm = name.trim();
    if (!nm) { toast.error("Nom kerak."); return; }
    if (nm === product.name) { setEditing(false); return; }
    start(async () => {
      const res = await renameProductAction(product.id, nm);
      if (res.ok) { toast.success("Nom yangilandi."); setEditing(false); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{product.code}</span>
      {editing ? (
        <span className="flex items-center gap-1">
          <Input value={name} autoFocus disabled={isPending} className="h-8 w-56 text-xs"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()} />
          <Button size="icon" className="h-8 w-8" disabled={isPending} onClick={saveName} aria-label="Saqlash">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={isPending} onClick={() => { setName(product.name); setEditing(false); }} aria-label="Bekor">
            <X className="h-3.5 w-3.5" />
          </Button>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium" title={product.name}>{product.name}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setEditing(true)} aria-label="Nomni tahrirlash">
            <Pencil className="h-3 w-3" />
          </Button>
        </span>
      )}
      {product.supplier && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Truck className="h-3 w-3" /> {product.supplier}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <Select value={subId} onValueChange={(v) => setSubId(v ?? "")} disabled={isPending}>
          <SelectTrigger className="h-8 w-60 text-xs"><SelectValue placeholder="Subkategoriya tanlang…" /></SelectTrigger>
          <SelectContent>
            {grouped.map((g) => (
              <SelectGroup key={g.cat}>
                <SelectLabel>{g.group ? `${g.group} › ${g.cat}` : g.cat}</SelectLabel>
                {g.subs.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" disabled={isPending || !subId} onClick={assign}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Tayinlash"}
        </Button>
      </div>
    </div>
  );
}
