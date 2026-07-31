"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prognoz filtri — `BazaFilter` dan farqli ravishda SANASIZ. Prognoz oynasini
 * foydalanuvchi emas, yugurish (run) belgilaydi: "keyingi 4 hafta" o'zgarmas.
 * Sana tanlagichi bo'lsa, u hech narsaga ta'sir qilmay chalg'itardi.
 */
type Opt = { id: number; name: string };

const SINFLAR: [string, string][] = [
  ["SMOOTH", "Barqaror"],
  ["ERRATIC", "Notekis"],
  ["INTERMITTENT", "Siyrak"],
  ["LUMPY", "Siyrak+notekis"],
];

function Inner({
  basePath,
  branches,
  categories,
  sp,
}: {
  basePath: string;
  branches: Opt[];
  categories: Opt[];
  sp: { branchId?: string; categoryId?: string; abc?: string; sinf?: string; q?: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(sp.q ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Server yangi default berganda lokal holat qayta sinxronlanadi
  const kalit = `${sp.q ?? ""}`;
  const [korilgan, setKorilgan] = useState(kalit);
  if (korilgan !== kalit) {
    setKorilgan(kalit);
    setQ(sp.q ?? "");
  }

  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (!v || v === "all") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${basePath}?${p.toString()}`, { scroll: false });
  };

  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate({ q: v.trim() || undefined }), 450);
  };

  const bor = sp.branchId || sp.categoryId || sp.abc || sp.sinf || sp.q;
  const sel =
    "h-9 rounded-xl border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={sel}
        value={sp.branchId ?? "all"}
        onChange={(e) => navigate({ branchId: e.target.value })}
      >
        <option value="all">Barcha filial</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <select
        className={cn(sel, "max-w-[200px]")}
        value={sp.categoryId ?? "all"}
        onChange={(e) => navigate({ categoryId: e.target.value })}
      >
        <option value="all">Barcha kategoriya</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select className={sel} value={sp.abc ?? "all"} onChange={(e) => navigate({ abc: e.target.value })}>
        <option value="all">ABC: barchasi</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
      </select>

      <select className={sel} value={sp.sinf ?? "all"} onChange={(e) => navigate({ sinf: e.target.value })}>
        <option value="all">Sinf: barchasi</option>
        {SINFLAR.map(([v, nom]) => (
          <option key={v} value={v}>
            {nom}
          </option>
        ))}
      </select>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(sel, "w-52 pl-8")}
          placeholder="Nom yoki kod…"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {bor && (
        <button
          type="button"
          onClick={() => router.replace(basePath, { scroll: false })}
          className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-2.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
          Tozalash
        </button>
      )}
    </div>
  );
}

export function PrognozFilter(props: Parameters<typeof Inner>[0]) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
