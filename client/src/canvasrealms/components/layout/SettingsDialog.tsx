import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cr/components/ui/dialog";
import { Button } from "@cr/components/ui/button";
import { useTheme } from "@cr/lib/theme";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@cr/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Personalize how Canvas Realms looks on this device.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Appearance</p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-accent/30 text-muted-foreground",
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              "System" follows your device's light/dark preference.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
