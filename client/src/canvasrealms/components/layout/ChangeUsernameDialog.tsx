import { useEffect, useState } from "react";
import { useUser } from "@cr/lib/useUser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cr/components/ui/dialog";
import { Button } from "@cr/components/ui/button";
import { Input } from "@cr/components/ui/input";
import { Loader2 } from "lucide-react";
import { getDisplayName } from "@cr/lib/displayName";

interface ChangeUsernameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MIN_LEN = 4;
const MAX_LEN = 64;

function validateUsername(value: string): string | null {
  if (value.length < MIN_LEN) {
    return `Username must be at least ${MIN_LEN} characters.`;
  }
  if (value.length > MAX_LEN) {
    return `Username must be at most ${MAX_LEN} characters.`;
  }
  if (!USERNAME_REGEX.test(value)) {
    return "Only letters, numbers, underscores, and dashes are allowed.";
  }
  return null;
}

interface ClerkLikeError {
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
}

function mapClerkError(err: unknown): string {
  const e = err as ClerkLikeError;
  const first = e?.errors?.[0];
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export function ChangeUsernameDialog({
  open,
  onOpenChange,
}: ChangeUsernameDialogProps) {
  const { user } = useUser();
  const current = user ? getDisplayName(user, "") : "";
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(current);
      setError(null);
      setInfo(null);
      setSaving(false);
    }
  }, [open, current]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setInfo(null);
    const trimmed = value.trim();
    if (trimmed === (current ?? "")) {
      setInfo("That's already your username.");
      return;
    }
    const validation = validateUsername(trimmed);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      // TODO host displayName: host has no editable user metadata endpoint,
      // so this is a no-op that simply closes the dialog without crashing.
      const existing = (user.unsafeMetadata ?? {}) as Record<string, unknown>;
      await user.update?.({
        unsafeMetadata: { ...existing, displayName: trimmed },
      });
      setSaving(false);
      onOpenChange(false);
    } catch (err) {
      setSaving(false);
      setError(mapClerkError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change username</DialogTitle>
          <DialogDescription>
            Pick a unique username. Other people will see this on your cursor
            and avatar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              {current ? (
                <>
                  Current: <span className="font-medium text-foreground">@{current}</span>
                </>
              ) : (
                "No username set yet"
              )}
            </p>
            <Input
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
                setInfo(null);
              }}
              placeholder="your_username"
              maxLength={MAX_LEN}
              disabled={saving}
              aria-invalid={!!error}
            />
            <p className="text-xs text-muted-foreground">
              {MIN_LEN}–{MAX_LEN} characters. Letters, numbers, underscores,
              and dashes.
            </p>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            {!error && info && (
              <p className="text-xs text-muted-foreground">{info}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || value.trim().length === 0}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
