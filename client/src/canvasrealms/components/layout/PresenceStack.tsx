import { useRealtime } from "@cr/lib/realtime";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PresenceStack() {
  const ctx = useRealtime();
  if (!ctx) return null;

  // De-dupe peers by userId — one user may have multiple tabs open.
  const seen = new Set<string>();
  const uniquePeers = ctx.peers.filter((p) => {
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });

  const dotClass =
    ctx.status === "connected"
      ? "bg-emerald-400"
      : ctx.status === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-muted-foreground/40";
  const dotTitle =
    ctx.status === "connected"
      ? "Live: connected"
      : ctx.status === "connecting"
        ? "Live: connecting..."
        : "Live: disconnected";

  return (
    <div className="flex items-center gap-2">
      {uniquePeers.length > 0 && (
        <div className="flex -space-x-1.5">
          {uniquePeers.slice(0, 5).map((p) => (
            <div key={p.clientId} className="relative group">
              <div
                className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-semibold text-background overflow-hidden ring-0"
                style={{ backgroundColor: p.color }}
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <img
                    src={p.imageUrl}
                    className="w-full h-full object-cover"
                    alt={p.name}
                  />
                ) : (
                  <span>{initials(p.name)}</span>
                )}
              </div>
              {/* Hover card: name + dot in this peer's cursor color, matching
                  the colour they're rendered with on the canvas. */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 z-50 hidden group-hover:flex items-center gap-1.5 px-2 py-1 rounded-md bg-popover text-popover-foreground text-[11px] shadow-md border border-border whitespace-nowrap"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                />
                <span>{p.name}</span>
              </div>
            </div>
          ))}
          {uniquePeers.length > 5 && (
            <div className="w-6 h-6 rounded-full border-2 border-background bg-muted text-[10px] flex items-center justify-center font-semibold text-foreground/70">
              +{uniquePeers.length - 5}
            </div>
          )}
        </div>
      )}
      <span
        title={dotTitle}
        className={`w-2 h-2 rounded-full ${dotClass}`}
        aria-label={dotTitle}
      />
    </div>
  );
}
