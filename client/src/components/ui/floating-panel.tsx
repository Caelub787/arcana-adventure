import * as React from "react";
import { createPortal } from "react-dom";
import { X, GripHorizontal, Minus, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export function FloatingPanel({
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
}: FloatingPanelProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);

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

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const posRef = React.useRef<{ x: number; y: number }>(isMobile ? { x: 0, y: 0 } : initialPos);
  const sizeRef = React.useRef(isMobile ? { width: window.innerWidth, height: window.innerHeight } : { ...computedDefaultSize });
  const isDraggingRef = React.useRef(false);
  const isResizingRef = React.useRef<string | null>(null);
  const dragStartRef = React.useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = React.useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const rafRef = React.useRef<number | null>(null);
  const savedPanelStateRef = React.useRef<{ position: { x: number; y: number }; size: { width: number; height: number } } | null>(null);

  const [, forceRender] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(isMobile);
  const [isMinimized, setIsMinimized] = React.useState(false);

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

  React.useLayoutEffect(() => {
    applyTransform();
  });

  const handleDragStart = React.useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: posRef.current.x, posY: posRef.current.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const el = panelRef.current;
    if (el) {
      el.classList.add('cursor-grabbing');
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
    isResizingRef.current = direction;
    resizeStartRef.current = {
      x: e.clientX, y: e.clientY,
      width: sizeRef.current.width, height: sizeRef.current.height,
      posX: posRef.current.x, posY: posRef.current.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const el = panelRef.current;
    if (el) {
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
      const content = el.querySelector('[data-panel-content]') as HTMLElement;
      if (content) content.style.pointerEvents = '';
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyTransform();
    applySize();
    forceRender((n) => n + 1);
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

  if (!open) return null;

  const resizeHandleBase = "absolute bg-transparent hover:bg-amber-500/30 transition-colors";
  const cornerSize = 12;
  const edgeThickness = 6;
  const headerHeight = isMinimized ? 28 : 44;
  const minimizedMaxWidth = 120;
  const s = sizeRef.current;

  const panelContent = (
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
        zIndex: isFullscreen ? Math.max(zIndex, 10500) : zIndex,
        backfaceVisibility: 'hidden' as const,
      }}
      data-testid="floating-panel"
      data-floating-panel
      onMouseDown={(e) => {
        e.stopPropagation();
        onBringToFront?.();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onBringToFront?.();
      }}
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

      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto overflow-x-hidden" data-panel-content>
            {children}
          </div>

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
  );

  return createPortal(panelContent, document.body);
}
