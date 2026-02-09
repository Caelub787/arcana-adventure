import * as React from "react";
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
  zIndex = 40,
  onBringToFront,
}: FloatingPanelProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  
  const computedDefaultSize = React.useMemo(() => {
    if (defaultSize) return defaultSize;
    const height = typeof window !== "undefined" ? window.innerHeight * 0.8 : 600;
    return { width: 680, height };
  }, [defaultSize]);
  
  const [position, setPosition] = React.useState(() => {
    if (defaultPosition) return defaultPosition;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      x: Math.max(20, (viewportWidth - computedDefaultSize.width) / 2),
      y: Math.max(20, (viewportHeight - computedDefaultSize.height) / 2),
    };
  });
  const [size, setSize] = React.useState(computedDefaultSize);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const savedPanelStateRef = React.useRef<{ position: { x: number; y: number }; size: { width: number; height: number } } | null>(null);
  const dragStartRef = React.useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = React.useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  const clampPosition = React.useCallback((x: number, y: number, width: number, height: number) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minVisible = 100;
    return {
      x: Math.max(-width + minVisible, Math.min(viewportWidth - minVisible, x)),
      y: Math.max(0, Math.min(viewportHeight - 40, y)),
    };
  }, []);

  const handleDragStart = React.useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handleDragMove = React.useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const newPos = clampPosition(
      dragStartRef.current.posX + dx,
      dragStartRef.current.posY + dy,
      size.width,
      size.height
    );
    setPosition(newPos);
  }, [isDragging, size, clampPosition]);

  const handleDragEnd = React.useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, [isDragging]);

  const handleResizeStart = React.useCallback((e: React.PointerEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: position.x,
      posY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [size, position]);

  const handleResizeMove = React.useCallback((e: React.PointerEvent) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;
    let newWidth = resizeStartRef.current.width;
    let newHeight = resizeStartRef.current.height;
    let newX = resizeStartRef.current.posX;
    let newY = resizeStartRef.current.posY;

    if (isResizing.includes('e')) {
      newWidth = Math.max(minWidth, resizeStartRef.current.width + dx);
    }
    if (isResizing.includes('w')) {
      const potentialWidth = resizeStartRef.current.width - dx;
      if (potentialWidth >= minWidth) {
        newWidth = potentialWidth;
        newX = resizeStartRef.current.posX + dx;
      }
    }
    if (isResizing.includes('s')) {
      newHeight = Math.max(minHeight, resizeStartRef.current.height + dy);
    }
    if (isResizing.includes('n')) {
      const potentialHeight = resizeStartRef.current.height - dy;
      if (potentialHeight >= minHeight) {
        newHeight = potentialHeight;
        newY = resizeStartRef.current.posY + dy;
      }
    }

    setSize({ width: newWidth, height: newHeight });
    const clampedPos = clampPosition(newX, newY, newWidth, newHeight);
    setPosition(clampedPos);
  }, [isResizing, minWidth, minHeight, clampPosition]);

  const handleResizeEnd = React.useCallback((e: React.PointerEvent) => {
    if (!isResizing) return;
    setIsResizing(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, [isResizing]);

  const toggleMinimize = React.useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    if (isFullscreen) {
      if (savedPanelStateRef.current) {
        setPosition(savedPanelStateRef.current.position);
        setSize(savedPanelStateRef.current.size);
      }
      setIsFullscreen(false);
    } else {
      savedPanelStateRef.current = { position, size };
      setPosition({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setIsFullscreen(true);
      setIsMinimized(false);
    }
  }, [isFullscreen, position, size]);

  const handleDoubleClick = React.useCallback(() => {
    toggleMinimize();
  }, [toggleMinimize]);

  if (!open) return null;

  const resizeHandleBase = "absolute bg-transparent hover:bg-amber-500/30 transition-colors";
  const cornerSize = 12;
  const edgeThickness = 6;
  const headerHeight = isMinimized ? 28 : 44;
  const minimizedMaxWidth = 120;

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed bg-stone-900 border border-stone-700 rounded-lg shadow-2xl flex flex-col overflow-hidden",
        isDragging && "cursor-grabbing",
        className
      )}
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? minimizedMaxWidth : size.width,
        height: isMinimized ? headerHeight : size.height,
        zIndex: isFullscreen ? 100 : zIndex,
      }}
      data-testid="floating-panel"
      onMouseDown={onBringToFront}
      onPointerDown={onBringToFront}
    >
      <div
        className={cn(
          "flex items-center justify-between bg-stone-800 border-b border-stone-700 cursor-grab select-none shrink-0",
          isMinimized ? "px-1.5 py-0.5 gap-0.5" : "px-4 py-2",
          isDragging && "cursor-grabbing"
        )}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onDoubleClick={handleDoubleClick}
        data-testid="floating-panel-header"
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>

          <div
            className={`${resizeHandleBase} top-0 left-${cornerSize}px right-${cornerSize}px cursor-n-resize`}
            style={{ height: edgeThickness, left: cornerSize, right: cornerSize, top: 0 }}
            onPointerDown={(e) => handleResizeStart(e, 'n')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} bottom-0 cursor-s-resize`}
            style={{ height: edgeThickness, left: cornerSize, right: cornerSize, bottom: 0 }}
            onPointerDown={(e) => handleResizeStart(e, 's')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} left-0 cursor-w-resize`}
            style={{ width: edgeThickness, top: cornerSize, bottom: cornerSize, left: 0 }}
            onPointerDown={(e) => handleResizeStart(e, 'w')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} right-0 cursor-e-resize`}
            style={{ width: edgeThickness, top: cornerSize, bottom: cornerSize, right: 0 }}
            onPointerDown={(e) => handleResizeStart(e, 'e')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} top-0 left-0 cursor-nw-resize`}
            style={{ width: cornerSize, height: cornerSize }}
            onPointerDown={(e) => handleResizeStart(e, 'nw')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} top-0 right-0 cursor-ne-resize`}
            style={{ width: cornerSize, height: cornerSize }}
            onPointerDown={(e) => handleResizeStart(e, 'ne')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} bottom-0 left-0 cursor-sw-resize`}
            style={{ width: cornerSize, height: cornerSize }}
            onPointerDown={(e) => handleResizeStart(e, 'sw')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
          <div
            className={`${resizeHandleBase} bottom-0 right-0 cursor-se-resize`}
            style={{ width: cornerSize, height: cornerSize }}
            onPointerDown={(e) => handleResizeStart(e, 'se')}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
        </>
      )}
    </div>
  );
}
