"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
        <DialogContent className="max-w-[96vw] w-[96vw] max-h-[92vh] h-[92vh] flex flex-col gap-3 p-6">
          <DialogTitle className="text-lg font-semibold shrink-0">
            {title}
          </DialogTitle>
          <div className="flex-1 overflow-auto min-h-0">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
