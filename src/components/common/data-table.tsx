"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Saralanadigan va ustun bo'yicha filtrlanadigan jadval.
 *
 * Ustun sarlavhasi BOSILADI — saralash (o'sish → kamayish → tabiiy tartib).
 * `filtrlanadi` belgilangan ustunda sarlavha yonida filtr tugmasi chiqadi: ustundagi
 * mavjud qiymatlar ro'yxatidan belgilab tanlanadi (bir nechta qiymat = OR, turli
 * ustunlar = AND).
 *
 * Hammasi KLIENT tomonda: ma'lumot sahifa bilan birga kelgan (bir necha yuz qator),
 * shuning uchun har filtr uchun serverga borish keraksiz sekinlik bo'lardi.
 */

export interface Ustun<T> {
  key: string;
  nom: string;
  /** Saralash va filtr uchun XOM qiymat (ko'rinish emas). */
  qiymat: (r: T) => string | number | null | undefined;
  /** Katakcha ko'rinishi. Berilmasa `qiymat` chiqariladi. */
  render?: (r: T) => React.ReactNode;
  /** Ustunda filtr menyusi bo'lsinmi (kategorik ustunlar uchun). */
  filtrlanadi?: boolean;
  /** Filtr menyusidagi yorliq (masalan "YES" → "HA"). */
  yorliq?: (v: string) => string;
  ong?: boolean;
  className?: string;
  /** Saralash o'chirilsin (masalan amallar ustuni). */
  saralanmaydi?: boolean;
}

type Yon = "asc" | "desc" | null;

