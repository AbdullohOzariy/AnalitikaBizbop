"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ChevronRight, Search, X, FolderTree, Check } from "lucide-react";

export type SubItem = { id: number; name: string; cat: string; group: string | null };

type GroupNode = { group: string; cats: { cat: string; subs: { id: number; name: string }[] }[] };

/**
 * Subkategoriyani daraxt ko'rinishida tanlash (Guruh → Kategoriya → Subkategoriya).
 * Boshlang'ich holatda hammasi yig'ilgan. Qidiruv — tekis natija.
 */
export function SubcatTreePicker({
  subs, disabled, triggerLabel = "Subkategoriya tanlash", currentSubId, onPick,
}: {
  subs: SubItem[];
  disabled?: boolean;
  triggerLabel?: string;
  currentSubId?: number | null;
  onPick: (subId: number, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [openG, setOpenG] = useState<Set<string>>(new Set());
  const [openC, setOpenC] = useState<Set<string>>(new Set());

  const tree: GroupNode[] = useMemo(() => {
    const g = new Map<string, Map<string, { id: number; name: string }[]>>();
    for (const s of subs) {
      const gk = s.group ?? "—";
      if (!g.has(gk)) g.set(gk, new Map());
      const cm = g.get(gk)!;
      if (!cm.has(s.cat)) cm.set(s.cat, []);
      cm.get(s.cat)!.push({ id: s.id, name: s.name });
    }
    return [...g.entries()].map(([group, cm]) => ({
      group,
      cats: [...cm.entries()].map(([cat, ss]) => ({ cat, subs: ss })),
    }));
  }, [subs]);

  const Q = q.trim().toUpperCase();
  const matches = useMemo(
    () => (Q ? subs.filter((s) => s.name.toUpperCase().includes(Q) || s.cat.toUpperCase().includes(Q) || (s.group ?? "").toUpperCase().includes(Q)) : []),
    [subs, Q]
  );

  const pick = (id: number, label: string) => { onPick(id, label); setOpen(false); setQ(""); };
  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); setter(n);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={disabled} onClick={() => setOpen(true)}>
        <FolderTree className="h-3.5 w-3.5" /> {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subkategoriya tanlang</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Guruh → kategoriya → subkategoriya. Yoki qidiring.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Subkategoriya qidirish..." className="h-9 pl-8 pr-8" />
            {q && (
              <button onClick={() => setQ("")} aria-label="Tozalash"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border/60">
            {Q ? (
              matches.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Topilmadi.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {matches.map((s) => (
                    <button key={s.id} onClick={() => pick(s.id, s.name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-[11px] text-muted-foreground">{[s.group, s.cat].filter(Boolean).join(" › ")}</span>
                      {currentSubId === s.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="divide-y divide-border/40">
                {tree.map((g) => {
                  const gOpen = openG.has(g.group);
                  return (
                    <div key={g.group}>
                      <button onClick={() => toggle(openG, g.group, setOpenG)} aria-expanded={gOpen}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-muted/40">
                        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${gOpen ? "rotate-90" : ""}`} />
                        {g.group}
                        <span className="ml-auto text-[11px] font-normal text-muted-foreground">{g.cats.length} kat</span>
                      </button>
                      {gOpen && g.cats.map((c) => {
                        const ck = `${g.group}|${c.cat}`;
                        const cOpen = openC.has(ck);
                        return (
                          <div key={ck}>
                            <button onClick={() => toggle(openC, ck, setOpenC)} aria-expanded={cOpen}
                              className="flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-xs font-medium hover:bg-muted/40">
                              <ChevronRight className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${cOpen ? "rotate-90" : ""}`} />
                              {c.cat}
                              <span className="ml-auto text-[11px] font-normal text-muted-foreground">{c.subs.length}</span>
                            </button>
                            {cOpen && (
                              <div className="space-y-0.5 py-1 pl-12 pr-2">
                                {c.subs.map((s) => (
                                  <button key={s.id} onClick={() => pick(s.id, s.name)}
                                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/60 ${currentSubId === s.id ? "bg-primary/10 text-primary" : ""}`}>
                                    <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                                    {s.name}
                                    {currentSubId === s.id && <Check className="ml-auto h-3 w-3" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
