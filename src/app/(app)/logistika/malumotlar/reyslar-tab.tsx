"use client";

/**
 * Reyslar jurnali — FAQAT O'QISH.
 * Tahrir/fors-major amallari /logistika/hozir sahifasida; bu yer tarix ko'zgusi.
 * Har qator kengaytiriladi: ichida reysning plecholari (leg) ketma-ket ko'rinadi.
 */

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert, Clock, Route } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pill, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatDateTimeUZ, formatUZS } from "@/lib/format";

type TripStatus = "OPEN" | "DONE" | "DONE_LATE" | "FORCE_CLOSED" | "STALE" | "CANCELLED";
type LoadLevel = "EMPTY" | "QUARTER" | "HALF" | "FULL";
type ActorKind = "DRIVER" | "CONTROLLER" | "SYSTEM";

export type ReysLegRow = {
  seq: number;
  from: string;
  to: string;
  load: LoadLevel;
  departedAt: string;
  arrivedAt: string | null;
  lateReport: boolean;
};

export type ReysRow = {
  id: number;
  status: TripStatus;
  startedAt: string;
  endedAt: string | null;
  actorKind: ActorKind;
  actorName: string;
  payAmount: number | null;
  plateNumber: string;
  brand: string;
  driverName: string;
  legs: ReysLegRow[];
};

const ST: Record<TripStatus, { label: string; tone: "blue" | "green" | "amber" | "muted" | "red" }> = {
  OPEN: { label: "Yo'lda", tone: "blue" },
  DONE: { label: "Yakunlandi", tone: "green" },
  DONE_LATE: { label: "Kech yopildi", tone: "amber" },
  FORCE_CLOSED: { label: "Majburan yopildi", tone: "muted" },
  STALE: { label: "Javobsiz qoldi", tone: "red" },
  CANCELLED: { label: "Bekor", tone: "muted" },
};

const LOAD: Record<LoadLevel, string> = {
  EMPTY: "bo'sh",
  QUARTER: "¼",
  HALF: "½",
  FULL: "to'la",
};

/** formatDateTimeUZ → "DD.MM.YYYY HH:mm"; jurnal ichida faqat soat kerak. */
const soat = (iso: string) => formatDateTimeUZ(iso).split(" ")[1] ?? "—";

/** ms → "2k 3s" / "1s 15d" / "45d". Manfiy yoki yaroqsiz → null. */
/**
 * Davomiylik matni. null = hisoblab bo'lmadi (hali yakunlanmagan yoki sana buzuq).
 * Chaqiruvchi buni "davom etmoqda" deb ko'rsatmasligi uchun yopilgan reysda
 * `endedAt` borligini alohida tekshiradi — manfiy oraliq "—" bo'lib chiqadi.
 */
