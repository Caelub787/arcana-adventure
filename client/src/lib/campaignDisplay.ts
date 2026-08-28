import { format, formatDistanceToNow } from "date-fns";

// Slug -> display label for a campaign's game system. Keep in sync with the
// system options offered in the campaign-creation dropdown (Campaign.tsx).
const SYSTEM_LABELS: Record<string, string> = {
  "arcana-adventure": "Arcana Adventure",
  "aa-v2": "A.A. V2",
  "aa-v3": "A.A. V3",
  ca: "C.A.",
};

export function getSystemLabel(system?: string | null): string {
  if (!system) return "Arcana Adventure";
  return SYSTEM_LABELS[system] ?? system;
}

export function formatCreatedDate(date: string | Date | null | undefined): string {
  if (!date) return "Unknown";
  return format(new Date(date), "MMM d, yyyy");
}

export function formatLastOpened(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
