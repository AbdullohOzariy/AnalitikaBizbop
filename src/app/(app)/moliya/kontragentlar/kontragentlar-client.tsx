"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Merge, Loader2, Pencil, Trash2, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  kontragentSaqlaAction,
  kontragentBirlashtirAction,
  kontragentOchirAction,
} from "./actions";

type Kind = "EMPLOYEE" | "SUPPLIER" | "ACCOUNTABLE" | "OTHER";

type Row = {
  id: number;
  name: string;
  kind: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  supplierId: number | null;
  supplierName: string | null;
  aliases: { id: number; alias: string }[];
  txnCount: number;
  berilgan: number;
  qaytgan: number;
};

const KIND_META: Record<string, { label: string; tone: string }> = {
  EMPLOYEE: { label: "Xodim", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  SUPPLIER: { label: "Ta'minotchi", tone: "bg-primary/10 text-primary" },
  ACCOUNTABLE: { label: "Hisobdor", tone: "bg-accent/10 text-accent" },
  OTHER: { label: "Boshqa", tone: "bg-muted text-muted-foreground" },
};

export function KontragentlarClient({
  rows,
  suppliers,
  canEdit,
}: {
  rows: Row[];
  suppliers: { id: number; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("");
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [merge, setMerge] = useState<Set<number>>(new Set());

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        done?.();
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!s) return true;
      return (
        r.name.toLowerCase().includes(s) ||
        r.aliases.some((a) => a.alias.toLowerCase().includes(s)) ||
        (r.supplierName ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, q, kind]);

  const toggleMerge = (id: number) => {
    const n = new Set(merge);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setMerge(n);
  };

  const selected = rows.filter((r) => merge.has(r.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom yoki alias bo'yicha qidirish…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 min-w-[150px] rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Barcha turlar</option>
            {Object.entries(KIND_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          {canEdit && (
            <Button size="sm" onClick={() => setEdit("new")} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Yangi
            </Button>
          )}
        </CardContent>
      </Card>

      {merge.size >= 2 && canEdit && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <Merge className="h-4 w-4 text-accent" />
            <span>
              <b>{merge.size} ta</b> tanlandi. Qaysi biri saqlansin? Qolganlarining yozuvlari
              unga ko&apos;chadi, nomlari alias bo&apos;lib qoladi.
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () =>
                        kontragentBirlashtirAction({
                          keepId: s.id,
                          dropIds: selected.filter((x) => x.id !== s.id).map((x) => x.id),
                        }),
                      "Birlashtirildi.",
                      () => setMerge(new Set())
                    )
                  }
                  className="h-7 px-2 text-xs"
                >
                  «{s.name}» qolsin
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setMerge(new Set())} className="h-7 px-2 text-xs">
                Bekor
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Topilmadi"
          description="Qidiruv yoki filtrga mos kontragent yo'q."
        />
      ) : (
        <Card>
          <CardContent className="space-y-1 py-3">
            {filtered.map((r) => {
              const ochiq = r.berilgan - r.qaytgan;
              const hisobdor = r.kind === "ACCOUNTABLE";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-border px-3 py-2",
                    !r.isActive && "opacity-50",
                    merge.has(r.id) && "border-accent bg-accent/5"
                  )}
                >
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={merge.has(r.id)}
                      onChange={() => toggleMerge(r.id)}
                      className="shrink-0"
                      aria-label="Birlashtirish uchun tanlash"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <Pill className={KIND_META[r.kind]?.tone}>{KIND_META[r.kind]?.label ?? r.kind}</Pill>
                      {r.supplierName && <Pill>ulangan: {r.supplierName}</Pill>}
                      {r.aliases.length > 0 && <Pill>{r.aliases.length} alias</Pill>}
                    </div>
                    {(r.aliases.length > 0 || r.note) && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {r.aliases.map((a) => a.alias).join(" · ")}
                        {r.note ? ` — ${r.note}` : ""}
                      </div>
                    )}
                  </div>

                  {hisobdor && ochiq !== 0 && (
                    <span
                      className={cn(
                        "hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums sm:flex",
                        ochiq > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                      )}
                      title="Berilgan − qaytarilgan (ochiq qoldiq)"
                    >
                      <HandCoins className="h-3 w-3" />
                      {formatUZS(ochiq)}
                    </span>
                  )}

                  <span className="shrink-0 text-[11px] text-muted-foreground">{r.txnCount} yozuv</span>

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEdit(r)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Tahrirlash"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => kontragentOchirAction(r.id), "O'chirildi.")}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="O'chirish"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {edit && (
        <EditDialog
          row={edit === "new" ? null : edit}
          suppliers={suppliers}
          isPending={isPending}
          onClose={() => setEdit(null)}
          onSubmit={(v, done) => run(() => kontragentSaqlaAction(v), "Saqlandi.", done)}
        />
      )}
    </div>
  );
}

function EditDialog({
  row,
  suppliers,
  isPending,
  onClose,
  onSubmit,
}: {
  row: Row | null;
  suppliers: { id: number; name: string }[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    v: {
      id?: number;
      name: string;
      kind: Kind;
      supplierId?: number | null;
      phone?: string | null;
      note?: string | null;
      isActive?: boolean;
    },
    done: () => void
  ) => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [kind, setKind] = useState<Kind>((row?.kind as Kind) ?? "OTHER");
  const [supplierId, setSupplierId] = useState(row?.supplierId ?? 0);
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const [isActive, setIsActive] = useState(row?.isActive ?? true);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? "Kontragentni tahrirlash" : "Yangi kontragent"}</DialogTitle>
          <DialogDescription>
            Tur to&apos;g&apos;ri tanlansin: <b>Hisobdor</b> deb belgilangan odamning ochiq
            qoldig&apos;i (berilgan − qaytarilgan) kuzatib boriladi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tur</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {Object.entries(KIND_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
            </div>
          </div>

          {kind === "SUPPLIER" && (
            <div>
              <Label className="text-xs">Bazadagi yetkazib beruvchi</Label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={0}>— ulanmagan —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ulansa — to&apos;lovlar ta&apos;minotchi profilida va strategik hamkorlikda ko&apos;rinadi
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs">Izoh</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
          </div>

          {row && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Faol (kiritish formasida ko&apos;rinadi)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button
            disabled={isPending || name.trim().length < 2}
            onClick={() =>
              onSubmit(
                {
                  ...(row ? { id: row.id } : {}),
                  name: name.trim(),
                  kind,
                  supplierId: kind === "SUPPLIER" ? supplierId || null : null,
                  phone: phone.trim() || null,
                  note: note.trim() || null,
                  ...(row ? { isActive } : {}),
                },
                onClose
              )
            }
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
