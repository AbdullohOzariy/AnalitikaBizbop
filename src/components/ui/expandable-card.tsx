"use client";

import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ExpandableCard({
  title,
  children,
  className,
  headerClassName,
  contentClassName,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className={className}>
        <CardHeader
          className={cn(
            "flex flex-row items-center justify-between gap-2",
            headerClassName
          )}
        >
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground -mr-1"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className={contentClassName}>{children}</CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay />
          {/* DialogContent ishlatilmaydi — uning sm:max-w-sm cheklovi chetlab o'tiladi */}
          <div
            role="dialog"
            className="fixed inset-4 z-50 flex flex-col gap-0 rounded-2xl bg-popover ring-1 ring-foreground/10 shadow-2xl overflow-hidden
              data-[state=open]:animate-in data-[state=closed]:animate-out
              data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
              data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4 shrink-0">
              <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
              <DialogClose
                render={
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />
                }
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Yopish</span>
              </DialogClose>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 min-h-0">
              {children}
            </div>
          </div>
        </DialogPortal>
      </Dialog>
    </>
  );
}
