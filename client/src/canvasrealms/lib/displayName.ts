interface DisplayNameUser {
  username?: string | null;
  fullName?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  unsafeMetadata?: Record<string, unknown> | null;
}

export function getDisplayName(
  user: DisplayNameUser | null | undefined,
  fallback = "Anonymous",
): string {
  if (!user) return fallback;
  const meta = (user.unsafeMetadata ?? {}) as { displayName?: unknown };
  const custom =
    typeof meta.displayName === "string" ? meta.displayName.trim() : "";
  return (
    custom ||
    user.username ||
    user.fullName ||
    user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    fallback
  );
}
