/**
 * Which token on the map is yours.
 *
 * The older systems answer with the character assigned to you; an Agnostic
 * table has no character records, so the answer comes off the sheet a token
 * stands for — whoever it's assigned to. The camera centres on it, the fog
 * sees through its eyes, and the ruler measures its cones and lines from it,
 * so all three need the same answer.
 */
import type { AgNote } from "./types";
import { mayPlayNote } from "./acl";

export interface TokenLike {
  characterId?: string | null;
  agnosticNoteId?: string | null;
}

export function findMyToken<T extends TokenLike>(tokens: readonly T[], opts: {
  /** The character assigned to this viewer, in the systems that have them. */
  characterId?: string | null;
  userId?: string | null;
  /** The sheet a token stands for, when there is one. */
  noteOf?: (noteId: string) => Pick<AgNote, "ownerIds" | "userIds"> | undefined | null;
}): T | null {
  const { characterId, userId, noteOf } = opts;
  if (characterId) {
    const byChar = tokens.find((t) => t.characterId === characterId);
    if (byChar) return byChar;
  }
  if (!noteOf || !userId) return null;
  return tokens.find((t) => {
    const note = t.agnosticNoteId ? noteOf(t.agnosticNoteId) : null;
    return !!note && mayPlayNote(note, userId);
  }) ?? null;
}
