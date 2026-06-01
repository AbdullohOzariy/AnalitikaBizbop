"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  saveGroupAction, deleteGroupAction, saveCategoryAction, deleteCategoryAction,
} from "./actions";

export type EditorSub = { id: number; name: string; code: number | null; salesCount: number };
export type EditorCat = {
  id: number; name: string; code: number | null; salesCount: number; children: EditorSub[];
};
export type EditorGroup = { id: number; name: string; code: number | null; categories: EditorCat[] };

const GROUP_COLORS: Record<string, string> = {
  FRESH: "bg-emerald-500", FOOD: "bg-amber-500", "NON-FOOD": "bg-blue-500",
};
const onlyDigits = (v: string) => v.replace(/[^\d]/g, "");
const norm = (s: string) => s.toUpperCase();

/** Nom + kod (+ ixtiyoriy ko'chirish Select) inline tahrir qatori. */
function EditRow({
  initialName, initialCode, onSave, onCancel, move,
}: {
  initialName: string;
  initialCode: number | null;
  onSave: (name: string, code: string) => void;
  onCancel: () => void;
  move?: React.ReactNode;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode != null ? String(initialCode) : "");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave(name, code)}
        className="h-8 w-48 text-xs" placeholder="Nom" />
      <Input value={code} onChange={(e) => setCode(onlyDigits(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onSave(name, code)}
        className="h-8 w-24 text-xs font-mono" placeholder="1C KOD" inputMode="numeric" />
      {move}
      <Button size="icon" className="h-8 w-8" onClick={() => onSave(name, code)} title="Saqlash">
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancel} title="Bekor">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger, disabled }: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <Button variant="ghost" size="icon" title={title} disabled={disabled} onClick={onClick}
      className={`h-6 w-6 ${danger ? "text-destructive hover:text-destructive" : "text-muted-foreground"}`}>
      {children}
    </Button>
  );
}

