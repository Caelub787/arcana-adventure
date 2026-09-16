import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A corner flourish - two hairlines meeting in an actually-rounded corner.
 * A CSS-only background-image bracket can't follow a rounded corner (it
 * either cuts across the curve or floats disconnected from it - neither
 * reads as "curved"); a real element with its own border-radius can. This
 * mirrors CaCorner in CASheetUI.tsx (kept as a separate, un-imported copy
 * to avoid a card.tsx <-> CASheetUI.tsx circular import, since CASheetUI
 * itself imports Card).
 */
function CardCorner({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const pos = {
    tl: "top-1.5 left-1.5 border-t border-l rounded-tl",
    tr: "top-1.5 right-1.5 border-t border-r rounded-tr",
    bl: "bottom-1.5 left-1.5 border-b border-l rounded-bl",
    br: "bottom-1.5 right-1.5 border-b border-r rounded-br",
  }[at];
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute w-4 h-4 ${pos}`}
      style={{ borderColor: "var(--ca-gilt-line)" }}
    />
  );
}

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    // A stable hook for theming every card at once — C.A. gilds them from
    // CSS rather than every call site adding classes.
    data-slot="card"
    className={cn(
      "relative rounded-xl border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  >
    <CardCorner at="tl" />
    <CardCorner at="tr" />
    <CardCorner at="bl" />
    <CardCorner at="br" />
    {children}
  </div>
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-header"
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-title"
    className={cn("font-semibold leading-none tracking-tight text-amber-300", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
