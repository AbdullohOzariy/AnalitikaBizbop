"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Trash2,
  Filter,
  ShieldOff,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { formatUZS, formatDateUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  yozuvQoshAction,
  kochirishQoshAction,
  yozuvOchirAction,
  kontragentQoshAction,
} from "./actions";

type Row = {
  id: number;
  businessDate: string;
  direction: string;
  amount: number;
  note: string | null;
  source: string;
  isLocked: boolean;
  isTransfer: boolean;
  accountName: string;
  articleName: string;
  isNeutral: boolean;
  section: string;
  counterpartyName: string | null;
  costCenterName: string | null;
};

type Article = {
  id: number;
  name: string;
  direction: string;
  isNeutral: boolean;
  isTransfer: boolean;
  isActive: boolean;
  groupName: string;
  section: string;
};

type Ref = { id: number; name: string; kind?: string };

const SECTION_LABEL: Record<string, string> = {
  OPERATING: "Operatsion",
  INVESTING: "Investitsion",
  FINANCING: "Moliyaviy",
  TECHNICAL: "Texnik",
};

export function KassaClient({
  rows,
  articles,
  accounts,
  counterparties,
  costCenters,
  allowedAccountIds,
  canEdit,
  filters,
}: {
  rows: Row[];
  articles: Article[];
  accounts: Ref[];
  counterparties: Ref[];
  costCenters: Ref[];
  allowedAccountIds: number[];
  canEdit: boolean;
  filters: { from: string; to: string; account: number | null; section: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, start] = useTransition();

  const [mode, setMode] = useState<"txn" | "transfer" | null>(null);
  const [ochir, setOchir] = useState<Row | null>(null);

  // Foydalanuvchi yozuv kirita oladigan hisoblar (bo'sh scope = cheklovsiz).
  const writableAccounts = useMemo(
    () => (allowedAccountIds.length === 0 ? accounts : accounts.filter((a) => allowedAccountIds.includes(a.id))),
    [accounts, allowedAccountIds]
  );

  const plainArticles = useMemo(
    () => articles.filter((a) => a.isActive && !a.isTransfer),
    [articles]
  );
  const transferArticles = useMemo(
    () => articles.filter((a) => a.isActive && a.isTransfer),
    [articles]
  );

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        done?.();
        router.refresh();
      } else {
        toast.error(res.error ?? "Xato.");
      }
    });

  const applyFilter = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set("from", patch.from ?? filters.from);
    params.set("to", patch.to ?? filters.to);
    const acc = patch.account ?? (filters.account ? String(filters.account) : "");
    const sec = patch.section ?? filters.section ?? "";
    if (acc) params.set("account", acc);
    if (sec) params.set("section", sec);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* ── Filtrlar ── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filtr
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Dan</Label>
            <Input
              type="date"
              defaultValue={filters.from}
              onChange={(e) => applyFilter({ from: e.target.value })}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Gacha</Label>
            <Input
              type="date"
              defaultValue={filters.to}
              onChange={(e) => applyFilter({ to: e.target.value })}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Hisob</Label>
            <select
              defaultValue={filters.account ? String(filters.account) : ""}
              onChange={(e) => applyFilter({ account: e.target.value })}
              className="h-8 w-[170px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Barchasi</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Bo&apos;lim</Label>
            <select
              defaultValue={filters.section ?? ""}
              onChange={(e) => applyFilter({ section: e.target.value })}
              className="h-8 w-[150px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Barchasi</option>
              {Object.entries(SECTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {canEdit && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => setMode("txn")} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Yozuv
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode("transfer")} className="gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Ko&apos;chirish
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Jurnal ── */}
      {rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Yozuv yo'q"
          description="Tanlangan davr va filtrlar bo'yicha kassa yozuvi topilmadi."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Sana</TableHead>
                    <TableHead>Hisob</TableHead>
                    <TableHead>Modda</TableHead>
                    <TableHead>Kontragent</TableHead>
                    <TableHead>Izoh</TableHead>
                    <TableHead className="text-right">Kirim</TableHead>
                    <TableHead className="text-right">Chiqim</TableHead>
                    {canEdit && <TableHead className="w-[50px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={cn(r.isNeutral && "bg-muted/40")}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateUZ(r.businessDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.accountName}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{r.articleName}</span>
                          {r.isNeutral && (
                            <ShieldOff className="h-3 w-3 shrink-0 text-violet-500" />
                          )}
                          {r.isTransfer && (
                            <ArrowLeftRight className="h-3 w-3 shrink-0 text-accent" />
                          )}
                        </div>
                        {r.costCenterName && (
                          <div className="text-[10px] text-muted-foreground">{r.costCenterName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.counterpartyName ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {r.note ?? ""}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-primary">
                        {r.direction === "IN" ? formatUZS(r.amount) : ""}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-destructive">
                        {r.direction === "OUT" ? formatUZS(r.amount) : ""}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          {r.isLocked || r.source === "IMPORT" ? (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOchir(r)}
                              className="text-muted-foreground transition-colors hover:text-destructive"
                              aria-label="O'chirish"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length === 200 && (
              <div className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
                Faqat oxirgi 200 ta yozuv ko&apos;rsatilmoqda — davrni toraytiring
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "txn" && (
        <YozuvDialog
          articles={plainArticles}
          accounts={writableAccounts}
          counterparties={counterparties}
          costCenters={costCenters}
          defaultDate={filters.to}
          isPending={isPending}
          onClose={() => setMode(null)}
          onSubmit={(v, done) => run(() => yozuvQoshAction(v), "Yozuv qo'shildi.", done)}
          onCreateCounterparty={(name, kind, cb) =>
            start(async () => {
              const res = await kontragentQoshAction({ name, kind });
              if (res.ok && res.id) {
                toast.success("Kontragent qo'shildi.");
                cb(res.id);
                router.refresh();
              } else {
                toast.error(res.ok ? "Xato." : res.error);
              }
            })
          }
        />
      )}

      {mode === "transfer" && (
        <KochirishDialog
          articles={transferArticles}
          accounts={accounts}
          writableAccounts={writableAccounts}
          defaultDate={filters.to}
          isPending={isPending}
          onClose={() => setMode(null)}
          onSubmit={(v, done) => run(() => kochirishQoshAction(v), "Ko'chirish yozildi.", done)}
        />
      )}

      <Dialog open={ochir !== null} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yozuvni o&apos;chirish</DialogTitle>
            <DialogDescription>
              {ochir?.isTransfer
                ? "Bu ko'chirishning bir tomoni — juftligi bilan birga o'chiriladi (qoldiq buzilmasligi uchun)."
                : "Yozuv butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi."}
            </DialogDescription>
          </DialogHeader>
          {ochir && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium">{ochir.articleName}</div>
              <div className="text-xs text-muted-foreground">
                {formatDateUZ(ochir.businessDate)} · {ochir.accountName} ·{" "}
                {ochir.direction === "IN" ? "kirim" : "chiqim"} {formatUZS(ochir.amount)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOchir(null)}>
              Bekor
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                ochir && run(() => yozuvOchirAction(ochir.id), "O'chirildi.", () => setOchir(null))
              }
            >
              {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              O&apos;chirish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Kirim / chiqim formasi ───────────────────────────────────────────────────

function YozuvDialog({
  articles,
  accounts,
  counterparties,
  costCenters,
  defaultDate,
  isPending,
  onClose,
  onSubmit,
  onCreateCounterparty,
}: {
  articles: Article[];
  accounts: Ref[];
  counterparties: Ref[];
  costCenters: Ref[];
  defaultDate: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    v: {
      businessDate: string;
      accountId: number;
      articleId: number;
      direction: "IN" | "OUT";
      amount: number;
      counterpartyId?: number | null;
      costCenterId?: number | null;
      note?: string;
    },
    done: () => void
  ) => void;
  onCreateCounterparty: (
    name: string,
    kind: "EMPLOYEE" | "SUPPLIER" | "ACCOUNTABLE" | "OTHER",
    cb: (id: number) => void
  ) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0);
  const [articleId, setArticleId] = useState(0);
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [counterpartyId, setCounterpartyId] = useState(0);
  const [costCenterId, setCostCenterId] = useState(0);
  const [note, setNote] = useState("");
  const [newCp, setNewCp] = useState("");

  const article = articles.find((a) => a.id === articleId);

  // Modda yo'nalishi qat'iy bo'lsa — tugmani unga moslaymiz (server ham tekshiradi).
  const lockedDirection =
    article?.direction === "IN_ONLY" ? "IN" : article?.direction === "OUT_ONLY" ? "OUT" : null;
  const effectiveDirection = lockedDirection ?? direction;

  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of articles) {
      const key = `${SECTION_LABEL[a.section] ?? a.section} · ${a.groupName}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(a);
    }
    return [...map];
  }, [articles]);

  const submit = () => {
    const amt = Number(amount.replace(/\s/g, ""));
    if (!accountId) return toast.error("Hisobni tanlang.");
    if (!articleId) return toast.error("Moddani tanlang.");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Summani to'g'ri kiriting.");
    onSubmit(
      {
        businessDate: date,
        accountId,
        articleId,
        direction: effectiveDirection,
        amount: amt,
        counterpartyId: counterpartyId || null,
        costCenterId: costCenterId || null,
        note: note.trim() || undefined,
      },
      onClose
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kirim / chiqim yozuvi</DialogTitle>
          <DialogDescription>
            Ko&apos;chirish (inkassa, perebros, obmen) bu yerdan kiritilmaydi — alohida forma bor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Sana</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Hisob</Label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={0}>— tanlang —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Modda</Label>
            <select
              value={articleId}
              onChange={(e) => setArticleId(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={0}>— tanlang —</option>
              {grouped.map(([groupName, arts]) => (
                <optgroup key={groupName} label={groupName}>
                  {arts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.isNeutral ? " (neytral)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {article?.isNeutral && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
                <ShieldOff className="h-3 w-3" />
                Neytral modda — daromad/xarajat hisobotiga kirmaydi
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Yo&apos;nalish</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={effectiveDirection === "IN" ? "default" : "outline"}
                disabled={lockedDirection === "OUT"}
                onClick={() => setDirection("IN")}
                className="h-9 flex-1 gap-1.5"
              >
                <ArrowDownLeft className="h-4 w-4" />
                Kirim
              </Button>
              <Button
                type="button"
                variant={effectiveDirection === "OUT" ? "default" : "outline"}
                disabled={lockedDirection === "IN"}
                onClick={() => setDirection("OUT")}
                className="h-9 flex-1 gap-1.5"
              >
                <ArrowUpRight className="h-4 w-4" />
                Chiqim
              </Button>
            </div>
            {lockedDirection && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Bu modda faqat {lockedDirection === "IN" ? "kirim" : "chiqim"} uchun
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Summa (so&apos;m)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="h-9 tabular-nums"
            />
          </div>

          <div>
            <Label className="text-xs">Kontragent</Label>
            <select
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={0}>— yo&apos;q —</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex gap-1.5">
              <Input
                value={newCp}
                onChange={(e) => setNewCp(e.target.value)}
                placeholder="Ro'yxatda yo'qmi — yangi nom"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || newCp.trim().length < 2}
                onClick={() =>
                  onCreateCounterparty(newCp.trim(), "OTHER", (id) => {
                    setCounterpartyId(id);
                    setNewCp("");
                  })
                }
                className="h-8 shrink-0 px-2 text-xs"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Xarajat markazi</Label>
            <select
              value={costCenterId}
              onChange={(e) => setCostCenterId(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={0}>— yo&apos;q —</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.kind === "PROJECT" ? " (loyiha)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pul qaysi hisobdan chiqqani ≠ xarajat kimga tegishli. Loyiha xarajati shu yerda belgilanadi.
            </p>
          </div>

          <div>
            <Label className="text-xs">Izoh</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button disabled={isPending} onClick={submit}>
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ko'chirish formasi ───────────────────────────────────────────────────────

function KochirishDialog({
  articles,
  accounts,
  writableAccounts,
  defaultDate,
  isPending,
  onClose,
  onSubmit,
}: {
  articles: Article[];
  accounts: Ref[];
  writableAccounts: Ref[];
  defaultDate: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    v: {
      businessDate: string;
      fromAccountId: number;
      toAccountId: number;
      articleId: number;
      amount: number;
      note?: string;
    },
    done: () => void
  ) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [fromId, setFromId] = useState(writableAccounts[0]?.id ?? 0);
  const [toId, setToId] = useState(0);
  const [articleId, setArticleId] = useState(articles[0]?.id ?? 0);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    const amt = Number(amount.replace(/\s/g, ""));
    if (!fromId || !toId) return toast.error("Ikkala hisobni ham tanlang.");
    if (fromId === toId) return toast.error("Hisoblar bir xil bo'lmasin.");
    if (!articleId) return toast.error("Moddani tanlang.");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Summani to'g'ri kiriting.");
    onSubmit(
      { businessDate: date, fromAccountId: fromId, toAccountId: toId, articleId, amount: amt, note: note.trim() || undefined },
      onClose
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hisoblararo ko&apos;chirish</DialogTitle>
          <DialogDescription>
            Inkassa, perebros, obmen. Ikki bog&apos;langan yozuv yaratiladi — bir tomonlama yozuv
            bo&apos;lishi mumkin emas, shuning uchun qoldiq buzilmaydi.
          </DialogDescription>
        </DialogHeader>

        {articles.length === 0 ? (
          <div className="rounded-lg bg-destructive/5 p-3 text-sm text-muted-foreground">
            Ko&apos;chirish moddasi topilmadi. Ma&apos;lumotnomada kamida bitta moddaga «Transfer»
            bayrog&apos;ini qo&apos;ying.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Sana</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Modda</Label>
                <select
                  value={articleId}
                  onChange={(e) => setArticleId(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Qaysi hisobdan</Label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value={0}>— tanlang —</option>
                  {writableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Qaysi hisobga</Label>
                <select
                  value={toId}
                  onChange={(e) => setToId(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value={0}>— tanlang —</option>
                  {accounts
                    .filter((a) => a.id !== fromId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.kind === "BANK" ? " (bank)" : a.kind === "CARD" ? " (plastik)" : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Summa (so&apos;m)</Label>
              <Input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-9 tabular-nums"
              />
            </div>

            <div>
              <Label className="text-xs">Izoh</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
            </div>

            <div className="flex items-center gap-1.5 rounded-lg bg-violet-500/5 p-2.5 text-[11px] text-muted-foreground">
              <Pill className="bg-violet-500/10 text-violet-600 dark:text-violet-400">neytral</Pill>
              Ko&apos;chirish daromad ham, xarajat ham emas — KPI&apos;ga kirmaydi
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button disabled={isPending || articles.length === 0} onClick={submit}>
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
