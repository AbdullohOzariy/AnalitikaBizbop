"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Image as ImageIcon, UserPlus, Loader2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatUZS } from "@/lib/format";
import { deleteSverkaAction, addSverkaXodimAction, deleteSverkaXodimAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SverkaRow = {
  id: number;
  sana: string;
  firmaNomi: string;
  supplierId: number | null;
  sklad: string;
  qabulQildi: string;
  dagavor: string;
  summa: number;
  rasmFileId: string;
  kiritdi: string;
  createdAt: string;
};

export function SverkaJadval({ rows, canDelete }: { rows: SverkaRow[]; canDelete: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const remove = (r: SverkaRow) => {
    if (!confirm(`#${r.id} (${r.firmaNomi}, ${formatUZS(r.summa)}) o'chirilsinmi?`)) return;
    start(async () => {
      const res = await deleteSverkaAction(r.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-[60px]">№</TableHead>
          <TableHead className="w-[100px]">Sana</TableHead>
          <TableHead>Firma</TableHead>
          <TableHead className="w-[130px]">Sklad</TableHead>
          <TableHead className="w-[150px]">Qabul qildi</TableHead>
          <TableHead className="w-[130px]">Dagavor</TableHead>
          <TableHead className="text-right w-[130px]">Summa</TableHead>
          <TableHead className="w-[90px] text-center">Nakladnoy</TableHead>
          <TableHead className="w-[130px]">Kiritdi</TableHead>
          {canDelete && <TableHead className="w-[50px]" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} className="text-sm">
            <TableCell className="font-mono text-xs text-muted-foreground">#{r.id}</TableCell>
            <TableCell className="text-xs whitespace-nowrap">{r.sana}</TableCell>
            <TableCell className="max-w-[220px] truncate font-medium" title={r.firmaNomi}>{r.firmaNomi}</TableCell>
            <TableCell className="max-w-[130px] truncate text-xs text-muted-foreground" title={r.sklad}>{r.sklad}</TableCell>
            <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground" title={r.qabulQildi}>{r.qabulQildi}</TableCell>
            <TableCell className="max-w-[130px] truncate text-xs text-muted-foreground" title={r.dagavor}>{r.dagavor}</TableCell>
            <TableCell className="text-right tabular-nums text-xs font-semibold">{formatUZS(r.summa)}</TableCell>
            <TableCell className="text-center">
              <a href={`/api/rasm-preview/${encodeURIComponent(r.rasmFileId)}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Nakladnoy rasmini ochish" aria-label="Nakladnoy rasmi">
                <ImageIcon className="h-4 w-4" />
              </a>
            </TableCell>
            <TableCell className="max-w-[130px] truncate text-xs text-muted-foreground" title={`${r.kiritdi} · ${r.createdAt}`}>
              {r.kiritdi}
            </TableCell>
            {canDelete && (
              <TableCell>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                  onClick={() => remove(r)} aria-label="O'chirish">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}


// ─── Xodimlar (sverka roli) — Telegram ID bo'yicha oldindan beriladi ──────────

export type XodimRow = { id: number; tgUserId: string; ism: string | null; createdAt: string };

export function SverkaXodimlar({ xodimlar }: { xodimlar: XodimRow[] }) {
  const router = useRouter();
  const [tgId, setTgId] = useState("");
  const [ism, setIsm] = useState("");
  const [isPending, start] = useTransition();

  const add = () => {
    const idNum = Number(tgId.trim());
    if (!Number.isInteger(idNum) || idNum <= 0) { toast.error("Telegram ID — musbat son (bot /start'da ko'rinadi)."); return; }
    start(async () => {
      const res = await addSverkaXodimAction({ tgUserId: idNum, ism: ism.trim() || undefined });
      if (res.ok) { toast.success("Sverka roli berildi."); setTgId(""); setIsm(""); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const remove = (x: XodimRow) => {
    if (!confirm(`${x.ism || x.tgUserId} dan sverka roli olinsinmi?`)) return;
    start(async () => {
      const res = await deleteSverkaXodimAction(x.id);
      if (res.ok) { toast.success("Olib tashlandi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Xodimlar (sverka roli)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Xodim botga /start yozganda ID raqami ko'rinadi — shu ID'ga rol berilsa, botda
          "📑 Sverka kiritish" oynasi ochiladi. (Spisaniya ro'yxatiga ta'sir qilmaydi.)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={tgId} onChange={(e) => setTgId(e.target.value)} placeholder="Telegram ID"
            inputMode="numeric" className="h-9 w-40" />
          <Input value={ism} onChange={(e) => setIsm(e.target.value)} placeholder="Ism (ixtiyoriy)"
            className="h-9 w-48" />
          <Button onClick={add} disabled={isPending} className="h-9 gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Rol berish
          </Button>
        </div>
        {xodimlar.length === 0 ? (
          <p className="py-2 text-center text-xs italic text-muted-foreground">Hozircha hech kimga sverka roli berilmagan.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {xodimlar.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{x.tgUserId}</span>
                <span className="min-w-0 flex-1 truncate">{x.ism ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">{x.createdAt}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                  onClick={() => remove(x)} aria-label="Olib tashlash">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
