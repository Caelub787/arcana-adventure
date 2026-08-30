import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { bringFloatingPanelToFront } from "@/components/ui/floating-panel"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[10700] bg-[rgba(0,0,0,0.65)]",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, onPointerDownOutside, style, ...props }, ref) => {
  // z is acquired imperatively the moment Radix Presence mounts the content into
  // the DOM (dialog opens), NOT when the wrapper component first renders.
  //
  // IMPORTANT: do NOT store this in React state. Radix re-composes this content
  // ref while it settles its open transition, so a setState here would re-render
  // -> re-invoke the ref -> acquire an ever-higher z -> setState again, an
  // infinite loop (React error #185). Setting el.style directly runs before paint
  // and React never manages zIndex (it's not passed via the style prop), so the
  // imperative value survives subsequent re-renders.
  const overlayRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Overlay> | null>(null);

  const contentCallback = React.useCallback(
    (el: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
      if (el) {
        // Acquire z ONCE per mount (dataset guard). Radix re-attaches this
        // ref on EVERY re-render, so without the guard each keystroke inside
        // the dialog grabbed fresh z slots and rewrote both fixed layers —
        // the browser re-composited the backdrop/panel pair per letter,
        // which flashed the dark backdrop over the form (worst on mobile).
        // Also: two DISTINCT slots, overlay strictly BELOW content — an
        // equal-z tie let compositors transiently paint the backdrop on top.
        if (el.dataset.zAcquired !== "1") {
          el.dataset.zAcquired = "1";
          const overlayZ = bringFloatingPanelToFront();
          const contentZ = bringFloatingPanelToFront();
          el.style.zIndex = String(contentZ);
          if (overlayRef.current) {
            (overlayRef.current as HTMLElement).style.zIndex = String(overlayZ);
          }
        }
      }
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<typeof el>).current = el;
    },
    [ref],
  );

  return (
  <DialogPortal>
    <DialogOverlay ref={overlayRef} />
    <DialogPrimitive.Content
      ref={contentCallback}
      style={style}
      onInteractOutside={(e) => {
        e.preventDefault();
        onInteractOutside?.(e);
      }}
      onPointerDownOutside={(e) => {
        e.preventDefault();
        onPointerDownOutside?.(e);
      }}
      onFocusOutside={(e) => {
        e.preventDefault();
      }}
      className={cn(
        "fixed left-[50%] top-[50%] z-[10701] grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-stone-700 bg-stone-900 p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg max-h-[calc(100dvh-2rem)] overflow-y-auto",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-stone-400 opacity-70 ring-offset-stone-900 transition-opacity hover:opacity-100 hover:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-stone-800 data-[state=open]:text-stone-300">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-stone-100",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-stone-400", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
