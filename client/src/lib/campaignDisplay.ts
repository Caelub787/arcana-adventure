import { format, formatDistanceToNow } from "date-fns";

import { systemLabel } from "@shared/systems";

// Slug -> display label for a campaign's game system. The table itself lives
// in shared/systems.ts so the campaign-creation dropdown, the admin system
// picker, and the server all read the same pairs.
export function getSystemLabel(system?: string | null): string {
  return systemLabel(system);
}

export function formatCreatedDate(date: string | Date | null | undefined): string {
  if (!date) return "Unknown";
  return format(new Date(date), "MMM d, yyyy");
}

export function formatLastOpened(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
