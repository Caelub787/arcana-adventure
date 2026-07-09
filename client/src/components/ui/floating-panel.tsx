import * as React from "react";
import { createPortal } from "react-dom";
import { X, GripHorizontal, Minus, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Shared stacking source of truth ----------------------------------------
// A single module-level counter guarantees that whenever ANY floating panel
// opens (or is interacted with) it can acquire a z-index strictly above every
// other currently-open panel — WITHOUT the call site having to wire anything
// up. Call sites may still pass `panelKey` / `zIndex` / `onBringToFront`; those
// keep working and feed into this same counter, so the two systems never drift.
let sharedZCounter = 10600;
const sharedZRegistry: Record<string, number> = {};

// Acquire the next-highest z-index and (optionally) record/apply it for a panel.
// `baseline` lets a panel that was given an explicit high zIndex (e.g. a
// quick-search panel at 20000) push the counter above that value so subsequent
// panels still open above it.
export function isFloatingPanelOnTop(panelKey?: string): boolean {
  return !!panelKey && sharedZRegistry[panelKey] === sharedZCounter;
}

export function bringFloatingPanelToFront(panelKey?: string, baseline?: number, force = false): number {
  // Already the topmost panel and nothing (baseline) demands a higher slot:
  // return the existing z instead of bumping the counter. This keeps repeated
  // clicks inside the focused panel from churning the shared counter (which
  // made every open Radix overlay's fixed z stale and caused visible
  // stacking flicker while editing). `force` (used on panel OPEN) always bumps
  // so a freshly opened panel is strictly above everything, never tied with a
  // stale registry slot.
  if (!force && panelKey && sharedZRegistry[panelKey] === sharedZCounter && (baseline ?? 0) <= sharedZCounter) {
    return sharedZCounter;
  }
  sharedZCounter = Math.max(sharedZCounter, baseline ?? 0) + 1;
  const z = sharedZCounter;
  if (panelKey) {
    sharedZRegistry[panelKey] = z;
    if (typeof document !== "undefined") {
      const safeKey =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(panelKey)
          : panelKey.replace(/"/g, '\\"');
      const el = document.querySelector(`[data-panel-key="${safeKey}"]`) as HTMLElement | null;
      if (el) el.style.zIndex = String(z);
    }
  }
  return z;
}

export function getFloatingPanelZ(panelKey?: string): number | undefined {
  return panelKey ? sharedZRegistry[panelKey] : undefined;
}

// Hook for non-FloatingPanel overlays (Radix dialogs, alert-dialogs, sheets,
// popovers, dropdown/context menus, selects, tooltips, hover-cards, menubars,
// etc.) to acquire a z-index from the SAME shared counter the moment they open.
// Floating panels bump that counter every time they're focused, so any fixed
// z-index can eventually be climbed past — making an overlay open BEHIND a
// panel. Drawing from the shared counter guarantees "whatever opens last sits
// on top of every currently-open floating panel".
//
// IMPORTANT: We use useLayoutEffect (not useState lazy-init) so the z-index is
// acquired at the moment the component actually mounts/becomes visible, not at
// the time it was first added to the React tree.  Radix unmounts and remounts
// overlay content when open→true, so useLayoutEffect fires at exactly the right
// moment.  Because useLayoutEffect runs synchronously before the browser paints,
// the re-render triggered by setZ completes before anything is drawn — no flash.
// This fixes overlays (e.g. the per-row delete-quantity AlertDialog) that are
// mounted long before the user opens them and would otherwise hold a stale,
// lower-than-current z-index.
export function useTopLayerZIndex(): number {
  const [z, setZ] = React.useState(0);
  React.useLayoutEffect(() => {
    setZ(bringFloatingPanelToFront());
  }, []);
  return z;
}

// Wrapper <div> for hand-rolled (non-Radix) modal/confirmation overlays that
// would otherwise hardcode a z-index. It draws from the SAME shared counter the
// floating panels use, so it always opens above every currently-open panel.
// Mount it only when the overlay is open (the hook acquires its z on mount).
// Any z-* class passed via className is ignored in favor of the acquired value;
// pass positioning/background classes (e.g. "fixed inset-0 ... bg-black/70").
interface TopLayerOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const TopLayerOverlay = React.forwardRef<HTMLDivElement, TopLayerOverlayProps>(
  function TopLayerOverlay({ children, style, ...props }, ref) {
    const z = useTopLayerZIndex();
    return (
      <div ref={ref} style={{ zIndex: z || undefined, ...style }} {...props}>
        {children}
      </div>
    );
  },
);

interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  className?: string;
  zIndex?: number;
  onBringToFront?: () => void;
  panelKey?: string;
  /**
   * When true (desktop only), the panel sizes its height to fit its content
   * instead of stretching to the provided defaultSize.height. The bottom edge
   * then sits right after the content (so the bottom gap matches the content's
   * own padding). Auto-fitting stops once the user manually resizes the panel.
   */
  fitContent?: boolean;
  /**
   * Only relevant together with `fitContent`. The one-time fit-and-lock is
   * performed while this is true (e.g. while the designated tab is showing), so
   * the single locked size matches that tab. Defaults to true.
   */
  fitContentActive?: boolean;
  /**
   * Called once, right after the one-time fit-to-content measurement locks the
   * panel size (and just before the panel is revealed). Lets the caller react
   * to the lock — e.g. switch the displayed tab back after measuring a taller
   * one. Fires synchronously within the layout phase, so a state update here is
   * flushed before paint (no flash).
   */
  onFitLocked?: () => void;
}

export const FloatingPanel = React.memo(function FloatingPanel({
  open,
  onClose,
  title,
  children,
  defaultPosition,
  defaultSize,
  minWidth = 400,
  minHeight = 400,
  className,
  zIndex = 10500,
  onBringToFront,
  panelKey,
  fitContent,
  fitContentActive,
  onFitLocked,
}: FloatingPanelProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  if (!open) return null;

  if (isMobile) {
    return (
      <MobileFloatingPanel
        onClose={onClose}
        title={title}
        className={className}
        zIndex={zIndex}
        panelKey={panelKey}
      >
        {children}
      </MobileFloatingPanel>
    );
  }

  return <DesktopFloatingPanel
    open={open}
    onClose={onClose}
    title={title}
    defaultPosition={defaultPosition}
    defaultSize={defaultSize}
    minWidth={minWidth}
    minHeight={minHeight}
    className={className}
    zIndex={zIndex}
    onBringToFront={onBringToFront}
    panelKey={panelKey}
    fitContent={fitContent}
    fitContentActive={fitContentActive}
    onFitLocked={onFitLocked}
  >
    {children}
  </DesktopFloatingPanel>;
});

// Mobile full-screen panel. On open (mount) it acquires the next-highest
// z-index from the SAME shared counter the desktop panels use, so a newly
// opened panel ALWAYS sits above every already-open panel — previously the
// mobile branch used only the static zIndex prop, which made new panels open
// BEHIND panels that had already been raised past that value.
const MobileFloatingPanel = React.memo(function MobileFloatingPanel({
  onClose,
  title,
  children,
  className,
  zIndex = 10500,
  panelKey,
}: {
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  panelKey?: string;
}) {
  const [z, setZ] = React.useState(() => Math.max(zIndex, 10500));
  React.useLayoutEffect(() => {
    setZ(bringFloatingPanelToFront(panelKey, Math.max(zIndex, 10500), true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className={cn(
        "fixed inset-0 bg-stone-900 flex flex-col",
        className
      )}
      style={{ zIndex: z }}
      data-testid="floating-panel"
      data-floating-panel
      data-panel-key={panelKey}
    >
      <div className="flex items-center justify-between bg-stone-800 border-b border-stone-700 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 text-amber-500 font-display text-lg truncate min-w-0 pr-4">
          <span className="truncate">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded hover:bg-stone-700 transition-colors text-stone-400 hover:text-stone-200 shrink-0"
          data-testid="floating-panel-close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        data-panel-content
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
});

const DesktopFloatingPanel = React.memo(function DesktopFloatingPanel({
  open,
  onClose,
  title,
  children,
  defaultPosition,
  defaultSize,
  minWidth = 400,
  minHeight = 400,
  className,
  zIndex = 10500,
  onBringToFront,
  panelKey,
  fitContent,
  fitContentActive,
  onFitLocked,
}: FloatingPanelProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const contentElRef = React.useRef<HTMLDivElement>(null);
  const contentInnerRef = React.useRef<HTMLDivElement>(null);
  const userResizedRef = React.useRef(false);
  const fitLockedRef = React.useRef(false);

  const computedDefaultSize = React.useMemo(() => {
    if (defaultSize) return defaultSize;
    const height = typeof window !== "undefined" ? window.innerHeight * 0.8 : 600;
    return { width: 680, height };
  }, [defaultSize]);

  const initialPos = React.useMemo(() => {
    if (defaultPosition) return { ...defaultPosition };
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      x: Math.max(20, (vw - computedDefaultSize.width) / 2),
      y: Math.max(20, (vh - computedDefaultSize.height) / 2),
    };
  }, [defaultPosition, computedDefaultSize]);

  const posRef = React.useRef<{ x: number; y: number }>({ ...initialPos });
  const sizeRef = React.useRef({ ...computedDefaultSize });
  const isDraggingRef = React.useRef(false);
  const isResizingRef = React.useRef<string | null>(null);
  const dragStartRef = React.useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = React.useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const rafRef = React.useRef<number | null>(null);
  const savedPanelStateRef = React.useRef<{ position: { x: number; y: number }; size: { width: number; height: number } } | null>(null);
  const zIndexRef = React.useRef(zIndex);

  const [, forceRender] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  // For fitContent panels we render hidden until the one-time fit-to-content
  // has locked the size, so the user never sees the default size flash to the
  // fitted size. Panels that aren't waiting on a fit reveal immediately.
  const [fitRevealed, setFitRevealed] = React.useState(false);

  const applyZIndex = React.useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const current = parseInt(el.style.zIndex || '0', 10);
    const target = isFullscreen ? Math.max(zIndexRef.current, 10500) : zIndexRef.current;
    if (current < target) {
      el.style.zIndex = String(target);
    }
  }, [isFullscreen]);

  // Acquire the next-highest z-index from the single shared counter and apply
  // it directly. This is what guarantees "rise to top" regardless of whether
  // the call site wired up panelKey / onBringToFront.
  const acquireTopZ = React.useCallback((force = false) => {
    const z = bringFloatingPanelToFront(panelKey, zIndexRef.current, force);
    zIndexRef.current = z;
    const el = panelRef.current;
    if (el) el.style.zIndex = String(isFullscreen ? Math.max(z, 10500) : z);
  }, [panelKey, isFullscreen]);

  React.useLayoutEffect(() => {
    zIndexRef.current = Math.max(zIndexRef.current, zIndex);
    applyZIndex();
  }, [zIndex, applyZIndex]);

  // On open (mount), always rise above every other currently-open panel.
  // useLayoutEffect fires before the browser paints, preventing the one-frame
  // z-index mismatch that caused panels to briefly appear behind overlays.
  React.useLayoutEffect(() => {
    acquireTopZ(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTransform = React.useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
  }, []);

  const applySize = React.useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const s = sizeRef.current;
    el.style.width = `${s.width}px`;
    el.style.height = `${s.height}px`;
  }, []);

  const clampPosition = React.useCallback((x: number, y: number, width: number, _height: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minVisible = 100;
    return {
      x: Math.max(-width + minVisible, Math.min(vw - minVisible, x)),
      y: Math.max(0, Math.min(vh - 40, y)),
    };
  }, []);

  // Fit the panel's height to its content exactly ONCE, then lock it so the
  // size never changes again (no per-tab resizing). The fit only runs while
  // `fitContentActive` is true (e.g. while the designated tab is showing), so
  // the single locked size matches that tab. Ignored after a manual resize.
  const fitToContent = React.useCallback(() => {
    if (!fitContent || fitLockedRef.current || userResizedRef.current || isFullscreen || isMinimized) return;
    if (fitContentActive === false) return;
    const inner = contentInnerRef.current;
    const el = panelRef.current;
    if (!inner || !el) return;
    const sh = inner.scrollHeight;
    if (sh <= 0) return;
    const HEADER = 44; // non-minimized header height
    const EXTRA = 6;   // a few px of slack so content is never clipped
    const desired = HEADER + sh + 2 + EXTRA; // +2 for top/bottom borders
    const maxH = window.innerHeight - 24;
    const newH = Math.max(minHeight, Math.min(desired, maxH));
    sizeRef.current = { ...sizeRef.current, height: newH };
    applySize();
    const p = clampPosition(posRef.current.x, posRef.current.y, sizeRef.current.width, newH);
    posRef.current.x = p.x;
    posRef.current.y = p.y;
    applyTransform();
    fitLockedRef.current = true; // lock — never resize again
    onFitLocked?.(); // let caller react before reveal (e.g. switch tab back)
    setFitRevealed(true); // size is final; safe to show the panel
  }, [fitContent, fitContentActive, isFullscreen, isMinimized, minHeight, applySize, applyTransform, clampPosition, onFitLocked]);

  // Whether this panel should stay hidden until the fit locks. Mirrors the
  // guards in fitToContent so panels that won't fit (no fitContent, inactive
  // tab, fullscreen/minimized, or already manually resized) reveal at once.
  const waitingForFit =
    !!fitContent && fitContentActive !== false && !isFullscreen && !isMinimized && !userResizedRef.current;

  // Reveal immediately when we are not waiting on a fit; otherwise keep a short
  // safety timer so the panel can never stay invisible if a measurement never
  // resolves (the common case reveals pre-paint via fitToContent's lock).
  React.useEffect(() => {
    if (fitRevealed) return;
    if (!waitingForFit) {
      setFitRevealed(true);
      return;
    }
    const t = setTimeout(() => setFitRevealed(true), 250);
    return () => clearTimeout(t);
  }, [fitRevealed, waitingForFit]);

  React.useLayoutEffect(() => {
    if (!fitContent || fitLockedRef.current) return;
    const inner = contentInnerRef.current;
    if (!inner) return;
    fitToContent();
    if (fitLockedRef.current) return;
    const ro = new ResizeObserver(() => {
      fitToContent();
      if (fitLockedRef.current) ro.disconnect();
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [fitContent, fitContentActive, fitToContent]);

  React.useLayoutEffect(() => {
    const el = panelRef.current;
    if (el && !el.style.zIndex) {
      el.style.zIndex = String(isFullscreen ? Math.max(zIndexRef.current, 10500) : zIndexRef.current);
    }
    applyTransform();
    applyZIndex();
  }, [isFullscreen, isMinimized, applyZIndex]);

  const handleDragStart = React.useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: posRef.current.x, posY: posRef.current.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const el = panelRef.current;
    if (el) {
      el.classList.add('cursor-grabbing');
      el.style.willChange = 'transform';
      const content = el.querySelector('[data-panel-content]') as HTMLElement;
      if (content) content.style.pointerEvents = 'none';
    }
  }, []);

  const handleDragMove = React.useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const s = sizeRef.current;
    const newPos = clampPosition(
      dragStartRef.current.posX + dx,
      dragStartRef.current.posY + dy,
      s.width,
      s.height
    );
    posRef.current.x = newPos.x;
    posRef.current.y = newPos.y;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyTransform();
      });
    }
  }, [clampPosition, applyTransform]);

  const handleDragEnd = React.useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    const el = panelRef.current;
    if (el) {
      el.classList.remove('cursor-grabbing');
      el.style.willChange = '';
      const content = el.querySelector('[data-panel-content]') as HTMLElement;
      if (content) content.style.pointerEvents = '';
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyTransform();
  }, [applyTransform]);

  const handleResizeStart = React.useCallback((e: React.PointerEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    userResizedRef.current = true;
    isResizingRef.current = direction;
    resizeStartRef.current = {
      x: e.clientX, y: e.clientY,
      width: sizeRef.current.width, height: sizeRef.current.height,
      posX: posRef.current.x, posY: posRef.current.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const el = panelRef.current;
    if (el) {
      el.style.willChange = 'transform, width, height';
      const content = el.querySelector('[data-panel-content]') as HTMLElement;
      if (content) content.style.pointerEvents = 'none';
    }
  }, []);

  const handleResizeMove = React.useCallback((e: React.PointerEvent) => {
    const dir = isResizingRef.current;
    if (!dir) return;
    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;
    let newWidth = resizeStartRef.current.width;
    let newHeight = resizeStartRef.current.height;
    let newX = resizeStartRef.current.posX;
    let newY = resizeStartRef.current.posY;

    if (dir.includes('e')) newWidth = Math.max(minWidth, resizeStartRef.current.width + dx);
    if (dir.includes('w')) {
      const pw = resizeStartRef.current.width - dx;
      if (pw >= minWidth) { newWidth = pw; newX = resizeStartRef.current.posX + dx; }
    }
    if (dir.includes('s')) newHeight = Math.max(minHeight, resizeStartRef.current.height + dy);
    if (dir.includes('n')) {
      const ph = resizeStartRef.current.height - dy;
      if (ph >= minHeight) { newHeight = ph; newY = resizeStartRef.current.posY + dy; }
    }

    sizeRef.current = { width: newWidth, height: newHeight };
    const clamped = clampPosition(newX, newY, newWidth, newHeight);
    posRef.current.x = clamped.x;
    posRef.current.y = clamped.y;

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyTransform();
        applySize();
      });
    }
  }, [minWidth, minHeight, clampPosition, applyTransform, applySize]);

  const handleResizeEnd = React.useCallback((e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    isResizingRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    const el = panelRef.current;
    if (el) {
      el.style.willChange = '';
      const content = el.querySelector('[data-panel-content]') as HTMLElement;
      if (content) content.style.pointerEvents = '';
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyTransform();
    applySize();
    setTimeout(() => forceRender((n) => n + 1), 50);
  }, [applyTransform, applySize]);

  const toggleMinimize = React.useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    setIsFullscreen((prev) => {
      if (prev) {
        if (savedPanelStateRef.current) {
          const sp = savedPanelStateRef.current;
          posRef.current.x = sp.position.x;
          posRef.current.y = sp.position.y;
          sizeRef.current = { ...sp.size };
        }
        return false;
      } else {
        savedPanelStateRef.current = { position: { ...posRef.current }, size: { ...sizeRef.current } };
        posRef.current.x = 0; posRef.current.y = 0;
        sizeRef.current = { width: window.innerWidth, height: window.innerHeight };
        setIsMinimized(false);
        return true;
      }
    });
  }, []);

  const handleDoubleClick = React.useCallback(() => {
    toggleMinimize();
  }, [toggleMinimize]);

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // NOTE: no stopPropagation here — swallowing pointerdown broke Radix's
  // document-level outside-press detection, so open dropdowns/popovers never
  // dismissed when clicking into a panel and were left z-fighting with it
  // (visible as random flicker/glitches while editing). Instead we tag the
  // native event so an ANCESTOR panel (portals bubble through the React tree)
  // doesn't also raise itself above the panel the user actually clicked.
  const handleBringToFront = React.useCallback((e: React.PointerEvent | React.MouseEvent) => {
    // Only raise for genuine presses on THIS panel's own surface. Events from
    // portaled overlays declared in our children (Radix dialogs, selects,
    // popovers, nested panels) bubble here through the React tree even though
    // their DOM lives elsewhere — raising on those made the panel leapfrog
    // ABOVE its own open dialog/dropdown ("everything opens behind the panel").
    const el = panelRef.current;
    if (!el || !el.contains(e.target as Node)) return;
    const native = e.nativeEvent as any;
    if (native.__floatingPanelHandled) return;
    native.__floatingPanelHandled = true;
    acquireTopZ();
    onBringToFront?.();
  }, [acquireTopZ, onBringToFront]);

  if (!open) return null;

  const resizeHandleBase = "absolute bg-transparent hover:bg-amber-500/30 transition-colors";
  const cornerSize = 12;
  const edgeThickness = 6;
  const headerHeight = isMinimized ? 28 : 44;
  const minimizedMaxWidth = 120;
  const s = sizeRef.current;
  const hidePreFit = waitingForFit && !fitRevealed;

  const panelContent = (
    <>
      <div
        ref={panelRef}
        className={cn(
          "fixed bg-stone-900 border border-stone-700 rounded-lg shadow-2xl flex flex-col overflow-hidden",
          className
        )}
        style={{
          left: 0,
          top: 0,
          width: isMinimized ? minimizedMaxWidth : (isFullscreen ? window.innerWidth : s.width),
          height: isMinimized ? headerHeight : (isFullscreen ? window.innerHeight : s.height),
          backfaceVisibility: 'hidden' as const,
          visibility: hidePreFit ? 'hidden' : undefined,
        }}
        data-testid="floating-panel"
        data-floating-panel
        data-panel-key={panelKey}
        onPointerDown={handleBringToFront}
        onClick={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
      <div
        className={cn(
          "flex items-center justify-between bg-stone-800 border-b border-stone-700 cursor-grab select-none shrink-0",
          isMinimized ? "px-1.5 py-0.5 gap-0.5" : "px-4 py-2",
        )}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onDoubleClick={handleDoubleClick}
        data-testid="floating-panel-header"
        style={{ touchAction: 'none' }}
      >
        <div className={cn(
          "flex items-center text-amber-500 font-display truncate min-w-0",
          isMinimized ? "gap-0.5 text-xs pr-0.5" : "gap-2 text-lg pr-4"
        )}>
          {!isMinimized && <GripHorizontal className="h-4 w-4 text-stone-500 shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        <div className={cn("flex items-center shrink-0", isMinimized ? "gap-0" : "gap-1")}>
          <button
            onClick={toggleMinimize}
            className={cn(
              "rounded hover:bg-stone-700 transition-colors text-stone-400 hover:text-stone-200",
              isMinimized ? "p-0" : "p-1"
            )}
            data-no-drag
            data-testid="floating-panel-minimize"
            title={isMinimized ? "Restore" : "Minimize"}
          >
            <Minus className={isMinimized ? "h-3 w-3" : "h-5 w-5"} />
          </button>
          {!isMinimized && (
            <button
              onClick={toggleFullscreen}
              className="p-1 rounded hover:bg-stone-700 transition-colors text-stone-400 hover:text-stone-200"
              data-no-drag
              data-testid="floating-panel-fullscreen"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className={cn(
              "rounded hover:bg-stone-700 transition-colors text-stone-400 hover:text-stone-200",
              isMinimized ? "p-0" : "p-1"
            )}
            data-no-drag
            data-testid="floating-panel-close"
          >
            <X className={isMinimized ? "h-3 w-3" : "h-5 w-5"} />
          </button>
        </div>
      </div>

      <div
        ref={contentElRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        data-panel-content
        style={{ display: isMinimized ? 'none' : '' }}
      >
        {/* fitContent wraps children in a measuring div so we can read their
            natural height. Adopters relying on children being a direct scroll
            child or on parent-height contracts should verify layout. */}
        {fitContent ? <div ref={contentInnerRef}>{children}</div> : children}
      </div>

      {!isMinimized && (
        <>
          <div
            className={`${resizeHandleBase} top-0 cursor-n-resize`}
            style={{ height: edgeThickness, left: cornerSize, right: cornerSize, top: 0, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'n')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} bottom-0 cursor-s-resize`}
            style={{ height: edgeThickness, left: cornerSize, right: cornerSize, bottom: 0, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 's')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} left-0 cursor-w-resize`}
            style={{ width: edgeThickness, top: cornerSize, bottom: cornerSize, left: 0, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'w')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} right-0 cursor-e-resize`}
            style={{ width: edgeThickness, top: cornerSize, bottom: cornerSize, right: 0, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'e')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} top-0 left-0 cursor-nw-resize`}
            style={{ width: cornerSize, height: cornerSize, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'nw')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} top-0 right-0 cursor-ne-resize`}
            style={{ width: cornerSize, height: cornerSize, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'ne')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} bottom-0 left-0 cursor-sw-resize`}
            style={{ width: cornerSize, height: cornerSize, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'sw')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} bottom-0 right-0 cursor-se-resize`}
            style={{ width: cornerSize, height: cornerSize, touchAction: 'none' }}
            onPointerDown={(e) => handleResizeStart(e, 'se')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
        </>
      )}
    </div>
    </>
  );

  return createPortal(panelContent, document.body);
});
