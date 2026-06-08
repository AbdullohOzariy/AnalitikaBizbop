"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUZS, formatNumber } from "@/lib/format";
import type { BranchReportRow } from "@/lib/analytics";

function pct(val: number | null) {
  if (val == null) return "—";
  return `${val.toFixed(1)}%`;
}

function marjaColor(m: number) {
  if (m >= 30) return "text-[oklch(0.55_0.15_134)] font-medium";
  if (m >= 15) return "text-amber-600";
  return "text-red-500";
}

export function ReportTable({
  rows,
  hasCostAny,
}: {
  rows: BranchReportRow[];
  hasCostAny: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Jami — sales va cost kategoriyalardan jamlanadi (ko'rinadigan kategoriyalar bilan kelishilgan)
  const total = rows.reduce(
    (a, r) => {
      const catSales = r.categories.reduce((s, c) => s + c.sales, 0);
      const catCost  = r.categories.reduce((s, c) => s + c.cost, 0);
      return {
        sales:  a.sales  + catSales,
        cost:   a.cost   + catCost,
        visits: a.visits + r.visits,
      };
    },
    { sales: 0, cost: 0, visits: 0 }
  );

  const totalMarja = hasCostAny && total.sales > 0
    ? ((total.sales - total.cost) / total.sales) * 100
    : null;

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4 sticky left-0 bg-muted/40 z-10 min-w-[160px]">
              Filial / Kategoriya
            </TableHead>
            <TableHead className="text-right">Sotuv</TableHead>
            {hasCostAny && (
              <>
                <TableHead className="text-right">Tannarx</TableHead>
                <TableHead className="text-right">Marja %</TableHead>
              </>
            )}
            <TableHead className="text-right pr-5">Tashriflar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const open = expanded.has(r.branchId);
            return (
              <>
                {/* Branch qatori */}
                <TableRow
                  key={`b-${r.branchId}`}
                  className="cursor-pointer select-none hover:bg-primary/5 transition-colors"
                  onClick={() => toggle(r.branchId)}
                >
                  <TableCell className="pl-4 sticky left-0 bg-card z-10">
                    <div className="flex items-center gap-2 font-semibold">
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150 ${
                          open ? "rotate-90" : ""
                        }`}
                      />
                      {r.branchName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.sales > 0 ? formatUZS(r.sales) : "—"}
                  </TableCell>
                  {hasCostAny && (
                    <>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.hasCost ? formatUZS(r.cost) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.marja != null ? (
                          <span className={marjaColor(r.marja)}>{pct(r.marja)}</span>
                        ) : "—"}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums pr-5">
                    {r.visits > 0 ? formatNumber(r.visits) : "—"}
                  </TableCell>
                </TableRow>

                {/* Kategoriya qatorlari */}
                <AnimatePresence initial={false}>
                  {open &&
                    r.categories.map((c) => (
                      <motion.tr
                        key={`c-${r.branchId}-${c.categoryId}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="bg-muted/20 hover:bg-muted/30"
                      >
                        <TableCell className="pl-10 sticky left-0 bg-muted/40 z-10">
                          <span className="text-sm text-muted-foreground">{c.categoryName}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {c.sales > 0 ? formatUZS(c.sales) : "—"}
                        </TableCell>
                        {hasCostAny && (
                          <>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                              {c.hasCost ? formatUZS(c.cost) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {c.marja != null ? (
                                <span className={marjaColor(c.marja)}>{pct(c.marja)}</span>
                              ) : "—"}
                            </TableCell>
                          </>
                        )}
                        {/* Tashriflar — kategoriya darajasida yo'q */}
                        <TableCell className="pr-5" />
                      </motion.tr>
                    ))}
                </AnimatePresence>
              </>
            );
          })}

          {/* Jami */}
          <TableRow className="border-t-2 bg-muted/30 hover:bg-muted/30 font-semibold">
            <TableCell className="pl-4 sticky left-0 bg-muted/30 z-10">Jami</TableCell>
            <TableCell className="text-right tabular-nums">
              {total.sales > 0 ? formatUZS(total.sales) : "—"}
            </TableCell>
            {hasCostAny && (
              <>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {total.cost > 0 ? formatUZS(total.cost) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalMarja != null ? pct(totalMarja) : "—"}
                </TableCell>
              </>
            )}
            <TableCell className="text-right tabular-nums pr-5">
              {total.visits > 0 ? formatNumber(total.visits) : "—"}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
