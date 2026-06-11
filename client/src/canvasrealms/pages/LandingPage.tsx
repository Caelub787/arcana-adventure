import { Link } from "wouter";
import { Button } from "@cr/components/ui/button";
import { ThemeToggle } from "@cr/components/layout/ThemeToggle";
import {
  Sparkles,
  Network,
  LayoutPanelLeft,
  Users,
  ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: LayoutPanelLeft,
    title: "Spatial canvas",
    body: "Open lore, characters, and locations as floating windows. Split, drag, and arrange the way your story actually thinks.",
  },
  {
    icon: Network,
    title: "Living graph",
    body: "Every relationship between nodes becomes a line on the map. Switch to Graph mode to see your world from above.",
  },
  {
    icon: Sparkles,
    title: "Compass AI",
    body: "Ask the Compass for help — propose edits, weave new threads, or discover gaps in your worldbuilding.",
  },
  {
    icon: Users,
    title: "Share your realm",
    body: "Invite collaborators as editors or viewers. Let trusted readers explore without breaking anything.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground overflow-x-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, hsl(var(--primary) / 0.18), transparent 45%), radial-gradient(circle at 80% 0%, hsl(var(--accent) / 0.12), transparent 40%), radial-gradient(circle at 50% 100%, hsl(var(--primary) / 0.08), transparent 50%)",
        }}
      />

      <header className="relative z-10 px-6 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Canvas Realms" className="w-7 h-7" />
          <span className="font-semibold tracking-wide">Canvas Realms</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              Get started
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-20">
        <section className="max-w-3xl">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground border border-border/60 rounded-full px-3 py-1">
            <Sparkles className="w-3 h-3 text-primary" />
            Spatial worldbuilding OS
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
            Build entire worlds
            <br />
            <span className="text-primary">like you imagine them.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Canvas Realms turns your lore, characters, and places into a living spatial
            workspace — one canvas for every realm you create. Drag a node onto
            the screen and start writing the world into existence.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="gap-2 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30"
              >
                Start building <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="ghost">
                I already have an account
              </Button>
            </Link>
          </div>
        </section>

        <section className="mt-24 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-8 border-t border-border/40 text-xs text-muted-foreground flex items-center justify-between">
        <span>Canvas Realms — the worldbuilding OS</span>
        <span>v0.1</span>
      </footer>
    </div>
  );
}
