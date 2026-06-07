"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/page";
import { SubcatTreePicker } from "@/components/common/subcat-tree-picker";
import { Search, X, Loader2, Pencil, Check, Truck, CheckCircle2 } from "lucide-react";
import { BazaPagination } from "../baza-pagination";
import { assignProductSubcatAction, renameProductAction, applyNameAction, dismissNameAction } from "./actions";

export type UnmatchedProduct = { id: number; code: number; name: string; supplier: string | null };
export type SubOption = { id: number; name: string; cat: string; group: string | null };
export type NameMismatch = { productId: number; code: number; masterName: string; fileName: string };

export function MoslanmaganClient({
  products, subs, total, page, pageSize, mismatches, nameTotal,
}: {
  products: UnmatchedProduct[];
  subs: SubOption[];
  total: number;
  page: number;
  pageSize: number;
  mismatches: NameMismatch[];
  nameTotal: number;
}) {
  if (total === 0 && nameTotal === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Hammasi moslangan"
        description="Kategoriyasiz SKU va nom farqi yo'q. Yangi sotuv yuklanganda muammoli SKU'lar shu yerda paydo bo'ladi."
      />
    );
  }

  return (
    <Tabs defaultValue={total > 0 ? "cat" : "name"} className="w-full">
      <TabsList>
        <TabsTrigger value="cat">Kategoriyasiz · {total.toLocaleString("uz-UZ")}</TabsTrigger>
        <TabsTrigger value="name">Nom farqi · {nameTotal.toLocaleString("uz-UZ")}</TabsTrigger>
      </TabsList>

      <TabsContent value="cat" className="pt-3">
        <CategorylessTab products={products} subs={subs} total={total} page={page} pageSize={pageSize} />
      </TabsContent>

      <TabsContent value="name" className="pt-3">
        <NameMismatchTab mismatches={mismatches} nameTotal={nameTotal} />
      </TabsContent>
    </Tabs>
  );
}

// ─── Tab 1: kategoriyasiz SKU ──────────────────────────────────────────────────
function CategorylessTab({
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
  const filtered = useMemo(
    () => (q ? products.filter((p) => p.name.toUpperCase().includes(q) || String(p.code).includes(q)) : products),
    [products, q]
  );
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    return <EmptyState icon={CheckCircle2} title="Kategoriyasiz SKU yo'q" description="Barcha mahsulotlar iyerarxiyaga joylashtirilgan." />;
  }

  return (
    <div className="space-y-3">
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
          {filtered.map((p) => <CategorylessRow key={p.id} product={p} subs={subs} />)}
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

function CategorylessRow({ product, subs }: { product: UnmatchedProduct; subs: SubOption[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);

  const assign = (sid: number) => {
    start(async () => {
      const res = await assignProductSubcatAction(product.id, sid);
      if (res.ok) { toast.success("Joylashtirildi."); router.refresh(); } else toast.error(res.error);
    });
  };
  const saveName = () => {
    const nm = name.trim();
    if (!nm) { toast.error("Nom kerak."); return; }
    if (nm === product.name) { setEditing(false); return; }
    start(async () => {
      const res = await renameProductAction(product.id, nm);
      if (res.ok) { toast.success("Nom yangilandi."); setEditing(false); router.refresh(); } else toast.error(res.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{product.code}</span>
      {editing ? (
        <span className="flex items-center gap-1">
          <Input value={name} autoFocus disabled={isPending} className="h-8 w-56 text-xs"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
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
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <SubcatTreePicker subs={subs} disabled={isPending} onPick={(sid) => assign(sid)} />
      </div>
    </div>
  );
}

// ─── Tab 2: nom farqi ──────────────────────────────────────────────────────────
function NameMismatchTab({ mismatches, nameTotal }: { mismatches: NameMismatch[]; nameTotal: number }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();
  const filtered = useMemo(
    () => (q ? mismatches.filter((m) => m.masterName.toUpperCase().includes(q) || m.fileName.toUpperCase().includes(q) || String(m.code).includes(q)) : mismatches),
    [mismatches, q]
  );

  if (nameTotal === 0) {
    return <EmptyState icon={CheckCircle2} title="Nom farqi yo'q" description="Sotuv fayllaridagi nomlar master bilan mos." />;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Qidirish — nom yoki kod..." className="h-9 pl-8 pr-8" />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Tozalash"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {nameTotal > mismatches.length && (
        <p className="text-[11px] text-muted-foreground">Ko&apos;rsatilgan {mismatches.length} / jami {nameTotal}.</p>
      )}
      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="Topilmadi" description="Boshqa nom/kod kiriting." />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((m) => <NameMismatchRow key={m.productId} m={m} />)}
        </div>
      )}
    </div>
  );
}

function NameMismatchRow({ m }: { m: NameMismatch }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); router.refresh(); } else toast.error(res.error ?? "Xato.");
    });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{m.code}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Master</span>
          <span className="truncate font-medium" title={m.masterName}>{m.masterName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Fayl</span>
          <span className="truncate text-amber-700 dark:text-amber-300" title={m.fileName}>{m.fileName}</span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" className="h-8" disabled={isPending}
          onClick={() => run(() => applyNameAction(m.productId), "Nom yangilandi.")}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fayl nomiga yangilash"}
        </Button>
        <Button size="sm" variant="outline" className="h-8" disabled={isPending}
          onClick={() => run(() => dismissNameAction(m.productId), "Master nomi saqlandi.")}>
          Master&apos;ni saqlash
        </Button>
      </div>
    </div>
  );
}
