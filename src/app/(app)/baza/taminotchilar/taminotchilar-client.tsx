"use client";

import Link from "next/link";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 as Loader2b, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatCard, EmptyState } from "@/components/common/page";
import { Search, ChevronRight, X, Loader2, Truck, Package, Tags, IdCard } from "lucide-react";
import {
  supplierSubcatsAction, supplierSkusAction, createSupplierAction, deleteSupplierAction, type SupSub, type SupSku,
} from "./actions";

export type SupplierRow = { id: number; name: string; skuCount: number };

type SubState = { subs: SupSub[] } | "loading" | "error";
type SkuState = { products: SupSku[]; total: number } | "loading" | "error";

export function TaminotchilarClient({ suppliers, canEdit = false }: { suppliers: SupplierRow[]; canEdit?: boolean }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, startCreate] = useTransition();
  const removeSupplier = (sup: SupplierRow) => {
    if (!confirm(`"${sup.name}" o'chirilsinmi?\n\nSKU'lari yo'qolmaydi (yetkazib beruvchisiz qoladi), profil va shartnomalar o'chadi. Zakaz tarixi bo'lsa o'chirish bloklanadi.`)) return;
    startCreate(async () => {
      const res = await deleteSupplierAction(sup.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const addSupplier = () => {
    const nm = newName.trim();
    if (!nm) { toast.error("Yetkazib beruvchi nomini kiriting."); return; }
    startCreate(async () => {
      const res = await createSupplierAction(nm);
      if (res.ok) { toast.success("Yetkazib beruvchi qo'shildi."); setNewName(""); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const [query, setQuery] = useState("");
  const [openSup, setOpenSup] = useState<Set<number>>(new Set());
  const [subData, setSubData] = useState<Map<number, SubState>>(new Map());
  const [openSub, setOpenSub] = useState<Set<string>>(new Set()); // `${supId}:${subId}`
  const [skuData, setSkuData] = useState<Map<string, SkuState>>(new Map());
  const [, startLoad] = useTransition();

  const q = query.trim().toUpperCase();
  const filtered = useMemo(
    () => (q ? suppliers.filter((s) => s.name.toUpperCase().includes(q)) : suppliers),
    [suppliers, q]
  );
  const totalSku = useMemo(() => suppliers.reduce((a, s) => a + s.skuCount, 0), [suppliers]);

  const toggleSup = (s: SupplierRow) => {
    const willOpen = !openSup.has(s.id);
    setOpenSup((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
    if (willOpen && !subData.has(s.id) && s.skuCount > 0) {
      setSubData((m) => new Map(m).set(s.id, "loading"));
      startLoad(async () => {
        const res = await supplierSubcatsAction(s.id);
        setSubData((m) => new Map(m).set(s.id, res.ok ? { subs: res.subs } : "error"));
      });
    }
  };

  const toggleSub = (supId: number, sub: SupSub) => {
    const key = `${supId}:${sub.subId}`;
    const willOpen = !openSub.has(key);
    setOpenSub((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    if (willOpen && !skuData.has(key)) {
      setSkuData((m) => new Map(m).set(key, "loading"));
      startLoad(async () => {
        const res = await supplierSkusAction(supId, sub.subId);
        setSkuData((m) => new Map(m).set(key, res.ok ? { products: res.products, total: res.total } : "error"));
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Statistika */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Yetkazib beruvchilar" value={suppliers.length} icon={Truck} />
        <StatCard label="SKU (mahsulot)" value={totalSku.toLocaleString("uz-UZ")} icon={Package} tone="blue" />
        <StatCard label="Yetkazib beruvchisiz SKU" value="—" icon={Tags} hint="alohida hisoblanadi" />
      </div>

      {/* Qidiruv */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Yetkazib beruvchi nomi bo'yicha qidirish..."
          className="h-9 pl-8 pr-8"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Tozalash"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addSupplier(); }}
            placeholder="Yangi yetkazib beruvchi nomi..." className="h-9 max-w-sm" />
          <Button onClick={addSupplier} disabled={creating} className="h-9 gap-1.5">
            {creating ? <Loader2b className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Qo'shish
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="Yetkazib beruvchi topilmadi" description="Boshqa nom kiriting." />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((sup) => {
            const sOpen = openSup.has(sup.id);
            const sd = subData.get(sup.id);
            return (
              <div key={sup.id} className="rounded-xl border border-border bg-card">
                <div className="flex items-center">
                  <button
                    onClick={() => toggleSup(sup)}
                    aria-expanded={sOpen}
                    aria-label={`${sup.name}, ${sup.skuCount} ta SKU`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${sOpen ? "rotate-90" : ""}`} />
                    <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{sup.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Package className="h-3 w-3" /> {sup.skuCount.toLocaleString("uz-UZ")}
                    </span>
                  </button>
                  <Link
                    href={`/baza/taminotchilar/${sup.id}`}
                    className="mr-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <IdCard className="h-3.5 w-3.5" /> Profil
                  </Link>
                  {canEdit && (
                    <button
                      onClick={() => removeSupplier(sup)}
                      disabled={creating}
                      aria-label={`${sup.name} ni o'chirish`}
                      title="O'chirish (zakaz tarixi bo'lsa bloklanadi)"
                      className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {sOpen && (
                  <div className="border-t border-border/60 px-3 py-2 space-y-1">
                    {sup.skuCount === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">SKU yo&apos;q</p>
                    ) : sd === "error" ? (
                      <p className="text-[11px] text-destructive">Yuklab bo&apos;lmadi.</p>
                    ) : sd === undefined || sd === "loading" ? (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Yuklanmoqda…
                      </p>
                    ) : (
                      sd.subs.map((sub) => {
                        const key = `${sup.id}:${sub.subId}`;
                        const subOpen = openSub.has(key);
                        const kd = skuData.get(key);
                        return (
                          <div key={sub.subId} className="rounded-lg border border-border/50 bg-muted/20">
                            <button
                              onClick={() => toggleSub(sup.id, sub)}
                              aria-expanded={subOpen}
                              aria-label={`${sub.subName}, ${sub.count} ta SKU`}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 transition-colors"
                            >
                              <ChevronRight className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${subOpen ? "rotate-90" : ""}`} />
                              <span className="text-xs font-medium">{sub.subName}</span>
                              {(sub.group || sub.catName) && (
                                <span className="text-[11px] text-muted-foreground">
                                  {[sub.group, sub.catName].filter(Boolean).join(" › ")}
                                </span>
                              )}
                              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                <Package className="h-3 w-3" /> {sub.count}
                              </span>
                            </button>
                            {subOpen && (
                              <div className="border-t border-border/40 px-2.5 py-2">
                                {kd === "error" ? (
                                  <p className="text-[11px] text-destructive">Yuklab bo&apos;lmadi.</p>
                                ) : kd === undefined || kd === "loading" ? (
                                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Yuklanmoqda…
                                  </p>
                                ) : (
                                  <>
                                    <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                      {kd.products.map((p) => (
                                        <div key={p.code} className="flex items-center gap-1.5 text-[11px] min-w-0">
                                          <span className="shrink-0 rounded bg-background px-1 font-mono text-[10px] text-muted-foreground">{p.code}</span>
                                          <span className="truncate" title={p.name}>{p.name}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {kd.total > kd.products.length && (
                                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                                        Ko&apos;rsatilgan {kd.products.length} / jami {kd.total}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
