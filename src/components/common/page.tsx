import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Umumiy dizayn bloklari (Fresh Market konsepti).
 * Barcha sahifalar shu komponentlardan foydalanib bir xil ko'rinishga keladi.
 */

// ── Sahifa sarlavhasi ─────────────────────────────────────────────
export function PageHeader({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode; // o'ng tomondagi amallar (tugmalar, filtrlar)
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="bg-brand-gradient shadow-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ── Statistika kartasi ────────────────────────────────────────────
const TONES = {
  default: "bg-muted text-muted-foreground",
  green: "bg-primary/10 text-primary",
  orange: "bg-accent/10 text-accent",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  red: "bg-destructive/10 text-destructive",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div className={cn("shadow-card lift rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", TONES[tone])}>
            <Icon className="h-[1.05rem] w-[1.05rem]" />
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[1.7rem] font-bold leading-none tabular-nums tracking-[-0.02em]">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ── Seksiya kartasi (umumiy konteyner) ────────────────────────────
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("shadow-card rounded-2xl border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

// ── Bo'sh holat ───────────────────────────────────────────────────
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ── Pill badge ────────────────────────────────────────────────────
const BADGE_TONES = {
  green: "bg-primary/10 text-primary border-primary/20",
  orange: "bg-accent/10 text-accent border-accent/20",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  red: "bg-destructive/10 text-destructive border-destructive/20",
  muted: "bg-muted text-muted-foreground border-border",
} as const;

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
