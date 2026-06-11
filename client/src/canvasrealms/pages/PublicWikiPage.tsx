import { useEffect, useMemo } from "react";
import {
  useGetPublicWiki,
  getGetPublicWikiQueryKey,
  type PublicWiki,
  type WikiPublishedEntry,
} from "@workspace/api-client-react";
import { Loader2, Globe } from "lucide-react";

interface Props {
  slug: string;
}

const SIZE_CLASS: Record<string, string> = {
  small: "sm:col-span-1",
  medium: "sm:col-span-2",
  large: "sm:col-span-3",
  full: "sm:col-span-4",
};

const SUMMARY_LEN = 220;

function summarize(s: string): string {
  if (s.length <= SUMMARY_LEN) return s;
  const cut = s.slice(0, SUMMARY_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "…";
}

function slugifyAnchor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";
}

export function PublicWikiPage({ slug }: Props) {
  const { data, isLoading, error } = useGetPublicWiki(slug, {
    query: {
      retry: false,
      queryKey: getGetPublicWikiQueryKey(slug),
    },
  });

  // Set document title + OG/description meta tags so shares look right and
  // search crawlers index the wiki content.
  useEffect(() => {
    if (!data) return;
    const title = data.layout.title || "Wiki";
    document.title = title;
    const description =
      data.layout.tagline ||
      data.entries
        .map((e) => e.node.title)
        .filter(Boolean)
        .slice(0, 5)
        .join(" · ");
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "article");
    if (data.layout.coverImage) {
      upsertMeta("property", "og:image", data.layout.coverImage);
    }
  }, [data]);

  // Force the wiki's chosen theme on the <html> root, isolated from any app
  // theme state. We snapshot the previous classes on mount and restore them
  // on unmount so navigating away leaves the host app untouched.
  useEffect(() => {
    if (!data || typeof document === "undefined") return;
    const root = document.documentElement;
    const prev = root.className;
    const without = prev
      .split(/\s+/)
      .filter((c) => c !== "dark" && c !== "light")
      .join(" ");
    const apply = (mode: "dark" | "light" | "auto") => {
      if (mode === "dark") root.className = `${without} dark`.trim();
      else if (mode === "light") root.className = `${without} light`.trim();
      else {
        const prefersDark =
          window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        root.className = `${without} ${prefersDark ? "dark" : "light"}`.trim();
      }
    };
    apply(data.layout.theme);
    let mql: MediaQueryList | null = null;
    let listener: ((e: MediaQueryListEvent) => void) | null = null;
    if (data.layout.theme === "auto" && window.matchMedia) {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      listener = () => apply("auto");
      mql.addEventListener("change", listener);
    }
    return () => {
      if (mql && listener) mql.removeEventListener("change", listener);
      root.className = prev;
    };
  }, [data]);

  // Group entries by section, preserving the author's section order.
  const grouped = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.entries].sort((a, b) => a.order - b.order);
    const sections = data.layout.sections;
    const out: { id: string; title: string; entries: WikiPublishedEntry[] }[] = [];
    const ungrouped = sorted.filter((e) => e.sectionId === null);
    if (ungrouped.length > 0) {
      out.push({ id: "_ungrouped", title: "Overview", entries: ungrouped });
    }
    for (const s of sections) {
      const items = sorted.filter((e) => e.sectionId === s.id);
      if (items.length > 0) out.push({ id: s.id, title: s.title, entries: items });
    }
    return out;
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary/70" />
      </div>
    );
  }

  if (error || !data) {
    // ApiError exposes status + the parsed JSON payload on `.data`. Read both
    // by duck-type so we don't depend on a specific class instance.
    const err = error as
      | { status?: unknown; data?: { code?: string } | null }
      | null;
    const status = err?.status;
    const code = err?.data?.code;
    let title = "Couldn't load wiki";
    let message = "Please try again in a moment.";
    if (status === 404) {
      if (code === "WIKI_UNPUBLISHED") {
        title = "Wiki not published";
        message =
          "This realm exists, but its owner hasn't published a public wiki yet.";
      } else {
        title = "Page not found";
        message = "There's no realm at this URL.";
      }
    }
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <Globe className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  const showSidebar = data.layout.showSidebar && grouped.length > 0;
  const totalEntries = data.entries.length;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-10 space-y-3">
          {data.layout.coverImage && (
            <img
              src={data.layout.coverImage}
              alt=""
              className="w-full h-48 sm:h-64 object-cover rounded-xl border border-border/40"
            />
          )}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {data.layout.title}
          </h1>
          {data.layout.tagline && (
            <p className="text-base text-muted-foreground max-w-2xl">
              {data.layout.tagline}
            </p>
          )}
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Published {new Date(data.publishedAt).toLocaleDateString()}
          </p>
        </header>

        <div className={showSidebar ? "lg:grid lg:grid-cols-[200px_1fr] lg:gap-10" : ""}>
          {showSidebar && (
            <nav
              aria-label="Table of contents"
              className="hidden lg:block sticky top-6 self-start text-sm space-y-1"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                On this page
              </div>
              {grouped.map((g) => (
                <a
                  key={g.id}
                  href={`#${slugifyAnchor(g.title)}`}
                  className="block px-2 py-1 rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                >
                  {g.title}
                </a>
              ))}
            </nav>
          )}

          <div className="space-y-12 min-w-0">
            {totalEntries === 0 && (
              <div className="text-center py-16 text-sm text-muted-foreground">
                This wiki is empty.
              </div>
            )}
            {data.layout.freeLayout ? (
              <FreeLayoutCanvas entries={data.entries} />
            ) : (
              grouped.map((g) => (
                <section key={g.id} id={slugifyAnchor(g.title)} className="space-y-4">
                  {grouped.length > 1 && (
                    <h2 className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1">
                      {g.title}
                    </h2>
                  )}
                  <div className="grid gap-4 sm:grid-cols-4">
                    {g.entries.map((entry) => (
                      <Entry key={entry.nodeId} entry={entry} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>

        <PoweredBy />
      </div>
    </div>
  );
}

function FreeLayoutCanvas({ entries }: { entries: WikiPublishedEntry[] }) {
  // Compute canvas bounds from positioned entries; fall back to a default
  // size so layouts without coordinates still render.
  const positioned = entries.filter((e) => e.position);
  const unpositioned = entries.filter((e) => !e.position);
  const maxX = Math.max(
    900,
    ...positioned.map((e) => (e.position!.x + e.position!.w) || 0),
  );
  const maxY = Math.max(
    400,
    ...positioned.map((e) => (e.position!.y + e.position!.h) || 0),
  );
  return (
    <div className="space-y-6">
      <div
        className="relative w-full border border-dashed border-border/50 rounded-lg bg-muted/10"
        style={{ height: maxY + 24 }}
      >
        <div className="relative" style={{ width: maxX, maxWidth: "100%" }}>
          {positioned.map((entry) => (
            <div
              key={entry.nodeId}
              className="absolute"
              style={{
                left: entry.position!.x,
                top: entry.position!.y,
                width: entry.position!.w,
                minHeight: entry.position!.h,
              }}
            >
              <Entry entry={entry} fixed />
            </div>
          ))}
        </div>
      </div>
      {unpositioned.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-4">
          {unpositioned.map((entry) => (
            <Entry key={entry.nodeId} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function Entry({
  entry,
  fixed = false,
}: {
  entry: WikiPublishedEntry;
  fixed?: boolean;
}) {
  const sizeClass = fixed ? "" : (SIZE_CLASS[entry.size] ?? SIZE_CLASS["medium"]!);
  const showImage = entry.show.image && !!entry.node.coverImage;
  const showSummary = entry.show.summary && !!entry.node.content;
  const showContent = entry.show.content && !!entry.node.content;
  return (
    <article
      id={`node-${entry.nodeId}`}
      className={`${sizeClass} rounded-lg border border-border/60 p-4 bg-card/40 flex flex-col gap-3`}
    >
      {showImage && (
        <img
          src={entry.node.coverImage as string}
          alt=""
          className="w-full h-32 object-cover rounded border border-border/30"
        />
      )}
      <div className="flex items-start gap-2">
        <span
          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{ backgroundColor: entry.node.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          {entry.show.title && (
            <h3 className="text-lg font-semibold leading-tight">
              {entry.node.title || "Untitled"}
            </h3>
          )}
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {entry.node.kind}
          </div>
        </div>
      </div>
      {showSummary && !showContent && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {summarize(entry.node.content)}
        </p>
      )}
      {showContent && (
        <div className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">
          {entry.node.content}
        </div>
      )}
      {entry.node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.node.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function PoweredBy() {
  return (
    <footer className="mt-16 pt-6 border-t border-border/40 text-center text-xs text-muted-foreground">
      Made with{" "}
      <a href="/" className="hover:text-foreground underline-offset-4 hover:underline">
        Canvas Realms
      </a>
    </footer>
  );
}

function upsertMeta(attr: "name" | "property", key: string, value: string) {
  if (typeof document === "undefined") return;
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

export type { PublicWiki };