export function DataTable<T>({
  rows,
  ustunlar,
  kalit,
  expand,
  onOpen,
  bosh,
  boshIcon: BoshIcon,
}: {
  rows: T[];
  ustunlar: Ustun<T>[];
  kalit: (r: T) => string | number;
  /** Berilsa — qator bosilganda ochiladigan tafsilot. */
  expand?: (r: T) => React.ReactNode;
  /**
   * Qator OCHILGANDA bir marta chaqiriladi (hodisa ishlovchisi).
   * Tafsilotni shu yerda yuklang — `expand` render paytida ishlaydi va u yerda
   * setState chaqirish React qoidasini buzadi.
   */
  onOpen?: (r: T) => void;
  bosh?: string;
  boshIcon?: React.ComponentType<{ className?: string }>;
}) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [yon, setYon] = React.useState<Yon>(null);
  const [filtrlar, setFiltrlar] = React.useState<Record<string, Set<string>>>({});
  const [ochiqMenu, setOchiqMenu] = React.useState<string | null>(null);
  const [ochiqQator, setOchiqQator] = React.useState<string | null>(null);

  const norm = (v: unknown) => (v == null || v === "" ? "—" : String(v));

  function sarala(u: Ustun<T>) {
    if (u.saralanmaydi) return;
    if (sortKey !== u.key) {
      setSortKey(u.key);
      setYon("asc");
    } else if (yon === "asc") setYon("desc");
    else if (yon === "desc") {
      setSortKey(null);
      setYon(null);
    } else setYon("asc");
  }

  const korinadigan = React.useMemo(() => {
    let out = rows;

    for (const [key, tanlangan] of Object.entries(filtrlar)) {
      if (!tanlangan?.size) continue;
      const u = ustunlar.find((x) => x.key === key);
      if (!u) continue;
      out = out.filter((r) => tanlangan.has(norm(u.qiymat(r))));
    }

    if (sortKey && yon) {
      const u = ustunlar.find((x) => x.key === sortKey);
      if (u) {
        // Tartib BARQAROR bo'lishi uchun nusxa olib saralaymiz
        out = [...out].sort((a, b) => {
          const x = u.qiymat(a);
          const y = u.qiymat(b);
          if (x == null && y == null) return 0;
          if (x == null) return 1; // bo'sh qiymat har doim pastda
          if (y == null) return -1;
          const n =
            typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x).localeCompare(String(y), "uz");
          return yon === "asc" ? n : -n;
        });
      }
    }
    return out;
  }, [rows, ustunlar, filtrlar, sortKey, yon]);

  const faolFiltr = Object.values(filtrlar).some((s) => s?.size);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        {BoshIcon && <BoshIcon className="mb-3 h-8 w-8 text-muted-foreground" />}
        <p className="text-sm font-semibold">{bosh ?? "Ma'lumot yo'q"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {faolFiltr && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {korinadigan.length} / {rows.length}
          </span>
          {Object.entries(filtrlar).map(([key, set]) =>
            set?.size ? (
              <button
                key={key}
                onClick={() => setFiltrlar((f) => ({ ...f, [key]: new Set() }))}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2 py-0.5 hover:bg-muted/70"
              >
                {ustunlar.find((u) => u.key === key)?.nom}: {set.size} ta
                <X className="h-3 w-3" />
              </button>
            ) : null
          )}
          <button
            onClick={() => setFiltrlar({})}
            className="text-muted-foreground underline hover:text-foreground"
          >
            hammasini tozalash
          </button>
        </div>
      )}

      <div className="shadow-card rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-[11px] uppercase text-muted-foreground">
              <tr>
                {expand && <th className="w-8 px-2 py-2" />}
                {ustunlar.map((u) => {
                  const faol = sortKey === u.key;
                  const qiymatlar = u.filtrlanadi
                    ? [...new Set(rows.map((r) => norm(u.qiymat(r))))].sort((a, b) =>
                        a.localeCompare(b, "uz")
                      )
                    : [];
                  const tanlangan = filtrlar[u.key] ?? new Set<string>();

                  return (
                    <th
                      key={u.key}
                      className={cn("relative px-3 py-2 font-semibold", u.ong ? "text-right" : "text-left")}
                    >
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => sarala(u)}
                          disabled={u.saralanmaydi}
                          className={cn(
                            "inline-flex items-center gap-1 uppercase transition",
                            u.saralanmaydi ? "cursor-default" : "hover:text-foreground",
                            faol && "text-foreground"
                          )}
                          title={u.saralanmaydi ? undefined : "Saralash"}
                        >
                          {u.nom}
                          {!u.saralanmaydi &&
                            (faol && yon === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : faol && yon === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-30" />
                            ))}
                        </button>

                        {u.filtrlanadi && (
                          <button
                            onClick={() => setOchiqMenu(ochiqMenu === u.key ? null : u.key)}
                            className={cn(
                              "rounded p-0.5 transition hover:bg-muted",
                              tanlangan.size ? "text-primary" : "opacity-40 hover:opacity-100"
                            )}
                            title="Filtr"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                        )}
                      </span>

                      {ochiqMenu === u.key && (
                        <>
                          {/* Tashqariga bosilganda yopiladi */}
                          <div className="fixed inset-0 z-40" onClick={() => setOchiqMenu(null)} />
                          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-border bg-card p-1.5 text-xs normal-case shadow-xl">
                            <div className="flex items-center justify-between px-1.5 pb-1.5">
                              <button
                                onClick={() =>
                                  setFiltrlar((f) => ({ ...f, [u.key]: new Set(qiymatlar) }))
                                }
                                className="text-primary hover:underline"
                              >
                                hammasi
                              </button>
                              <button
                                onClick={() => setFiltrlar((f) => ({ ...f, [u.key]: new Set() }))}
                                className="text-muted-foreground hover:underline"
                              >
                                tozalash
                              </button>
                            </div>
                            {qiymatlar.map((v) => (
                              <label
                                key={v}
                                className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted"
                              >
                                <input
                                  type="checkbox"
                                  checked={tanlangan.has(v)}
                                  onChange={(e) =>
                                    setFiltrlar((f) => {
                                      const s = new Set(f[u.key] ?? []);
                                      if (e.target.checked) s.add(v);
                                      else s.delete(v);
                                      return { ...f, [u.key]: s };
                                    })
                                  }
                                  className="h-3.5 w-3.5"
                                />
                                <span className="truncate">{u.yorliq ? u.yorliq(v) : v}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {korinadigan.map((r) => {
                const k = String(kalit(r));
                const ochiq = ochiqQator === k;
                return (
                  <React.Fragment key={k}>
                    <tr
                      className={cn(
                        "border-b border-border/40 last:border-0",
                        expand ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"
                      )}
                      onClick={
                        expand
                          ? () => {
                              const yangi = ochiq ? null : k;
                              setOchiqQator(yangi);
                              if (yangi != null) onOpen?.(r);
                            }
                          : undefined
                      }
                    >
                      {expand && (
                        <td className="px-2 py-2">
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition",
                              ochiq && "rotate-90"
                            )}
                          />
                        </td>
                      )}
                      {ustunlar.map((u) => (
                        <td
                          key={u.key}
                          className={cn("px-3 py-2", u.ong && "text-right", u.className)}
                        >
                          {u.render ? u.render(r) : norm(u.qiymat(r))}
                        </td>
                      ))}
                    </tr>
                    {expand && ochiq && (
                      <tr className="border-b border-border/40 bg-muted/20">
                        <td colSpan={ustunlar.length + 1} className="px-4 py-3">
                          {expand(r)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {korinadigan.length === 0 && (
                <tr>
                  <td
                    colSpan={ustunlar.length + (expand ? 1 : 0)}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Filtrga mos qator yo&apos;q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