export function HierarchyEditor({ groups, query = "" }: { groups: EditorGroup[]; query?: string }) {
  const [isPending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>(""); // ko'chirish maqsadi (group yoki parent id)

  const allGroups = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name })), [groups]);
  const allCats = useMemo(
    () => groups.flatMap((g) => g.categories.map((c) => ({ id: c.id, name: c.name }))), [groups]);

  // qidiruv filtri (view bilan bir xil mantiq)
  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return groups;
    const Q = norm(q);
    const m = (n: string, c: number | null) => norm(n).includes(Q) || (c != null && String(c).includes(Q));
    return groups
      .map((g) => {
        const gm = m(g.name, g.code);
        const cats = g.categories
          .map((c) => {
            const cm = m(c.name, c.code);
            const kids = gm || cm ? c.children : c.children.filter((s) => m(s.name, s.code));
            return cm || gm || kids.length ? { ...c, children: kids } : null;
          })
          .filter(Boolean) as EditorCat[];
        return gm || cats.length ? { ...g, categories: cats } : null;
      })
      .filter(Boolean) as EditorGroup[];
  }, [groups, query]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); setEditing(null); setAdding(null); setMoveTo(""); }
      else toast.error(res.error ?? "Xato.");
    });

  const startEdit = (key: string, currentParent: number) => { setEditing(key); setMoveTo(String(currentParent)); };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {"Nom va 1C KOD'ni o'zgartiring, ko'chiring, qo'shing yoki o'chiring."}
        </p>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding("root")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Guruh
        </Button>
      </div>

      {adding === "root" && (
        <div className="rounded-lg border border-dashed p-2">
          <EditRow initialName="" initialCode={null} onCancel={() => setAdding(null)}
            onSave={(name, code) => run(() => saveGroupAction({ name, code }), "Guruh qo'shildi.")} />
        </div>
      )}

      {shown.map((group) => (
        <div key={group.id} className="rounded-xl border border-border bg-card">
          {/* GURUH */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
            <span className={`h-2 w-2 rounded-full ${GROUP_COLORS[group.name] ?? "bg-muted-foreground"}`} />
            {editing === `g:${group.id}` ? (
              <EditRow initialName={group.name} initialCode={group.code} onCancel={() => setEditing(null)}
                onSave={(name, code) => run(() => saveGroupAction({ id: group.id, name, code }), "Saqlandi.")} />
            ) : (
              <>
                <span className="font-semibold text-sm">{group.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{group.code ?? "—"}</span>
                <span className="text-xs text-muted-foreground">· {group.categories.length} kat</span>
                <div className="ml-auto flex items-center gap-1">
                  <IconBtn title="Tahrirlash" onClick={() => setEditing(`g:${group.id}`)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn title="Kategoriya qo'shish" onClick={() => setAdding(`g:${group.id}`)}><Plus className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn title="O'chirish" danger disabled={isPending}
                    onClick={() => { if (confirm(`"${group.name}" guruhini o'chirasizmi?`)) run(() => deleteGroupAction(group.id), "O'chirildi."); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </>
            )}
          </div>

          <div className="divide-y divide-border/40">
            {adding === `g:${group.id}` && (
              <div className="px-3 py-2 bg-muted/30">
                <EditRow initialName="" initialCode={null} onCancel={() => setAdding(null)}
                  onSave={(name, code) => run(() => saveCategoryAction({ name, code, groupId: group.id }), "Kategoriya qo'shildi.")} />
              </div>
            )}

            {group.categories.map((cat) => (
              <div key={cat.id} className="px-3 py-2">
                {/* KATEGORIYA */}
                <div className="flex items-center gap-2">
                  {editing === `c:${cat.id}` ? (
                    <EditRow initialName={cat.name} initialCode={cat.code} onCancel={() => setEditing(null)}
                      move={
                        <Select value={moveTo} onValueChange={(v) => setMoveTo(v ?? "")}>
                          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {allGroups.map((g) => (
                              <SelectItem key={g.id} value={String(g.id)}>→ {g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      }
                      onSave={(name, code) =>
                        run(() => saveCategoryAction({ id: cat.id, name, code, groupId: Number(moveTo) || group.id }), "Saqlandi.")} />
                  ) : (
                    <>
                      <span className="text-sm font-medium ml-2">{cat.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{cat.code ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        · {cat.children.length} sub{cat.salesCount > 0 && ` · ${cat.salesCount} sotuv`}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <IconBtn title="Tahrirlash" onClick={() => startEdit(`c:${cat.id}`, group.id)}><Pencil className="h-3 w-3" /></IconBtn>
                        <IconBtn title="Subkategoriya qo'shish" onClick={() => setAdding(`c:${cat.id}`)}><Plus className="h-3 w-3" /></IconBtn>
                        <IconBtn title="O'chirish" danger disabled={isPending}
                          onClick={() => { if (confirm(`"${cat.name}" kategoriyasini o'chirasizmi?`)) run(() => deleteCategoryAction(cat.id), "O'chirildi."); }}>
                          <Trash2 className="h-3 w-3" />
                        </IconBtn>
                      </div>
                    </>
                  )}
                </div>

                {adding === `c:${cat.id}` && (
                  <div className="mt-1.5 ml-6 pl-2 border-l">
                    <EditRow initialName="" initialCode={null} onCancel={() => setAdding(null)}
                      onSave={(name, code) => run(() => saveCategoryAction({ name, code, parentId: cat.id }), "Subkategoriya qo'shildi.")} />
                  </div>
                )}

                {cat.children.length > 0 && (
                  <div className="mt-1.5 ml-6 pl-2 border-l space-y-1">
                    {cat.children.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        {editing === `s:${sub.id}` ? (
                          <EditRow initialName={sub.name} initialCode={sub.code} onCancel={() => setEditing(null)}
                            move={
                              <Select value={moveTo} onValueChange={(v) => setMoveTo(v ?? "")}>
                                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {allCats.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>→ {c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            }
                            onSave={(name, code) =>
                              run(() => saveCategoryAction({ id: sub.id, name, code, parentId: Number(moveTo) || cat.id }), "Saqlandi.")} />
                        ) : (
                          <>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span className="text-xs">{sub.name}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{sub.code ?? "—"}</span>
                            {sub.salesCount > 0 && <span className="text-[10px] text-muted-foreground">· {sub.salesCount} sotuv</span>}
                            <div className="ml-auto flex items-center gap-1">
                              <IconBtn title="Tahrirlash" onClick={() => startEdit(`s:${sub.id}`, cat.id)}><Pencil className="h-3 w-3" /></IconBtn>
                              <IconBtn title="O'chirish" danger disabled={isPending}
                                onClick={() => { if (confirm(`"${sub.name}" subkategoriyasini o'chirasizmi?`)) run(() => deleteCategoryAction(sub.id), "O'chirildi."); }}>
                                <Trash2 className="h-3 w-3" />
                              </IconBtn>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
