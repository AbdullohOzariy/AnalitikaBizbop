"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { submitAnketaAction } from "./actions";

export type AnketaFieldData = { id: number; label: string; type: string; required: boolean };
export type AnketaSectionData = { id: number; title: string; fields: AnketaFieldData[] };

export function AnketaForm({ sections }: { sections: AnketaSectionData[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const [sent, setSent] = useState(false);
  const [isPending, start] = useTransition();
  const [serverError, setServerError] = useState("");

  const set = (id: number, v: string) => {
    setAnswers((p) => ({ ...p, [String(id)]: v }));
    setErrors((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const submit = () => {
    // Klient validatsiyasi: majburiy maydonlar
    const missing = new Set<number>();
    for (const s of sections) {
      for (const f of s.fields) {
        if (f.required && !(answers[String(f.id)] ?? "").trim()) missing.add(f.id);
      }
    }
    if (missing.size > 0) {
      setErrors(missing);
      setServerError("Yulduzcha (*) bilan belgilangan maydonlarni to'ldiring.");
      const first = document.querySelector("[data-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setServerError("");
    start(async () => {
      const res = await submitAnketaAction({ answers });
      if (res.ok) setSent(true);
      else setServerError(res.error);
    });
  };

  if (sent) {
    return (
      <Card className="border-emerald-500/40">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-bold">Anketa qabul qilindi!</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Ma&apos;lumotlaringiz uchun rahmat. Jamoamiz anketangizni ko&apos;rib chiqib,
            ko&apos;rsatilgan telefon raqam orqali siz bilan bog&apos;lanadi.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <Card key={s.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.fields.map((f) => {
              const val = answers[String(f.id)] ?? "";
              const hasError = errors.has(f.id);
              return (
                <div key={f.id} className="space-y-1.5" data-error={hasError || undefined}>
                  {f.type !== "consent" && (
                    <Label className={cn("text-sm leading-snug", hasError && "text-destructive")}>
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </Label>
                  )}

                  {f.type === "textarea" && (
                    <textarea
                      value={val}
                      onChange={(e) => set(f.id, e.target.value)}
                      rows={3}
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        hasError && "border-destructive"
                      )}
                    />
                  )}

                  {(f.type === "text" || f.type === "number") && (
                    <Input
                      type={f.type === "number" ? "number" : "text"}
                      inputMode={f.type === "number" ? "numeric" : undefined}
                      value={val}
                      onChange={(e) => set(f.id, e.target.value)}
                      className={cn("h-10", hasError && "border-destructive")}
                    />
                  )}

                  {f.type === "yesno" && (
                    <div className="flex gap-2">
                      {["Ha", "Yo'q"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => set(f.id, opt)}
                          className={cn(
                            "h-9 rounded-lg border px-5 text-sm font-medium transition-colors",
                            val === opt
                              ? opt === "Ha"
                                ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "border-border bg-muted font-semibold"
                              : "border-border bg-background text-muted-foreground hover:border-emerald-500/40",
                            hasError && "border-destructive"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {f.type === "consent" && (
                    <label className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm leading-snug",
                      val === "Ha" ? "border-emerald-500/50 bg-emerald-500/10" : "border-border",
                      hasError && "border-destructive"
                    )}>
                      <input
                        type="checkbox"
                        checked={val === "Ha"}
                        onChange={(e) => set(f.id, e.target.checked ? "Ha" : "")}
                        className="mt-0.5 h-4 w-4 accent-emerald-600"
                      />
                      <span>
                        {f.label}
                        {f.required && <span className="text-destructive"> *</span>}
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {serverError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button onClick={submit} disabled={isPending} className="h-11 w-full gap-2 bg-emerald-600 text-base hover:bg-emerald-700">
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        Anketani yuborish
      </Button>
    </div>
  );
}