function davomiylik(fromIso: string, toIso: string | null): string | null {
  if (!toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const daq = Math.round(ms / 60000);
  const kun = Math.floor(daq / 1440);
  const s = Math.floor((daq % 1440) / 60);
  const d = daq % 60;
  if (kun > 0) return `${kun}k ${s}s`;
  if (s > 0) return `${s}s ${d}d`;
  return `${d}d`;
}

export function ReyslarTab({ rows }: { rows: ReysRow[] }) {
  // Ochiq qatorlar — id → true. Effekt yo'q: holat faqat bosishdan o'zgaradi.
  const [ochiq, setOchiq] = useState<Record<number, boolean>>({});

  const toggle = (id: number) =>
    setOchiq((p) => ({ ...p, [id]: !p[id] }));

  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <EmptyState
            icon={Route}
            title="Hali reys yo'q"
            description="Haydovchilar miniappda ish boshlagach shu yerda ko'rinadi."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[44px]" />
                <TableHead className="w-[70px]">Reys</TableHead>
                <TableHead>Haydovchi</TableHead>
                <TableHead>Avtomobil</TableHead>
                <TableHead className="w-[150px]">Boshlandi</TableHead>
                <TableHead className="w-[110px]">Davomiylik</TableHead>
                <TableHead className="w-[90px] text-center">Plecho</TableHead>
                <TableHead className="w-[120px] text-right">To&apos;lov</TableHead>
                <TableHead className="w-[160px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const open = !!ochiq[r.id];
                const st = ST[r.status];
                const dur = davomiylik(r.startedAt, r.endedAt);
                const kechPlecho = r.legs.some((l) => l.lateReport);

                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className={cn(
                        "cursor-pointer text-sm",
                        open && "bg-muted/30 hover:bg-muted/30"
                      )}
                      onClick={() => toggle(r.id)}
                    >
                      <TableCell className="align-middle">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggle(r.id); }}
                          aria-expanded={open}
                          aria-label={`Reys #${r.id} plecholari`}
                          title={open ? "Yopish" : "Plecholarni ko'rish"}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {open
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>

                      <TableCell className="font-semibold tabular-nums">#{r.id}</TableCell>

                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{r.driverName}</span>
                          {r.actorKind === "CONTROLLER" && (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                              <ShieldAlert className="h-3 w-3 shrink-0" />
                              nazoratchi kiritgan{r.actorName ? ` — ${r.actorName}` : ""}
                            </span>
                          )}
                          {r.actorKind === "SYSTEM" && (
                            <span className="mt-0.5 text-xs font-normal text-muted-foreground">
                              tizim yopgan
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="font-medium">{r.plateNumber}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{r.brand}</span>
                      </TableCell>

                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDateTimeUZ(r.startedAt)}
                      </TableCell>

                      <TableCell className="tabular-nums">
                        {dur ?? (
                          // endedAt bor, lekin oraliq hisoblanmadi (buzuq sana) —
                          // yopilgan reysni "davom etmoqda" deb ko'rsatmaymiz.
                          <span className="text-muted-foreground">
                            {r.endedAt ? "—" : "davom etmoqda"}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-center tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {r.legs.length}
                          {kechPlecho && (
                            <Clock
                              className="h-3 w-3 text-amber-600 dark:text-amber-400"
                              aria-label="Kech xabar berilgan plecho bor"
                            />
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {r.payAmount == null
                          ? <span className="text-muted-foreground">—</span>
                          : formatUZS(r.payAmount)}
                      </TableCell>

                      <TableCell>
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </TableCell>
                    </TableRow>

                    {open && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={9} className="bg-muted/20 p-0">
                          <div className="px-5 py-3">
                            {r.legs.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Bu reysda plecho qayd etilmagan.
                              </p>
                            ) : (
                              <ol className="space-y-1.5">
                                {r.legs.map((l) => {
                                  const kelgan = l.arrivedAt; // narrowing uchun lokal
                                  const legDur = davomiylik(l.departedAt, kelgan);
                                  return (
                                    <li
                                      key={l.seq}
                                      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                                    >
                                      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {l.seq}.
                                      </span>
                                      <span className="font-medium">
                                        {l.from} → {l.to}
                                      </span>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="tabular-nums text-muted-foreground">
                                        {soat(l.departedAt)}
                                        {kelgan == null ? (
                                          <span className="ml-1 font-medium text-blue-600 dark:text-blue-400">
                                            – yo&apos;lda
                                          </span>
                                        ) : (
                                          <>–{soat(kelgan)}{legDur ? ` (${legDur})` : ""}</>
                                        )}
                                      </span>
                                      <span className="text-muted-foreground">·</span>
                                      <span
                                        className={cn(
                                          "text-xs font-medium",
                                          l.load === "EMPTY"
                                            ? "text-destructive"
                                            : "text-muted-foreground"
                                        )}
                                      >
                                        {LOAD[l.load]}
                                      </span>
                                      {l.lateReport && (
                                        <Pill tone="amber" className="gap-1">
                                          <Clock className="h-3 w-3" />
                                          kech xabar
                                        </Pill>
                                      )}
                                    </li>
                                  );
                                })}
                              </ol>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
