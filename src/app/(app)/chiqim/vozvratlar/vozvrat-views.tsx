"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { VozvratBoard } from "./vozvrat-board";
import { VozvratList } from "./vozvrat-list";
import type { VozvratCardData } from "./vozvrat-card";

type View = "kanban" | "list";

export function VozvratViews({
  vozvratlar,
  canEdit,
  filials,
}: {
  vozvratlar: VozvratCardData[];
  canEdit: boolean;
  filials: string[];
}) {
  const [view, setView] = useState<View>("kanban");

  const TABS: { id: View; label: string; icon: typeof List }[] = [
    { id: "kanban", label: "Kanban", icon: LayoutGrid },
    { id: "list", label: "Ro'yxat", icon: List },
  ];

  return (
    <div className="space-y-3">
      {/* Ko'rinish almashtirgich */}
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={view === id}
              title={label}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                view === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <VozvratBoard vozvratlar={vozvratlar} canEdit={canEdit} />
      ) : (
        <VozvratList vozvratlar={vozvratlar} canEdit={canEdit} filials={filials} />
      )}
    </div>
  );
}
