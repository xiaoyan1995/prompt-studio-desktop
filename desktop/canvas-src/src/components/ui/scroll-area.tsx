"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    className?: string;
    viewportRef?: React.Ref<HTMLDivElement>;
    viewportClassName?: string;
    onViewportScroll?: React.UIEventHandler<HTMLDivElement>;
  }
>(({ className, children, viewportRef, viewportClassName, onViewportScroll, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={`relative overflow-hidden ${className ?? ""}`}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      ref={viewportRef}
      className={`h-full w-full rounded-[inherit] ${viewportClassName ?? ""}`}
      onScroll={onViewportScroll}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={`flex touch-none select-none transition-colors ${
      orientation === "vertical" ? "h-full w-2 border-l border-l-transparent p-[1px]" : "h-2 flex-col border-t border-t-transparent p-[1px]"
    } ${className ?? ""}`}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
