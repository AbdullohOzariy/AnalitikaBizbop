"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronRight, Search, X, FolderTree, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterSub = { id: number; name: string };
export type FilterCat = { id: number; name: string; subs: FilterSub[] };
export type FilterGroup = { id: number; name: string; cats: FilterCat[] };

type Tri = "all" | "some" | "none";

// Kategoriya bargi (mahsulot biriktiriladigan daraja): subkat bo'lsa subkatlar,
// bo'lmasa kategoriyaning o'zi.
function catLeaves(c: FilterCat): number[] {
  return c.subs.length > 0 ? c.subs.map((s) => s.id) : [c.id];
}
function groupLeaves(g: FilterGroup): number[] {
  return g.cats.flatMap(catLeaves);
}
function triState(leaves: number[], sel: Set<number>): Tri {
  if (leaves.length === 0) return "none";
  let n = 0;
  for (const id of leaves) if (sel.has(id)) n++;
  return n === 0 ? "none" : n === leaves.length ? "all" : "some";
}

function TriBox({ state, className }: { state: Tri; className?: string }) {
  return (
    <span className={cn(
      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
      state === "all" ? "border-primary bg-primary text-primary-foreground"
        : state === "some" ? "border-primary bg-primary/20 text-primary"
        : "border-muted-foreground/40",
      className
    )}>
      {state === "all" && <Check className="h-3 w-3" />}
      {state === "some" && <Minus className="h-3 w-3" />}
    </span>
  );
}

/**
 * Kategoriya filtri — daraxt (Guruh → Kategoriya → Subkategoriya), kaskadli ko'p tanlash.
 * Guruh belgilansa barcha kat/subkat avto belgilanadi; barg id'lari (subkat) qaytadi.
 */
export function CategoryTreeFilter({
  groups, selected, onApply, disabled,
}: {
  groups: FilterGroup[];
  selected: number[];
  onApply: (leafIds: number[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set(selected));
  const [q, setQ] = useState("");
  const [openG, setOpenG] = useState<Set<number>>(new Set());
  const [openC, setOpenC] = useState<Set<number>>(new Set());

  // Dialog ochilganda joriy (URL) tanlovdan boshlaymiz
  const openDialog = () => { setSel(new Set(selected)); setQ(""); setOpen(true); };

  const allLeaves = useMemo(() => groups.flatMap(groupLeaves), [groups]);
  const toggleLeaf = (id: number) =>
    setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMany = (ids: number[], on: boolean) =>
    setSel((p) => { const n = new Set(p); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  const toggleCat = (c: FilterCat) => { const l = catLeaves(c); setMany(l, triState(l, sel) !== "all"); };
  const toggleGroup = (g: FilterGroup) => { const l = groupLeaves(g); setMany(l, triState(l, sel) !== "all"); };

  const expand = (set: Set<number>, key: number, setter: (s: Set<number>) => void) =>
    setter((() => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; })());

  // Qidiruv — mos subkat/kat/guruhlar (tekis)
  const Q = q.trim().toUpperCase();
  const matches = useMemo(() => {
    if (!Q) return [];
    const out: { id: number; label: string }[] = [];
    for (const g of groups) for (const c of g.cats) {
      const leaves = c.subs.length > 0 ? c.subs : [{ id: c.id, name: c.name }];
      for (const s of leaves) {
        if (s.name.toUpperCase().includes(Q) || c.name.toUpperCase().includes(Q) || g.name.toUpperCase().includes(Q))
          out.push({ id: s.id, label: `${g.name} › ${c.name}${c.subs.length ? ` › ${s.name}` : ""}` });
      }
    }
    return out.slice(0, 200);
  }, [groups, Q]);

  const apply = () => { onApply([...sel]); setOpen(false); };
  const clearAll = () => setSel(new Set());

  const count = selected.length;
  const label = count === 0 ? "Barcha kategoriyalar" : `${count} ta tanlangan`;

  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={openDialog}
        className="h-9 w-56 justify-between gap-2 px-3 font-normal">
        <span className="flex items-center gap-1.5 truncate">
          <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        {count > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kategoriya tanlash</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Guruh, kategoriya yoki subkategoriyalarni belgilang. Guruh belgilansa — ichidagilari avto belgilanadi.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish..." className="h-9 pl-8 pr-8" />
            {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>

          <div className="max-h-[50vh] space-y-0.5 overflow-y-auto pr-1">
            {Q ? (
              matches.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Topilmadi.</p>
              ) : matches.map((m) => (
                <button key={m.id} type="button" onClick={() => toggleLeaf(m.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/50">
                  <TriBox state={sel.has(m.id) ? "all" : "none"} />
                  <span className="truncate">{m.label}</span>
                </button>
              ))
            ) : groups.map((g) => {
              const gOpen = openG.has(g.id);
              const gState = triState(groupLeaves(g), sel);
              return (
                <div key={g.id}>
                  <div className="flex items-center gap-1 rounded-md hover:bg-muted/50">
                    <button type="button" onClick={() => expand(openG, g.id, setOpenG)} className="p-1 text-muted-foreground" aria-label="Ochish">
                      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", gOpen && "rotate-90")} />
                    </button>
                    <button type="button" onClick={() => toggleGroup(g)} className="flex flex-1 items-center gap-2 py-1.5 text-left text-sm font-medium">
                      <TriBox state={gState} /> {g.name}
                    </button>
                  </div>
                  {gOpen && g.cats.map((c) => {
                    const cOpen = openC.has(c.id);
                    const cState = triState(catLeaves(c), sel);
                    const hasSubs = c.subs.length > 0;
                    return (
                      <div key={c.id} className="ml-5">
                        <div className="flex items-center gap-1 rounded-md hover:bg-muted/50">
                          {hasSubs ? (
                            <button type="button" onClick={() => expand(openC, c.id, setOpenC)} className="p-1 text-muted-foreground" aria-label="Ochish">
                              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", cOpen && "rotate-90")} />
                            </button>
                          ) : <span className="w-[22px]" />}
                          <button type="button" onClick={() => toggleCat(c)} className="flex flex-1 items-center gap-2 py-1.5 text-left text-sm">
                            <TriBox state={cState} /> {c.name}
                          </button>
                        </div>
                        {hasSubs && cOpen && c.subs.map((s) => (
                          <button key={s.id} type="button" onClick={() => toggleLeaf(s.id)}
                            className="ml-[30px] flex w-[calc(100%-30px)] items-center gap-2 rounded-md py-1.5 pl-1 text-left text-xs hover:bg-muted/50">
                            <TriBox state={sel.has(s.id) ? "all" : "none"} />
                            <span className="truncate text-muted-foreground">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {sel.size === 0 ? "Hammasi" : `${sel.size} / ${allLeaves.length}`}
            </span>
            <Button variant="ghost" className="rounded-xl" disabled={sel.size === 0} onClick={clearAll}>Tozalash</Button>
            <Button className="rounded-xl" onClick={apply}>Qo&apos;llash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
