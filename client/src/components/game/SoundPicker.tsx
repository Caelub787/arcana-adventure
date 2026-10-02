// A searchable Soundscape sound chooser — used for "sound on roll" and
// "sound on use". A button that opens a searchable list, not a dropdown.
import { useEffect, useMemo, useState } from "react";
import { Music, Play, Square, X, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { soundscape } from "@/lib/soundscape";
import { getSound, SOUNDSCAPE_LIBRARY } from "@shared/soundscape";

interface Props {
  value: string | null | undefined;
  onChange: (soundId: string | null) => void;
  testId?: string;
}

export function SoundPicker({ value, onChange, testId = "sound-picker" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setTick] = useState(0);
  useEffect(() => soundscape.subscribe(() => setTick((t) => t + 1)), []);
  useEffect(() => { if (!open) soundscape.preview(null); }, [open]);

  const current = getSound(value);
  // Effects first: a roll or an item use is almost always a one-shot.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = { sfx: 0, music: 1, ambience: 2 } as const;
    return SOUNDSCAPE_LIBRARY
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)))
      .sort((a, b) => order[a.kind] - order[b.kind]);
  }, [query]);

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex-1 min-w-0 h-8 px-2 rounded-md border text-xs flex items-center gap-1.5 text-left ${current ? "border-amber-700 text-amber-300 bg-amber-900/10" : "border-stone-600 text-stone-400 bg-stone-900 hover:border-stone-500"}`}
            data-testid={`button-${testId}`}
          >
            {current?.kind === "sfx" ? <Zap className="h-3.5 w-3.5 shrink-0" /> : <Music className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{current ? `${current.name} · ${current.category}` : "Choose a sound…"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2 bg-stone-900 border-stone-700" align="start">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — sword, fireball, door…"
            className="w-full h-8 px-2 mb-2 rounded bg-stone-800 border border-stone-700 focus:border-amber-500/70 outline-none text-sm text-stone-200"
            data-testid={`input-${testId}-search`}
          />
          <ul className="max-h-64 overflow-y-auto space-y-0.5">
            {results.map((s) => {
              const previewing = soundscape.previewing === s.id;
              return (
                <li key={s.id} className={`flex items-center gap-1.5 rounded px-1 py-1 hover:bg-stone-800 ${s.id === value ? "bg-amber-900/20" : ""}`}>
                  <button
                    type="button"
                    onClick={() => soundscape.preview(previewing ? null : s.id)}
                    className={`h-6 w-6 shrink-0 grid place-items-center rounded ${previewing ? "bg-amber-500 text-stone-950" : "bg-stone-800 text-stone-300"}`}
                    title="Preview"
                  >
                    {previewing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { onChange(s.id); setOpen(false); }}
                    className="flex-1 min-w-0 text-left"
                    data-testid={`option-${testId}-${s.id}`}
                  >
                    <div className="text-sm text-stone-200 truncate">{s.name}</div>
                    <div className="text-[10px] text-stone-500 truncate">{s.category}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
      {current && (
        <button
          type="button"
          onClick={() => soundscape.preview(soundscape.previewing === current.id ? null : current.id)}
          className="h-8 w-8 shrink-0 grid place-items-center rounded-md border border-stone-600 text-stone-300 hover:text-amber-300"
          title="Preview"
        >
          {soundscape.previewing === current.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      )}
      {current && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="h-8 w-8 shrink-0 grid place-items-center rounded-md border border-stone-600 text-stone-400 hover:text-red-400"
          title="No sound"
          data-testid={`button-${testId}-clear`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
