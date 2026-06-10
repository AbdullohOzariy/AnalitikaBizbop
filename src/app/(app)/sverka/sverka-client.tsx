"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Image as ImageIcon } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatUZS } from "@/lib/format";
import { deleteSverkaAction } from "./actions";

export type SverkaRow = {
  id: number;
  sana: string;
  firmaNomi: string;
  supplierId: number | null;
  sklad: string;
  kontragent: string;
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
          <TableHead className="w-[150px]">Kontragent</TableHead>
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
            <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground" title={r.kontragent}>{r.kontragent}</TableCell>
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
