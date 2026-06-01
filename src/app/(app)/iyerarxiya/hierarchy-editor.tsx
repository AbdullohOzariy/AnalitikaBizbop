"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  saveGroupAction,
  deleteGroupAction,
  saveCategoryAction,
  deleteCategoryAction,
} from "./actions";

export type EditorSub = { id: number; name: string; code: number | null; salesCount: number };
export type EditorCat = {
  id: number;
  name: string;
  code: number | null;
  salesCount: number;
  children: EditorSub[];
};
export type EditorGroup = {
  id: number;
  name: string;
  code: number | null;
  categories: EditorCat[];
};

const GROUP_COLORS: Record<string, string> = {
  FRESH: "bg-emerald-500",
  FOOD: "bg-amber-500",
  "NON-FOOD": "bg-blue-500",
};

function inputCode(v: string): string {
  return v.replace(/[^\d]/g, "");
}

/** Nom + kod inline tahrir qatori. */
function EditRow({
  initialName,
  initialCode,
  onSave,
  onCancel,
  extra,
}: {
  initialName: string;
  initialCode: number | null;
  onSave: (name: string, code: string) => void;
  onCancel: () => void;
  extra?: React.ReactNode;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode != null ? String(initialCode) : "");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave(name, code)}
        className="h-7 w-48 text-xs"
        placeholder="Nom"
      />
      <Input
        value={code}
        onChange={(e) => setCode(inputCode(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onSave(name, code)}
        className="h-7 w-24 text-xs font-mono"
        placeholder="1C KOD"
      />
      {extra}
      <Button size="icon" className="h-7 w-7" onClick={() => onSave(name, code)}>
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function HierarchyEditor({ groups }: { groups: EditorGroup[] }) {
  const [isPending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // "g:1" | "c:5" | "s:9"
  const [adding, setAdding] = useState<string | null>(null); // "root" | "g:1" | "c:5"

  const allGroups = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name })), [groups]);
  const allCats = useMemo(
    () => groups.flatMap((g) => g.categories.map((c) => ({ id: c.id, name: c.name }))),
    [groups]
  );

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        setEditing(null);
        setAdding(null);
      } else {
        toast.error(res.error ?? "Xato.");
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {"Tahrir rejimi — nom va 1C KOD'ni o'zgartiring, ko'chiring, qo'shing yoki o'chiring."}
        </p>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding("root")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Guruh
        </Button>
      </div>

      {adding === "root" && (
        <div className="rounded-lg border border-dashed p-2">
          <EditRow
            initialName=""
            initialCode={null}
            onCancel={() => setAdding(null)}
            onSave={(name, code) => run(() => saveGroupAction({ name, code }), "Guruh qo'shildi.")}
          />
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="rounded-xl border border-border bg-card">
          {/* ── GURUH ── */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
            <span className={`h-2 w-2 rounded-full ${GROUP_COLORS[group.name] ?? "bg-muted-foreground"}`} />
            {editing === `g:${group.id}` ? (
              <EditRow
                initialName={group.name}
                initialCode={group.code}
                onCancel={() => setEditing(null)}
                onSave={(name, code) =>
                  run(() => saveGroupAction({ id: group.id, name, code }), "Saqlandi.")
                }
              />
            ) : (
              <>
                <span className="font-semibold text-sm">{group.name}</span>
                <code className="text-[11px] text-muted-foreground">{group.code ?? "—"}</code>
                <span className="text-xs text-muted-foreground">· {group.categories.length} kat</span>
                <div className="ml-auto flex items-center gap-1">
                  <IconBtn title="Tahrirlash" onClick={() => setEditing(`g:${group.id}`)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title="Kategoriya qo'shish" onClick={() => setAdding(`g:${group.id}`)}>
                    <Plus className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    title="O'chirish"
                    danger
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`"${group.name}" guruhini o'chirasizmi?`))
                        run(() => deleteGroupAction(group.id), "O'chirildi.");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </>
            )}
          </div>

          <div className="divide-y divide-border/40">
            {adding === `g:${group.id}` && (
              <div className="px-3 py-2 bg-muted/30">
                <EditRow
                  initialName=""
                  initialCode={null}
                  onCancel={() => setAdding(null)}
                  onSave={(name, code) =>
                    run(
                      () => saveCategoryAction({ name, code, groupId: group.id }),
                      "Kategoriya qo'shildi."
                    )
                  }
                />
              </div>
            )}

            {group.categories.map((cat) => (
              <div key={cat.id} className="px-3 py-2">
                {/* ── KATEGORIYA ── */}
                <div className="flex items-center gap-2">
                  {editing === `c:${cat.id}` ? (
                    <EditRow
                      initialName={cat.name}
                      initialCode={cat.code}
                      onCancel={() => setEditing(null)}
                      extra={
                        <select
                          defaultValue={group.id}
                          className="h-7 rounded-md border bg-background px-1.5 text-xs"
                          id={`move-c-${cat.id}`}
                        >
                          {allGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              → {g.name}
                            </option>
                          ))}
                        </select>
                      }
                      onSave={(name, code) => {
                        const sel = document.getElementById(`move-c-${cat.id}`) as HTMLSelectElement | null;
                        const groupId = sel ? Number(sel.value) : group.id;
                        run(
                          () => saveCategoryAction({ id: cat.id, name, code, groupId }),
                          "Saqlandi."
                        );
                      }}
                    />
                  ) : (
                    <>
                      <span className="text-sm font-medium ml-2">{cat.name}</span>
                      <code className="text-[11px] text-muted-foreground">{cat.code ?? "—"}</code>
                      <span className="text-xs text-muted-foreground">
                        · {cat.children.length} sub
                        {cat.salesCount > 0 && ` · ${cat.salesCount} sotuv`}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <IconBtn title="Tahrirlash" onClick={() => setEditing(`c:${cat.id}`)}>
                          <Pencil className="h-3 w-3" />
                        </IconBtn>
                        <IconBtn title="Subkategoriya qo'shish" onClick={() => setAdding(`c:${cat.id}`)}>
                          <Plus className="h-3 w-3" />
                        </IconBtn>
                        <IconBtn
                          title="O'chirish"
                          danger
                          disabled={isPending}
                          onClick={() => {
                            if (confirm(`"${cat.name}" kategoriyasini o'chirasizmi?`))
                              run(() => deleteCategoryAction(cat.id), "O'chirildi.");
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </IconBtn>
                      </div>
                    </>
                  )}
                </div>

                {/* subkategoriya qo'shish formasi */}
                {adding === `c:${cat.id}` && (
                  <div className="mt-1.5 ml-6 pl-2 border-l">
                    <EditRow
                      initialName=""
                      initialCode={null}
                      onCancel={() => setAdding(null)}
                      onSave={(name, code) =>
                        run(
                          () => saveCategoryAction({ name, code, parentId: cat.id }),
                          "Subkategoriya qo'shildi."
                        )
                      }
                    />
                  </div>
                )}

                {/* ── SUBKATEGORIYALAR ── */}
                {cat.children.length > 0 && (
                  <div className="mt-1.5 ml-6 pl-2 border-l space-y-1">
                    {cat.children.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        {editing === `s:${sub.id}` ? (
                          <EditRow
                            initialName={sub.name}
                            initialCode={sub.code}
                            onCancel={() => setEditing(null)}
                            extra={
                              <select
                                defaultValue={cat.id}
                                className="h-7 rounded-md border bg-background px-1.5 text-xs max-w-40"
                                id={`move-s-${sub.id}`}
                              >
                                {allCats.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    → {c.name}
                                  </option>
                                ))}
                              </select>
                            }
                            onSave={(name, code) => {
                              const sel = document.getElementById(`move-s-${sub.id}`) as HTMLSelectElement | null;
                              const parentId = sel ? Number(sel.value) : cat.id;
                              run(
                                () => saveCategoryAction({ id: sub.id, name, code, parentId }),
                                "Saqlandi."
                              );
                            }}
                          />
                        ) : (
                          <>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span className="text-xs">{sub.name}</span>
                            <code className="text-[10px] text-muted-foreground">{sub.code ?? "—"}</code>
                            {sub.salesCount > 0 && (
                              <span className="text-[10px] text-muted-foreground">· {sub.salesCount} sotuv</span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <IconBtn title="Tahrirlash" onClick={() => setEditing(`s:${sub.id}`)}>
                                <Pencil className="h-3 w-3" />
                              </IconBtn>
                              <IconBtn
                                title="O'chirish"
                                danger
                                disabled={isPending}
                                onClick={() => {
                                  if (confirm(`"${sub.name}" subkategoriyasini o'chirasizmi?`))
                                    run(() => deleteCategoryAction(sub.id), "O'chirildi.");
                                }}
                              >
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

function IconBtn({
  children,
  onClick,
  title,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-6 w-6 ${danger ? "text-destructive hover:text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </Button>
  );
}
