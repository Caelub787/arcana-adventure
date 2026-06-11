import { Router, type IRouter } from "express";
import { eq, and, isNotNull } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";
import {
  db,
  nodesTable,
  relationshipsTable,
  realmsTable,
  realmCollaboratorsTable,
} from "@workspace/db";
import {
  requireAuth,
  requireRealmAccess,
  requireRealmAccessByNode,
} from "../middlewares/auth";

// Stable identifiers for guides Compass can start from chat. Keep this in
// sync with GUIDES in artifacts/reborn/src/lib/guides.ts.
//
// There is intentionally no "open-compass" guide — Compass is the only
// surface that suggests guides, so it is always already open when a guide
// would start. Never suggest one to a user who is already talking to you.
const GUIDE_IDS = [
  "open-library",
  "create-realm",
  "switch-realm",
  "create-node",
  "open-node",
  "open-document-compass",
  "open-account-menu",
] as const;

// Short human-readable description of each guide so the model can pick the
// right one. Keep these in sync with GUIDES in
// artifacts/reborn/src/lib/guides.ts.
const GUIDE_DESCRIPTIONS: Record<(typeof GUIDE_IDS)[number], string> = {
  "open-library":
    "Tour the library: shows the library panel, the realm list, and where nodes appear under the current realm.",
  "create-realm":
    "Create a new realm (a brand-new world): walks the user to the + button that opens the new-realm dialog. Only pick this when the user explicitly wants a NEW realm, not a new node.",
  "switch-realm":
    "Switch to a different realm: only pick this when the user explicitly says they want to leave the current realm and go to another one.",
  "create-node":
    "Create a node inside the realm the user is currently in: highlights the + New button in the top bar. Default for any 'how do I add a character/location/lore/note/etc' question.",
  "open-node":
    "Open an existing node from the current realm: highlights a node row in the library, with a fallback to + New when the realm has none yet.",
  "open-document-compass":
    "Edit the open node with Compass: highlights the Compass button inside the document editor for expand/rewrite/continue. Only pick this when a node is already open.",
  "open-account-menu":
    "Open the account menu: highlights the avatar in the top bar for account management and sign out.",
};

const GUIDE_CATALOG = GUIDE_IDS.map(
  (id) => `  - ${id}: ${GUIDE_DESCRIPTIONS[id]}`,
).join("\n");

const router: IRouter = Router();

// Shared house rules injected into every Compass prompt (selection edit,
// full-node edit, realm chat). Style + safety guardrails. Kept tight so it
// doesn't blow up the prompt budget. Per-mode rules are appended after this
// block so formatting instructions like "return only the replacement" or the
// JSON schema for chat still win.
const COMPASS_HOUSE_RULES = `Compass house rules (always apply, in every mode, to every word you write — prose, chat replies, suggested node content, and any notes back to the user):

Style:
- Put TWO spaces after a sentence-ending period, question mark, or exclamation mark when another sentence follows in the same paragraph. Do not add the second space at the end of a paragraph or before a newline. Example: "She ran.  He followed." not "She ran. He followed."
- Do NOT join words with hyphens. Rewrite hyphenated compounds as separate words. Example: "real-life" becomes "real life", "well-known" becomes "well known", "long-forgotten" becomes "long forgotten".
- Leave hyphens alone inside proper names ("Jean-Luc"), URLs, code, and [[wiki-style]] links. Em dashes and en dashes used as punctuation between clauses are also fine; the rule is about hyphenated compound words only.

Safety:
- Dark, violent, morally complex fiction is welcome. Villains can do villain things on the page. Characters can struggle with addiction, abuse, grief, trauma, violence, sexuality between adults, and other heavy material. Depicting hard things in a story is allowed.
- What is NOT allowed is real-world harm: actual instructions, recipes, or step-by-step methods for self-harm or suicide, real weapons or explosives or dangerous chemistry, sexual content involving minors, or targeted harassment or doxxing of real people. Also do not encourage the reader (as opposed to a character) to hurt themselves or others.
- Self-harm and suicide carve-out: a character can struggle with these on the page, but never give methods, never give "how-to" detail, and never frame it as encouragement to the reader.
- If a request crosses that line, refuse briefly and in character as Compass (one or two sentences), and offer to keep helping with the story in a safer direction (for example: shift the focus, time-skip past the act, handle it off-page, or explore the emotional fallout instead). Do not lecture.`;

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

const openai =
  baseURL && apiKey ? new OpenAI({ baseURL, apiKey }) : null;

// ElevenLabs is used for speech-to-text and text-to-speech in Compass
// voice mode. Per the AI integration skill, when STT/TTS is chained with
// a separate text model (Compass uses gpt-5.4 with structured JSON
// output), both legs must go through ElevenLabs. The key is read from a
// plain secret because the Replit ElevenLabs proxy does not yet support
// runtime audio passthrough — voice mode degrades gracefully when the
// secret is absent.
const elevenLabsApiKey = process.env["ELEVENLABS_API_KEY"];
const ELEVENLABS_BASE = "https://api.elevenlabs.io";
// "Sarah" — a free-tier-friendly premade voice with a natural, neutral
// delivery that works well for narration-style chat replies.
const COMPASS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
// Lowest-latency multilingual model. Voice mode prioritises turn-taking
// responsiveness over the marginal quality bump of the slower turbo or
// multilingual v2 models.
const COMPASS_TTS_MODEL = "eleven_flash_v2_5";
// scribe_v1 is ElevenLabs' general-purpose speech-to-text model. We do
// not specify a language so it can autodetect.
const COMPASS_STT_MODEL = "scribe_v1";

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

// Lightweight description of what the user's UI looks like right now.
// Used to phrase navigation answers correctly for the device they are on
// (mobile vs desktop, which panels are open, etc.) instead of giving
// desktop-only directions to a phone user.
const ViewportContext = z.object({
  isMobile: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  // Whether the library/sidebar is currently visible. On mobile it lives
  // behind a drawer toggle; on desktop it is usually pinned open.
  librarySidebarOpen: z.boolean().optional(),
});

const CompassBody = z.object({
  message: z.string().min(1),
  history: z.array(ChatMessage).max(40).optional(),
  // The node the user is currently focused on in the workspace (if any).
  // Used as the default target for in-place edit prompts like "rewrite
  // this" / "make it darker" when the user does not name another node.
  currentNodeId: z.string().optional(),
  viewport: ViewportContext.optional(),
});

const SuggestedNode = z.object({
  type: z.literal("node"),
  title: z.string(),
  kind: z.enum([
    "character",
    "location",
    "lore",
    "faction",
    "event",
    "item",
    "note",
  ]),
  content: z.string(),
  tags: z.array(z.string()).max(8).optional(),
  // Optional client-side temporary id Compass invents for a node it is
  // proposing in the same reply. Other "relationship" suggestions in the
  // SAME reply may reference this id on either side; the client resolves
  // it to the real database id once the node is actually created. Must
  // start with "temp:" so it can never collide with a real uuid.
  tempId: z.string().optional(),
});

const SuggestedRelationship = z.object({
  type: z.literal("relationship"),
  // Either a real existing node id (uuid from the realm) or a "temp:..." id
  // matching the tempId of a node suggestion in the SAME reply. Validated
  // server-side in cleanSuggestions.
  fromNodeId: z.string(),
  toNodeId: z.string(),
  label: z.string(),
});

const SuggestedCreateRealm = z.object({
  type: z.literal("create_realm"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const SuggestedSwitchRealm = z.object({
  type: z.literal("switch_realm"),
  realmId: z.string(),
  realmName: z.string(),
});

const SuggestedStartGuide = z.object({
  type: z.literal("start_guide"),
  guideId: z.enum(GUIDE_IDS),
  caption: z.string().max(140).optional(),
  // Optional hint for guides that need to highlight a specific submenu
  // option. Currently used by "create-node" to highlight a specific kind
  // (character, location, lore, etc) in the + New menu after the user
  // opens it. Lower-case kind name; ignored by guides that don't use it.
  kindHint: z.string().max(40).optional(),
});

// In-place edit of an existing node. Emitted when the user asks Compass
// to rewrite/expand/change/continue an existing node from the sidebar.
// The client applies it via PATCH /nodes/:nodeId.
const SuggestedEditNode = z.object({
  type: z.literal("edit_node"),
  nodeId: z.string(),
  nodeTitle: z.string(),
  proposedContent: z.string(),
  summary: z.string().max(200).optional(),
});

// A clarifying question with a small set of clickable options. The client
// renders each option as a button; clicking one sends that option's
// `prompt` back to Compass as the next user turn so the conversation can
// continue without typing.
const SuggestedClarify = z.object({
  type: z.literal("clarify"),
  question: z.string().min(1).max(280),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        prompt: z.string().min(1).max(280),
      }),
    )
    .min(2)
    .max(5),
});

const Suggestion = z.union([
  SuggestedNode,
  SuggestedRelationship,
  SuggestedCreateRealm,
  SuggestedSwitchRealm,
  SuggestedStartGuide,
  SuggestedEditNode,
  SuggestedClarify,
]);

// No hard cap on the batch size — the model is free to propose as many
// related nodes + links in a single reply as the conversation calls for.
// The high upper bound is just a safety belt against pathological model
// output and to keep response sizes reasonable.
const COMPASS_MAX_SUGGESTIONS = 50;

const CompassResponse = z.object({
  reply: z.string(),
  suggestions: z.array(Suggestion).max(COMPASS_MAX_SUGGESTIONS),
});

const CompassEditBody = z.object({
  action: z.enum(["expand", "rewrite", "continue", "custom"]),
  instruction: z.string().max(500).optional(),
  // The editor's current (possibly unsaved) content. Used to validate the
  // selection range and to prompt against what the user actually sees,
  // rather than what last hit the database.
  currentContent: z.string().max(200_000).optional(),
  selection: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      text: z.string(),
    })
    .refine((s) => s.end >= s.start, { message: "selection end must be >= start" })
    .optional(),
});

const CompassEditResponse = z.object({
  scope: z.enum(["node", "selection"]),
  proposedContent: z.string(),
  selection: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      originalText: z.string(),
    })
    .optional(),
  note: z.string().optional(),
});

router.post(
  "/nodes/:nodeId/compass-edit",
  requireRealmAccessByNode("editor"),
  async (req, res): Promise<void> => {
    if (!openai) {
      res.status(503).json({
        error:
          "AI integration not configured. Missing AI_INTEGRATIONS_OPENAI_* env vars.",
      });
      return;
    }

    const nodeId = req.params["nodeId"];
    if (!nodeId) {
      res.status(400).json({ error: "Missing nodeId" });
      return;
    }

    const parsed = CompassEditBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [node] = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.id, nodeId));
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    const [realm] = await db
      .select()
      .from(realmsTable)
      .where(eq(realmsTable.id, node.realmId));

    const sel = parsed.data.selection;
    // Prefer the editor's live content (passed by the client) so selection
    // offsets line up with what the user actually has highlighted on screen,
    // even when autosave hasn't flushed yet. Fall back to the persisted
    // node content when the client didn't send anything.
    const fullContent = parsed.data.currentContent ?? node.content ?? "";
    const hasValidSelection =
      !!sel &&
      sel.end <= fullContent.length &&
      sel.end > sel.start &&
      fullContent.slice(sel.start, sel.end) === sel.text;
    const scope: "node" | "selection" = hasValidSelection ? "selection" : "node";

    const nodeDirective: Record<typeof parsed.data.action, string> = {
      expand:
        "Expand and enrich the existing content with more vivid detail, preserving the established voice, facts, and structure. Keep what's there and add depth — do not strip existing information.",
      rewrite:
        "Rewrite the content to be sharper, more evocative, and better organized, while preserving every concrete fact, name, and intent already present.",
      continue:
        "Continue the content where it leaves off, adding 1-3 short paragraphs that flow naturally from what's already written. Return the FULL content (existing text + new continuation), not just the new portion.",
      custom: "Apply the user's instruction below to the content.",
    };

    const selectionDirective: Record<typeof parsed.data.action, string> = {
      expand:
        "Expand the SELECTED passage with more vivid detail and texture, keeping the same intent and any facts it establishes.",
      rewrite:
        "Rewrite the SELECTED passage to be sharper and more evocative, preserving every concrete fact and name already present in it.",
      continue:
        "Extend the SELECTED passage with a natural continuation. Return the original selection PLUS the continuation as a single replacement block.",
      custom: "Apply the user's instruction below to the SELECTED passage only.",
    };

    let systemPrompt: string;
    let userPrompt: string;

    if (scope === "selection" && sel) {
      const before = fullContent.slice(0, sel.start);
      const after = fullContent.slice(sel.end);
      systemPrompt = `You are Compass, a worldbuilding co-writer editing a single node in the realm "${realm?.name ?? "Untitled"}"${realm?.description ? ` (${realm.description})` : ""}.

${COMPASS_HOUSE_RULES}

You are editing a node of kind "${node.kind}" titled "${node.title}".

The user has highlighted a specific passage. You must edit ONLY that passage. Do not touch the surrounding text.

Task: ${selectionDirective[parsed.data.action]}${
        parsed.data.instruction
          ? `\n\nUser instruction: ${parsed.data.instruction}`
          : ""
      }

Rules:
- Return ONLY the replacement for the selected passage in "proposedContent". Do NOT include the surrounding context.
- Do not wrap the replacement in quotes, code fences, or labels.
- Preserve markdown formatting and any [[wiki-style]] links inside the selection.
- Make sure the replacement reads naturally where it sits between the surrounding text shown below.
- Stay in the established tone and tense.`;
      userPrompt = `Full node content for context (do not rewrite this):\n\n---BEFORE---\n${before || "(start of node)"}\n---SELECTED---\n${sel.text}\n---AFTER---\n${after || "(end of node)"}\n\nReturn the new replacement for the SELECTED block only.`;
    } else {
      systemPrompt = `You are Compass, a worldbuilding co-writer editing a single node in the realm "${realm?.name ?? "Untitled"}"${realm?.description ? ` (${realm.description})` : ""}.

${COMPASS_HOUSE_RULES}

You are editing a node of kind "${node.kind}" titled "${node.title}".

Task: ${nodeDirective[parsed.data.action]}${
        parsed.data.instruction
          ? `\n\nUser instruction: ${parsed.data.instruction}`
          : ""
      }

Rules:
- Return the COMPLETE new content for this node (not a diff, not just additions).
- Preserve markdown formatting and any [[wiki-style]] links already present.
- Stay in the established tone and tense.
- Do not invent contradictions with existing facts in the node.
- Keep it tight: aim for evocative prose, not filler.`;
      userPrompt = `Existing content of "${node.title}":\n\n${fullContent || "(empty)"}`;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "compass_edit_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["proposedContent", "note"],
              properties: {
                proposedContent: { type: "string" },
                note: { type: ["string", "null"] },
              },
            },
          },
        },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsedRaw = tryParseModelJson<{
        proposedContent?: string;
        note?: string | null;
      }>(raw, (info) => {
        req.log.warn(
          { ...info, route: "compass-edit" },
          "compass JSON parse recovered after repair",
        );
      });
      if (!parsedRaw) {
        req.log.error(
          { rawLength: raw.length, route: "compass-edit" },
          "compass JSON parse failed even after repair",
        );
        res.status(502).json({ error: "Compass edit failed: unparseable response" });
        return;
      }

      const result = CompassEditResponse.parse({
        scope,
        proposedContent: parsedRaw.proposedContent ?? "",
        selection:
          scope === "selection" && sel
            ? { start: sel.start, end: sel.end, originalText: sel.text }
            : undefined,
        note: parsedRaw.note ?? undefined,
      });
      res.json(result);
    } catch (err) {
      req.log.error({ err }, "compass edit failed");
      res.status(502).json({
        error: err instanceof Error ? err.message : "Compass edit failed",
      });
    }
  },
);

/**
 * Best-effort repair of a JSON document the model emitted that does not
 * strictly parse. Handles the failure modes we actually see on long
 * multi-node Compass replies:
 *
 *   - stray literal control characters (newlines, tabs, NULs) inside a
 *     string value, which strict JSON forbids
 *   - response truncated mid-string (max tokens cut us off inside a
 *     `content` field)
 *   - response truncated mid-object/array (open brackets never closed)
 *   - dangling trailing commas just before a close bracket
 *   - a dangling escape (`\`) at the very end of the input
 *
 * Returns the repaired text. The caller is still responsible for running
 * `JSON.parse` on the result. If parsing the repaired text also fails,
 * the caller should fall back to a salvage path rather than throwing.
 */
function repairModelJson(raw: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  const stack: ("{" | "[")[] = [];

  // Lookahead helper: from index `i` (pointing at a `"` we hit inside a
  // string), decide whether that quote really closes the string or is a
  // stray unescaped quote that belongs to the content. Real string
  // terminators are followed (after optional whitespace) by one of
  // `:` (key), `,` (next field), `}` `]` (close), or end of input.
  // Anything else — a letter, a space then a letter, another quote with
  // text after, etc. — almost certainly means the model forgot to
  // escape this quote and we should treat it as content.
  const isRealStringEnd = (i: number): boolean => {
    let j = i + 1;
    while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
    if (j >= raw.length) return true;
    const c = raw[j]!;
    return c === ":" || c === "," || c === "}" || c === "]" || c === "\n" || c === "\r";
  };

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    const code = c.charCodeAt(0);

    if (inString) {
      if (escape) {
        // If the escape char is invalid (not one of " \ / b f n r t u),
        // double the backslash so JSON.parse stops complaining. A common
        // failure is the model writing a literal Windows path or LaTeX
        // sequence inside content.
        const validEscapes = '"\\/bfnrtu';
        if (validEscapes.indexOf(c) < 0) {
          out += "\\" + c;
        } else {
          out += c;
        }
        escape = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        if (isRealStringEnd(i)) {
          out += c;
          inString = false;
        } else {
          // Stray unescaped quote inside a string value — escape it.
          out += '\\"';
        }
        continue;
      }
      // Escape literal control characters that strict JSON rejects
      // inside strings. This is one of the dominant failure modes for
      // long multi-section node content where the model didn't escape a
      // newline or a tab.
      if (code < 0x20) {
        if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\t") out += "\\t";
        else if (c === "\b") out += "\\b";
        else if (c === "\f") out += "\\f";
        else out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += c;
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "{" || c === "[") {
      stack.push(c);
      out += c;
      continue;
    }
    if (c === "}" || c === "]") {
      const need = c === "}" ? "{" : "[";
      if (stack[stack.length - 1] === need) stack.pop();
      out += c;
      continue;
    }
    out += c;
  }

  // Truncated mid-string: drop a dangling escape, then close the string.
  if (inString) {
    if (escape && out.endsWith("\\")) out = out.slice(0, -1);
    out += '"';
  }

  // Close any still-open containers, stripping a trailing comma or
  // whitespace each time so we don't emit `{...,}` or `[...,]`.
  while (stack.length > 0) {
    out = out.replace(/[\s,]+$/, "");
    const open = stack.pop()!;
    out += open === "{" ? "}" : "]";
  }

  // Strip trailing commas that appeared inside already-closed
  // containers (e.g. `[1,2,3,]`). This is purely structural cleanup —
  // string contents were already protected by the inString tracking
  // above, so we can safely operate on the output text.
  out = out.replace(/,(\s*[}\]])/g, "$1");

  return out;
}

/**
 * Last-resort suggestion salvage: when the full document is unparseable
 * even after repair, walk the raw text looking for the `"suggestions"`
 * array and extract each top-level `{...}` element individually. Each
 * element is parsed on its own (with a repair retry), so a single
 * malformed suggestion drops only itself instead of taking the whole
 * batch with it.
 *
 * The boundary scan is string-aware (tracks quotes and escapes) so it
 * is reasonably robust to nested objects. If a string inside an element
 * is so broken that its terminating quote can't be detected, that one
 * element may merge with the next and both will be dropped — but every
 * intact element before and after still gets through.
 */
function salvageSuggestionsFromRaw(raw: string): unknown[] {
  const keyIdx = raw.indexOf('"suggestions"');
  if (keyIdx < 0) return [];
  const bracketIdx = raw.indexOf("[", keyIdx);
  if (bracketIdx < 0) return [];

  const items: unknown[] = [];
  let i = bracketIdx + 1;

  const tryPush = (text: string): void => {
    try {
      items.push(JSON.parse(text));
      return;
    } catch {
      // fall through to repair
    }
    try {
      items.push(JSON.parse(repairModelJson(text)));
    } catch {
      // drop this one
    }
  };

  while (i < raw.length) {
    // Skip whitespace and commas between items.
    while (i < raw.length && (raw[i] === " " || raw[i] === "\t" || raw[i] === "\n" || raw[i] === "\r" || raw[i] === ",")) {
      i++;
    }
    if (i >= raw.length) break;
    if (raw[i] === "]") break;
    if (raw[i] !== "{") break;

    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let endIdx = -1;
    for (let j = i; j < raw.length; j++) {
      const c = raw[j]!;
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === "\\") {
          esc = true;
          continue;
        }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          endIdx = j;
          break;
        }
      }
    }

    if (endIdx < 0) {
      // Truncated mid-element — try to repair the trailing fragment
      // as the final item, then stop.
      tryPush(raw.slice(start));
      break;
    }

    tryPush(raw.slice(start, endIdx + 1));
    i = endIdx + 1;
  }

  return items;
}

/**
 * Parse a JSON document the model emitted, tolerating common malformations.
 * Strict parse first; on failure, repair and retry. Returns null if both
 * attempts fail so the caller can take a salvage path instead of throwing.
 * `onRecover` is invoked exactly once whenever the repair path produced a
 * usable value (never on the happy path), so callers can log it without
 * affecting the user-facing experience.
 */
function tryParseModelJson<T = unknown>(
  raw: string,
  onRecover?: (info: { firstError: string; rawLength: number }) => void,
): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (firstErr) {
    try {
      const repaired = repairModelJson(raw);
      const result = JSON.parse(repaired) as T;
      onRecover?.({
        firstError:
          firstErr instanceof Error ? firstErr.message : String(firstErr),
        rawLength: raw.length,
      });
      return result;
    } catch {
      return null;
    }
  }
}

/**
 * Incrementally extract the value of the top-level "reply" string from a
 * streaming JSON document. Feed it chunks of the raw text as they arrive and
 * it returns whatever new characters of the reply have been decoded since the
 * previous call. Returns "" once the reply string has closed.
 */
function createReplyExtractor(): (chunk: string) => string {
  type State =
    | "search_key"
    | "search_colon"
    | "search_open_quote"
    | "in_string"
    | "done";
  let state: State = "search_key";
  let buf = "";
  let escape = false;

  return (chunk: string): string => {
    if (state === "done") return "";
    buf += chunk;
    let out = "";
    // Walk buf from where we last left off implicitly: we mutate buf as we go.
    while (buf.length > 0) {
      if (state === "search_key") {
        const idx = buf.indexOf('"reply"');
        if (idx < 0) {
          // Keep last few chars in case "reply" is split across chunks.
          buf = buf.slice(-7);
          return out;
        }
        buf = buf.slice(idx + '"reply"'.length);
        state = "search_colon";
        continue;
      }
      if (state === "search_colon") {
        const idx = buf.indexOf(":");
        if (idx < 0) {
          buf = "";
          return out;
        }
        buf = buf.slice(idx + 1);
        state = "search_open_quote";
        continue;
      }
      if (state === "search_open_quote") {
        const idx = buf.indexOf('"');
        if (idx < 0) {
          buf = "";
          return out;
        }
        buf = buf.slice(idx + 1);
        state = "in_string";
        continue;
      }
      if (state === "in_string") {
        // Consume chars one by one, handling JSON escapes.
        let i = 0;
        while (i < buf.length) {
          const c = buf[i]!;
          if (escape) {
            // Decode the escape sequence as a JSON string fragment.
            try {
              if (c === "u") {
                if (i + 5 > buf.length) {
                  // Need more chars to decode \uXXXX
                  buf = buf.slice(i - 1);
                  return out;
                }
                const seq = buf.slice(i - 1, i + 5);
                out += JSON.parse('"' + seq + '"') as string;
                i += 5;
              } else {
                out += JSON.parse('"\\' + c + '"') as string;
                i += 1;
              }
            } catch {
              i += 1;
            }
            escape = false;
            continue;
          }
          if (c === "\\") {
            escape = true;
            i += 1;
            continue;
          }
          if (c === '"') {
            // End of reply string.
            state = "done";
            buf = "";
            return out;
          }
          out += c;
          i += 1;
        }
        buf = "";
        return out;
      }
    }
    return out;
  };
}

router.post(
  "/realms/:realmId/compass",
  requireRealmAccess("viewer"),
  async (req, res): Promise<void> => {
    if (!openai) {
      res.status(503).json({
        error:
          "AI integration not configured. Missing AI_INTEGRATIONS_OPENAI_* env vars.",
      });
      return;
    }

    const realmId = req.params["realmId"];
    if (!realmId) {
      res.status(400).json({ error: "Missing realmId" });
      return;
    }

    const parsed = CompassBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [realm] = await db
      .select()
      .from(realmsTable)
      .where(eq(realmsTable.id, realmId));
    if (!realm) {
      res.status(404).json({ error: "Realm not found" });
      return;
    }

    const nodes = await db
      .select()
      .from(nodesTable)
      .where(eq(nodesTable.realmId, realmId));
    const relationships = await db
      .select()
      .from(relationshipsTable)
      .where(eq(relationshipsTable.realmId, realmId));

    // Resolve the currently-focused node (if the client sent one and it
    // belongs to this realm). Used as the implicit target for edit prompts
    // that don't name another node by title.
    const currentNode =
      parsed.data.currentNodeId
        ? nodes.find((n) => n.id === parsed.data.currentNodeId) ?? null
        : null;

    const nodeLines = nodes
      .map(
        (n) =>
          `- [${n.id}] (${n.kind}) ${n.title}${
            n.tags.length ? ` — tags: ${n.tags.join(", ")}` : ""
          }${n.content ? ` — ${n.content.slice(0, 200)}` : ""}`,
      )
      .join("\n");
    const titleById = new Map(nodes.map((n) => [n.id, n.title]));
    const relLines = relationships
      .map(
        (r) =>
          `- ${titleById.get(r.fromNodeId) ?? r.fromNodeId} → ${
            titleById.get(r.toNodeId) ?? r.toNodeId
          }${r.label ? ` (${r.label})` : ""}`,
      )
      .join("\n");

    const systemPrompt = `You are Compass, an AI worldbuilding companion for a creative writer's realm called "${realm.name}".${realm.description ? ` Description: ${realm.description}` : ""}

${COMPASS_HOUSE_RULES}

You help the user brainstorm characters, locations, lore, factions, events and items, and you propose connections between them.

Existing nodes (id in brackets):
${nodeLines || "(none yet)"}

Existing relationships:
${relLines || "(none yet)"}

${
      currentNode
        ? `CURRENT FOCUS: the user is right now viewing the node [${currentNode.id}] "${currentNode.title}" (kind: ${currentNode.kind}). When the user says things like "rewrite this", "make it darker", "expand it", "change this", "continue it", or otherwise refers to the node they are looking at without naming a different one, treat THIS node as the implicit target. Use the "edit_node" suggestion to propose the new full content (see rules below). Do NOT emit a brand-new "node" suggestion in that case — that would create a duplicate.`
        : `No node is currently focused in the workspace. If the user asks you to edit or rewrite "this" without naming a node, ask them which one they mean instead of guessing.`
    }

DEVICE / VIEWPORT: ${
      parsed.data.viewport?.isMobile
        ? `the user is on MOBILE (a phone or small touch screen, viewport ${parsed.data.viewport.width ?? "?"}x${parsed.data.viewport.height ?? "?"}). The library/sidebar with the + New button is HIDDEN behind a drawer toggle in the top bar — they MUST tap the menu/library toggle to open the drawer first before they can see + New, realm rows, or node rows. Phrase navigation steps in tap-first language ("tap"/"swipe"), not "click", and never tell them to "press the + New button" without first telling them to open the library. The "create-node", "open-node", and "switch-realm" guides already include the open-drawer step automatically.`
        : `the user is on DESKTOP (viewport ${parsed.data.viewport?.width ?? "?"}x${parsed.data.viewport?.height ?? "?"}). The library is pinned open on the left and the + New button, realm rows, and node rows are visible without opening anything. Use "click"/"press"/"select" language. Do not tell them to "open the library first" — it's already there.`
    }${
      parsed.data.viewport?.librarySidebarOpen === false &&
      parsed.data.viewport?.isMobile
        ? ` The library drawer is currently CLOSED, so any answer that involves the + New button, a realm, or a node row must start with "tap the menu in the top bar to open your library".`
        : ""
    }

DEFAULT MODE IS DISCUSSION. Most of the time you are a thinking partner, not a node-spawner. Talk through ideas with the user — ask clarifying questions, riff on possibilities, weigh tradeoffs, pull in existing entities by name. Do NOT emit "node" suggestions while you are still brainstorming. An eager node card on every turn is annoying and breaks the flow of thought.

Only emit an "edit_node" suggestion when the user EXPLICITLY asks to apply a change to the focused node — phrases like "rewrite this", "apply that", "update the node", "save this change", "make it so", "do it", "go ahead and change it", or a clear approval right after you offered a specific rewrite ("Want me to apply that?" → "yes" counts). If they are still brainstorming, comparing options, or asking what-ifs, KEEP DISCUSSING and do NOT emit "edit_node" yet.

Only emit a "node" suggestion when the user EXPLICITLY tells you to commit something to the realm. Triggers include phrases like: "create the node", "add it", "save this", "make it", "go ahead", "do it", "turn this into a node", "yes create that", "spin it up", "commit it", or a clear approval after you have just offered to materialize a specific entity ("Want me to create this character?" → "yes" counts). When in doubt, KEEP DISCUSSING and ask if they want to commit it before emitting the node.

Reply formatting:
- When you are still in PLANNING / DISCUSSION mode and you have multiple questions or open choices to surface to the user, list them as plain markdown bullets ("- " on their own line, one question per line). Do NOT bury several questions inside one dense paragraph. The user reads the chat like a checklist; bullets are scannable, walls of prose are not.

Rules for suggestions:
- Each "node" suggestion should have a concise title, the right kind, and content drawn from the discussion so far. Pull in concrete details the user has agreed on; don't invent contradictions.
- MULTI-SECTION CONTENT (this matters for readability): if the proposed content for a node naturally has more than one section (e.g. "History", "Geography", "Culture", "Notable Figures", or "Appearance", "Personality", "Backstory"), give EACH section its own H2 heading on its own line (## Section Name) followed by that section's prose. The editor parses every heading into a separate collapsible block with its own header field, so well-structured multi-section content turns into a tidy outline. Single-topic short content can stay heading-less; only add headings when the content really has distinct sections.
- DO NOT write [[wiki-style]] links inside the "content" of a new "node" suggestion. The node keys are random codes the server assigns at creation time, so any [[Name]] token you invent will not resolve and will render as a broken link. Mention other entities by plain title text instead (e.g. write "Cithall" not "[[Cithall]]"). For relationships between proposed nodes, use a separate "relationship" suggestion with tempIds — never use [[]] tokens to imply links. The only place [[wiki-style]] tokens are appropriate is inside an "edit_node" proposedContent field when the ORIGINAL content already contained them and you are preserving those existing links verbatim.
- TITLE vs CONTENT split (this is critical, even when the user gave you a long multi-paragraph prompt): the "title" field is ONLY a short label — typically the entity's name or a 2-6 word phrase, never longer than 80 characters, never containing a line break, never containing prose, backstory, or instructions. ALL long-form prose (descriptions, backstory, history, personality, relationships, the body of what the user actually asked you to write) goes in the "content" field. If the user wrote "create a character named Jorah with this backstory: [three paragraphs]", the title is "Jorah" and the three paragraphs go in the content. Never dump the whole thing into one field.
- For an "edit_node" suggestion, set "nodeId" to the EXISTING node id you are rewriting (it must appear in the list above), set "nodeTitle" to that node's current title, and put the COMPLETE proposed new content in "proposedContent" (not a diff, not just additions). Optionally include a one-sentence "summary" of what changed. Preserve the established voice and any concrete facts already in the node, unless the user explicitly asked to change them.
- When the conversation calls for it, you can — and should — propose a WHOLE BATCH of related nodes in a single reply, plus the relationships between them. Example: the user says "create a city plus its rulers, plants and notable vendors" — that's ONE reply with multiple "node" suggestions and several "relationship" suggestions linking them. There is no hard cap beyond what fits sensibly in one turn; aim for a coherent set, not filler.
- BATCH LINKING WITH tempId: for each new "node" suggestion you want to link to from another suggestion in the SAME reply, set its "tempId" to a short string starting with "temp:" (e.g. "temp:city", "temp:ruler", "temp:vendor-1"). Each tempId must be unique within the reply. Then in a "relationship" suggestion, you may put that exact tempId in "fromNodeId" or "toNodeId" to link the two new nodes together. You may also mix: one side a tempId for a new node, the other side an existing node's real id from the list above. Never invent ids that are neither a tempId you defined in this reply nor a real id from the list above.
- Only invent a tempId for a node you are also proposing in the same reply. If a node will not be referenced by any relationship in this reply, you can leave tempId off (set it to null). For single-node replies with no links, tempId is unnecessary.
- If the user asks "how do I..." or "where is..." or "take me to..." for navigating the app itself, emit a "start_guide" suggestion picked from the catalog below. Use a short caption to describe what will happen. Pair it with a brief one-sentence reply. Available guides:
${GUIDE_CATALOG}
- Compass is already open (you are Compass). Never suggest a guide that would just open Compass, and never suggest a guide for a UI surface that is clearly already in front of the user.
- CRITICAL realm context: the user is already inside the realm "${realm.name}" and that is the realm they are asking about UNLESS they explicitly say otherwise. Always pick the guide that goes from where they are to the action in the SHORTEST possible path — never make them navigate to or pick a realm first. Examples: "how do I add a character" → create-node (NOT create-realm, NOT switch-realm). "how do I find my X node" → open-node. "how do I edit this node with Compass" → open-document-compass. Only emit "switch_realm" or "create_realm" when the user EXPLICITLY asks to leave this realm or to start a brand-new world.
- When the user asks how to create a SPECIFIC kind of node, emit "start_guide" with guideId "create-node" AND set "kindHint" to the lowercase kind name. The guide will highlight the + New button and then highlight that exact menu item once the dropdown opens. The + New dropdown is now organized into COLLAPSED categories that auto-expand for whichever kindHint you set, so always set kindHint when the user names a specific kind. The dropdown's categories and their kinds are: General (note, canvas, map, item); People & Society (character, faction, culture, religion, language, social-class); Places (location, region, settlement, building, ruin-or-dungeon, landmark); World & Nature (world-or-plane, geography, climate); Ecology (ecology, biome, flora, fauna, species, plant, tree); History & Lore (era-or-age, historical-event, war-or-conflict, myth-or-legend, prophecy); Magic & the Supernatural (magic-system, spell, artifact-or-relic, deity, supernatural-entity, ritual); Economy & Politics (government, law-or-tradition, trade-good, currency, military); Story & Narrative (quest-or-plot-hook, timeline, lore-entry, secret-or-mystery); Arcana (item, spell, character, species, class, feat-tree, character-template, roll-template). Note that "item", "spell", "character", and "species" appear in BOTH a regular category AND in Arcana. NEVER pick the Arcana variant unless the user EXPLICITLY mentions "Arcana", their RPG sheet, a stat block, dice, levels, classes, feats, or a tabletop-style template. "Make a character", "add an item", "create a spell", "new species" — all default to the regular (non-Arcana) kind. Just set kindHint to the lowercase kind name; the guide auto-picks the non-Arcana entry by default. Do not silently propose an Arcana variant as an "extra option" — if you think Arcana might be relevant, ASK the user with a "clarify" suggestion before emitting any guide. For a generic "how do I add a node" question, omit kindHint.
- ASK BEFORE GUESSING: if the user asks how to do or create something that doesn't map cleanly to one of the existing node kinds listed above or to one of the guides above — for example "how do I add a religion / a calendar / a magic system / a timeline / a chapter outline" — DO NOT silently pick the closest guide. Instead emit a "clarify" suggestion: a short question plus 2-5 clickable options drawn from what we actually have. Each option's "label" is the short button text the user sees; each option's "prompt" is the EXACT message that will be re-sent to you as their next turn if they tap it (so write the prompt as if it were the user speaking — e.g. "Make it a lore node about the Cult of Vael"). Also include a final "Something else" option whose prompt asks them to describe what they want in their own words. Keep the "reply" itself to one or two sentences that frame the question; the actual choices live in the clarify suggestion.
- After the user picks an option (their next turn will be the option's "prompt"), THEN respond with the appropriate guide / node / edit_node suggestion to actually do the thing. Don't ask again.
- Keep "reply" conversational, brief (1-3 short paragraphs), and reference existing entities by name.
- It's fine to return zero suggestions if the user is just chatting or asking a question.
- Always emit the "reply" field BEFORE the "suggestions" field so it can stream first.
- For unused fields on a suggestion, set them to null.
- JSON SAFETY: every string field you emit (reply, content, proposedContent, title, etc.) must be a valid JSON string. Escape every literal " as \\", every backslash as \\\\, every newline as \\n, every tab as \\t. This matters especially for long multi-paragraph "content" fields with markdown headings and prose — a single unescaped quote or raw newline inside content will corrupt the whole reply.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...(parsed.data.history ?? []).map((m: z.infer<typeof ChatMessage>) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: parsed.data.message },
    ];

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 4096,
        messages,
        stream: true,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "compass_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "suggestions"],
              properties: {
                reply: { type: "string" },
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "type",
                      "title",
                      "kind",
                      "content",
                      "tags",
                      "tempId",
                      "fromNodeId",
                      "toNodeId",
                      "label",
                      "name",
                      "description",
                      "realmId",
                      "realmName",
                      "guideId",
                      "caption",
                      "kindHint",
                      "nodeId",
                      "nodeTitle",
                      "proposedContent",
                      "summary",
                      "question",
                      "options",
                    ],
                    properties: {
                      type: {
                        type: "string",
                        enum: [
                          "node",
                          "relationship",
                          "create_realm",
                          "switch_realm",
                          "start_guide",
                          "edit_node",
                          "clarify",
                        ],
                      },
                      title: { type: ["string", "null"] },
                      kind: {
                        type: ["string", "null"],
                        enum: [
                          "character",
                          "location",
                          "lore",
                          "faction",
                          "event",
                          "item",
                          "note",
                          null,
                        ],
                      },
                      content: { type: ["string", "null"] },
                      tags: {
                        type: ["array", "null"],
                        items: { type: "string" },
                      },
                      tempId: { type: ["string", "null"] },
                      fromNodeId: { type: ["string", "null"] },
                      toNodeId: { type: ["string", "null"] },
                      label: { type: ["string", "null"] },
                      name: { type: ["string", "null"] },
                      description: { type: ["string", "null"] },
                      realmId: { type: ["string", "null"] },
                      realmName: { type: ["string", "null"] },
                      guideId: {
                        type: ["string", "null"],
                        enum: [...GUIDE_IDS, null],
                      },
                      caption: { type: ["string", "null"] },
                      kindHint: { type: ["string", "null"] },
                      nodeId: { type: ["string", "null"] },
                      nodeTitle: { type: ["string", "null"] },
                      proposedContent: { type: ["string", "null"] },
                      summary: { type: ["string", "null"] },
                      question: { type: ["string", "null"] },
                      options: {
                        type: ["array", "null"],
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["label", "prompt"],
                          properties: {
                            label: { type: "string" },
                            prompt: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const extractReply = createReplyExtractor();
      let raw = "";
      let streamedReply = "";
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      for await (const chunk of stream) {
        if (aborted) break;
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        raw += delta;
        const replyDelta = extractReply(delta);
        if (replyDelta) {
          streamedReply += replyDelta;
          send("reply_delta", { delta: replyDelta });
        }
      }

      if (aborted) {
        res.end();
        return;
      }

      const parsedRaw = tryParseModelJson<{
        reply?: string;
        suggestions?: Array<Record<string, unknown>>;
      }>(raw || "{}", (info) => {
        req.log.warn(
          { ...info, route: "compass-realm" },
          "compass JSON parse recovered after repair",
        );
      });

      const validNodeIds = new Set(nodes.map((n) => n.id));

      if (!parsedRaw) {
        // Last-resort salvage: walk the raw text and recover any
        // individual suggestion objects that DID parse. Combined with
        // the streamed reply, this preserves the conversation turn AND
        // as many of the model's suggestions as possible. One bad
        // suggestion only drops itself, not the whole batch.
        const salvaged = salvageSuggestionsFromRaw(raw);
        const cleanedSalvaged = cleanSuggestions(
          salvaged as Array<Record<string, unknown>>,
          {
            validNodeIds,
            validRealmIds: new Set([realm.id]),
            allowNodeAndRelationship: true,
          },
        );
        req.log.warn(
          {
            rawLength: raw.length,
            streamedReplyLength: streamedReply.length,
            salvagedCount: salvaged.length,
            keptCount: cleanedSalvaged.length,
            route: "compass-realm",
          },
          "compass JSON parse failed even after repair; salvaging streamed reply + per-item suggestions",
        );
        send("final", { reply: streamedReply, suggestions: cleanedSalvaged });
        res.end();
        return;
      }

      const cleaned = cleanSuggestions(parsedRaw.suggestions ?? [], {
        validNodeIds,
        validRealmIds: new Set([realm.id]),
        allowNodeAndRelationship: true,
      });

      const result = CompassResponse.parse({
        reply: parsedRaw.reply ?? streamedReply,
        suggestions: cleaned,
      });
      send("final", result);
      res.end();
    } catch (err) {
      req.log.error({ err }, "compass completion failed");
      send("error", {
        error: err instanceof Error ? err.message : "Compass request failed",
      });
      res.end();
    }
  },
);

type CleanedSuggestion = z.infer<typeof Suggestion>;

function cleanSuggestions(
  raw: Array<Record<string, unknown>>,
  opts: {
    validNodeIds: Set<string>;
    validRealmIds: Set<string>;
    allowNodeAndRelationship: boolean;
  },
): CleanedSuggestion[] {
  const limited = raw.slice(0, COMPASS_MAX_SUGGESTIONS);
  // Two-pass clean. Pass 1 validates every non-relationship suggestion
  // and records tempIds *only from nodes that actually survived
  // validation* (we used to harvest tempIds from raw model output,
  // which let relationships referencing dropped/invalid nodes survive
  // cleaning and produce broken `temp:*` cards on the client).
  // Pass 2 validates relationships against {validNodeIds ∪ surviving
  // tempIds}. The two passes are then merged back together in the
  // model's original suggestion order so the rendered batch matches
  // the model's intent.
  const tempIdsInBatch = new Set<string>();
  type Slot = { idx: number; sug: CleanedSuggestion };
  const slots: Slot[] = [];
  const pushSlot = (idx: number, sug: CleanedSuggestion) => {
    slots.push({ idx, sug });
  };

  // Pass 1: everything except relationships.
  limited.forEach((s, idx) => {
    const t = s["type"];
    if (t === "node" && opts.allowNodeAndRelationship) {
      // Defensive normalization: even with the schema-enforced split, models
      // occasionally dump everything into one field on long, multi-paragraph
      // prompts. Recover sensible (title, content) pairs without losing the
      // user's prose.
      let title = typeof s["title"] === "string" ? s["title"].trim() : "";
      let content = typeof s["content"] === "string" ? s["content"] : "";
      // Case A: title is empty but content has prose — derive a short title
      // from the first non-empty line of the content.
      if (!title && content.trim()) {
        const firstLine =
          content.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
        title = firstLine || content.trim().slice(0, 80);
      }
      // Case B: model jammed both the label AND the body into the title
      // (multi-line title, or single-line title way over the cap). Split on
      // the first newline if present, otherwise hoist the long title into
      // content and derive a tight title from its first line/sentence.
      if (title.includes("\n")) {
        const lines = title.split(/\r?\n/);
        const head = (lines[0] ?? "").trim();
        const tail = lines.slice(1).join("\n").trim();
        title = head;
        if (tail) content = content ? `${tail}\n\n${content}` : tail;
      }
      if (title.length > 100) {
        if (!content.trim()) content = title;
        // Try a sentence boundary first; fall back to a hard cut.
        const sentenceEnd = title.search(/[.!?]\s/);
        const cut =
          sentenceEnd > 0 && sentenceEnd <= 80
            ? title.slice(0, sentenceEnd).trim()
            : title.slice(0, 77).trim();
        title = cut.length > 0 ? `${cut}${cut.length < title.length ? "…" : ""}` : title.slice(0, 80);
      }
      // Final guardrails before validation.
      title = title.replace(/\s+/g, " ").trim().slice(0, 100);
      if (!title) title = "Untitled";
      const rawTempId = typeof s["tempId"] === "string" ? s["tempId"] : "";
      const tempId =
        rawTempId.startsWith("temp:") && rawTempId.length > 5
          ? rawTempId
          : undefined;
      const r = SuggestedNode.safeParse({
        type: "node",
        title,
        kind: s["kind"],
        content,
        tags: s["tags"] ?? [],
        ...(tempId ? { tempId } : {}),
      });
      if (r.success) {
        pushSlot(idx, r.data);
        if (r.data.tempId) tempIdsInBatch.add(r.data.tempId);
      }
    } else if (t === "relationship" && opts.allowNodeAndRelationship) {
      // Deferred to pass 2 below so endpoints can be checked against
      // tempIds from nodes that actually survived validation.
    } else if (t === "create_realm") {
      const r = SuggestedCreateRealm.safeParse({
        type: "create_realm",
        name: s["name"],
        description:
          typeof s["description"] === "string" && s["description"]
            ? s["description"]
            : undefined,
      });
      if (r.success) pushSlot(idx, r.data);
    } else if (t === "switch_realm") {
      const r = SuggestedSwitchRealm.safeParse({
        type: "switch_realm",
        realmId: s["realmId"],
        realmName: s["realmName"],
      });
      if (r.success && opts.validRealmIds.has(r.data.realmId)) {
        pushSlot(idx, r.data);
      }
    } else if (t === "edit_node" && opts.allowNodeAndRelationship) {
      const r = SuggestedEditNode.safeParse({
        type: "edit_node",
        nodeId: s["nodeId"],
        nodeTitle: s["nodeTitle"],
        proposedContent: s["proposedContent"],
        summary:
          typeof s["summary"] === "string" && s["summary"]
            ? s["summary"]
            : undefined,
      });
      if (r.success && opts.validNodeIds.has(r.data.nodeId)) {
        pushSlot(idx, r.data);
      }
    } else if (t === "clarify") {
      const rawOpts = Array.isArray(s["options"])
        ? (s["options"] as Array<Record<string, unknown>>)
            .map((o) => ({
              label: typeof o["label"] === "string" ? o["label"] : "",
              prompt: typeof o["prompt"] === "string" ? o["prompt"] : "",
            }))
            .filter((o) => o.label && o.prompt)
        : [];
      const r = SuggestedClarify.safeParse({
        type: "clarify",
        question: s["question"],
        options: rawOpts,
      });
      if (r.success) pushSlot(idx, r.data);
    } else if (t === "start_guide") {
      const r = SuggestedStartGuide.safeParse({
        type: "start_guide",
        guideId: s["guideId"],
        caption:
          typeof s["caption"] === "string" && s["caption"]
            ? s["caption"]
            : undefined,
        kindHint:
          typeof s["kindHint"] === "string" && s["kindHint"]
            ? s["kindHint"]
            : undefined,
      });
      if (r.success) pushSlot(idx, r.data);
    }
  });

  // Pass 2: relationships, now validated against the tempIds of nodes
  // that *survived* pass 1.
  if (opts.allowNodeAndRelationship) {
    limited.forEach((s, idx) => {
      if (s["type"] !== "relationship") return;
      const r = SuggestedRelationship.safeParse({
        type: "relationship",
        fromNodeId: s["fromNodeId"],
        toNodeId: s["toNodeId"],
        label: s["label"] ?? "",
      });
      if (
        r.success &&
        (opts.validNodeIds.has(r.data.fromNodeId) ||
          tempIdsInBatch.has(r.data.fromNodeId)) &&
        (opts.validNodeIds.has(r.data.toNodeId) ||
          tempIdsInBatch.has(r.data.toNodeId)) &&
        r.data.fromNodeId !== r.data.toNodeId
      ) {
        pushSlot(idx, r.data);
      }
    });
  }

  // Restore the model's original suggestion order.
  slots.sort((a, b) => a.idx - b.idx);
  return slots.map((s) => s.sug);
}

const GlobalCompassResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "suggestions"],
  properties: {
    reply: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "name",
          "description",
          "realmId",
          "realmName",
          "guideId",
          "caption",
          "kindHint",
          "question",
          "options",
        ],
        properties: {
          type: {
            type: "string",
            enum: ["create_realm", "switch_realm", "start_guide", "clarify"],
          },
          name: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          realmId: { type: ["string", "null"] },
          realmName: { type: ["string", "null"] },
          guideId: {
            type: ["string", "null"],
            enum: [...GUIDE_IDS, null],
          },
          caption: { type: ["string", "null"] },
          kindHint: { type: ["string", "null"] },
          question: { type: ["string", "null"] },
          options: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "prompt"],
              properties: {
                label: { type: "string" },
                prompt: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const GlobalCompassBody = CompassBody;

router.post(
  "/compass",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!openai) {
      res.status(503).json({
        error:
          "AI integration not configured. Missing AI_INTEGRATIONS_OPENAI_* env vars.",
      });
      return;
    }

    const userId = req.userId!;
    const parsed = GlobalCompassBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Load a high-level summary of realms the user owns or collaborates on.
    const owned = await db
      .select({ id: realmsTable.id, name: realmsTable.name })
      .from(realmsTable)
      .where(eq(realmsTable.ownerUserId, userId));
    const shared = await db
      .select({ id: realmsTable.id, name: realmsTable.name })
      .from(realmCollaboratorsTable)
      .innerJoin(
        realmsTable,
        eq(realmsTable.id, realmCollaboratorsTable.realmId),
      )
      .where(
        and(
          eq(realmCollaboratorsTable.userId, userId),
          isNotNull(realmCollaboratorsTable.acceptedAt),
        ),
      );
    const seen = new Set<string>();
    const realms = [...owned, ...shared].filter((r) =>
      seen.has(r.id) ? false : (seen.add(r.id), true),
    );

    const realmLines = realms.length
      ? realms.map((r) => `- [${r.id}] ${r.name}`).join("\n")
      : "(the user has no realms yet)";

    const systemPrompt = `You are Compass, a friendly AI companion inside a worldbuilding app called Canvas Realms. Right now no realm is open in the workspace, so you're in "global helper" mode.

${COMPASS_HOUSE_RULES}

You can help the user in three ways:
1. Answer general questions about the app, writing, or worldbuilding.
2. Walk the user through how to do something using the "start_guide" suggestion. Pick the guide from the catalog that best matches what the user asked for. Available guides:
${GUIDE_CATALOG}
   Compass is already open (you are Compass) — never suggest a guide that would just open Compass.
3. Offer to create a new realm with the "create_realm" suggestion when the user wants to start a new world. Or, if a realm they already have fits, offer "switch_realm" to one of the realms below.

The user's existing realms (id in brackets):
${realmLines}

DEVICE / VIEWPORT: ${
      parsed.data.viewport?.isMobile
        ? `the user is on MOBILE (viewport ${parsed.data.viewport.width ?? "?"}x${parsed.data.viewport.height ?? "?"}). The library/realm list is HIDDEN behind a drawer toggle in the top bar — they MUST tap the menu/library toggle to open the drawer first before they can see realm rows or the + button. Use tap-first language ("tap"/"swipe"), not "click". The "switch-realm" / "create-realm" guides already include the open-drawer step automatically.`
        : `the user is on DESKTOP (viewport ${parsed.data.viewport?.width ?? "?"}x${parsed.data.viewport?.height ?? "?"}). The library is pinned open on the left and realm rows are visible without opening anything. Use "click"/"select" language. Don't tell them to "open the library first" — it's already there.`
    }

Rules:
- Keep "reply" short and conversational (1-2 short paragraphs). Don't dump long explanations of the UI when a guide can show the user instead.
- Prefer "start_guide" over a wall of text whenever the user asks "how do I..." or "where do I..." or "take me to...".
- JSON SAFETY: every string field you emit must be a valid JSON string. Escape every literal " as \\", every backslash as \\\\, every newline as \\n, every tab as \\t. A single unescaped quote or raw newline corrupts the whole reply.
- Only emit "switch_realm" with realmIds from the list above. Never invent ids.
- "create_realm" should only be emitted when the user is asking to create one or asking how to start. Pick a name that fits what the user described, or "Untitled Realm" if they were vague.
- ASK BEFORE GUESSING: if the user's request is ambiguous (e.g. "I want to add something", "what should I make next") or doesn't map cleanly to a guide / a new realm / switching realms, emit a "clarify" suggestion: a short question plus 2-5 clickable options. Each option's "label" is the short button text; each option's "prompt" is the EXACT message that will be re-sent as their next turn if they tap it (write it as if it were them speaking — e.g. "Take me to the Erydon realm"). Include a final "Something else" option that asks them to describe in their own words. Keep "reply" to one sentence framing the question.
- After the user picks an option (their next turn will be the option's "prompt"), THEN respond with the appropriate guide / realm switch / realm creation.
- For unused fields on a suggestion, set them to null.
- Always emit the "reply" field BEFORE the "suggestions" field so it can stream first.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] =
      [
        { role: "system", content: systemPrompt },
        ...(parsed.data.history ?? []).map(
          (m: z.infer<typeof ChatMessage>) => ({
            role: m.role,
            content: m.content,
          }),
        ),
        { role: "user", content: parsed.data.message },
      ];

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 2048,
        messages,
        stream: true,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "compass_global_response",
            strict: true,
            schema: GlobalCompassResponseSchema,
          },
        },
      });

      const extractReply = createReplyExtractor();
      let raw = "";
      let streamedReply = "";
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      for await (const chunk of stream) {
        if (aborted) break;
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        raw += delta;
        const replyDelta = extractReply(delta);
        if (replyDelta) {
          streamedReply += replyDelta;
          send("reply_delta", { delta: replyDelta });
        }
      }

      if (aborted) {
        res.end();
        return;
      }

      const parsedRaw = tryParseModelJson<{
        reply?: string;
        suggestions?: Array<Record<string, unknown>>;
      }>(raw || "{}", (info) => {
        req.log.warn(
          { ...info, route: "compass-global" },
          "compass JSON parse recovered after repair",
        );
      });

      if (!parsedRaw) {
        const salvaged = salvageSuggestionsFromRaw(raw);
        const cleanedSalvaged = cleanSuggestions(
          salvaged as Array<Record<string, unknown>>,
          {
            validNodeIds: new Set(),
            validRealmIds: new Set(realms.map((r) => r.id)),
            allowNodeAndRelationship: false,
          },
        );
        req.log.warn(
          {
            rawLength: raw.length,
            streamedReplyLength: streamedReply.length,
            salvagedCount: salvaged.length,
            keptCount: cleanedSalvaged.length,
            route: "compass-global",
          },
          "compass JSON parse failed even after repair; salvaging streamed reply + per-item suggestions",
        );
        send("final", { reply: streamedReply, suggestions: cleanedSalvaged });
        res.end();
        return;
      }

      const cleaned = cleanSuggestions(parsedRaw.suggestions ?? [], {
        validNodeIds: new Set(),
        validRealmIds: new Set(realms.map((r) => r.id)),
        allowNodeAndRelationship: false,
      });

      const result = CompassResponse.parse({
        reply: parsedRaw.reply ?? streamedReply,
        suggestions: cleaned,
      });
      send("final", result);
      res.end();
    } catch (err) {
      req.log.error({ err }, "global compass completion failed");
      send("error", {
        error: err instanceof Error ? err.message : "Compass request failed",
      });
      res.end();
    }
  },
);

// ---------------------------------------------------------------------------
// Voice mode (Compass voice conversation)
// ---------------------------------------------------------------------------
//
// Two thin proxy endpoints power voice mode in the Compass sidebar:
//
//   GET  /compass/voice/status   — tells the client whether voice is enabled
//   POST /compass/voice/stt      — raw audio in → transcript JSON out
//   POST /compass/voice/tts      — { text } in → streamed audio/mpeg out
//
// The actual conversation continues to flow through /compass and
// /realms/:realmId/compass (text). Voice mode is just a shell that records
// the user, transcribes via STT, sends the transcript through the existing
// chat endpoint, then plays the reply through TTS.
//
// All three routes degrade gracefully when ELEVENLABS_API_KEY is missing —
// /status returns { enabled: false } and the sidebar hides the mic button.

router.get("/compass/voice/status", (_req, res): void => {
  res.json({ enabled: Boolean(elevenLabsApiKey) });
});

router.post(
  "/compass/voice/stt",
  async (req, res): Promise<void> => {
    if (!elevenLabsApiKey) {
      res.status(503).json({
        error:
          "Voice mode is not configured on this server. Missing ELEVENLABS_API_KEY.",
      });
      return;
    }

    // `express.raw` populates req.body as a Buffer for this path (see
    // app.ts). Reject anything that didn't arrive as bytes — the client
    // should always send an audio blob, never JSON.
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Expected raw audio bytes in body." });
      return;
    }

    // The browser tags the upload with its actual recorded MIME type via
    // Content-Type. We forward it verbatim to ElevenLabs in the multipart
    // file part so Scribe can pick the right decoder.
    const contentType =
      (req.headers["content-type"] as string | undefined) || "audio/webm";

    try {
      // Build the multipart request manually so we don't add a runtime
      // dependency on form-data just for two fields. Node 20+ supports
      // FormData + Blob natively, which is sufficient here.
      const form = new FormData();
      form.append("model_id", COMPASS_STT_MODEL);
      form.append(
        "file",
        new Blob([new Uint8Array(body)], { type: contentType }),
        // Filename hints the extension; ElevenLabs uses the Blob's type
        // for actual decoding so the suffix is purely cosmetic.
        `audio.${contentType.includes("mp4") ? "mp4" : contentType.includes("ogg") ? "ogg" : contentType.includes("wav") ? "wav" : "webm"}`,
      );

      const upstream = await fetch(
        `${ELEVENLABS_BASE}/v1/speech-to-text`,
        {
          method: "POST",
          headers: { "xi-api-key": elevenLabsApiKey },
          body: form,
        },
      );

      if (!upstream.ok) {
        const text = await upstream.text();
        req.log.warn(
          { status: upstream.status, body: text.slice(0, 500) },
          "ElevenLabs STT failed",
        );
        res.status(502).json({
          error: `Speech-to-text failed (${upstream.status})`,
        });
        return;
      }

      const data = (await upstream.json()) as {
        text?: string;
        language_code?: string;
      };
      res.json({
        transcript: (data.text ?? "").trim(),
        language: data.language_code ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "compass STT failed");
      res
        .status(502)
        .json({ error: err instanceof Error ? err.message : "STT failed" });
    }
  },
);

const CompassTtsBody = z.object({
  text: z.string().min(1).max(5_000),
});

router.post(
  "/compass/voice/tts",
  async (req, res): Promise<void> => {
    if (!elevenLabsApiKey) {
      res.status(503).json({
        error:
          "Voice mode is not configured on this server. Missing ELEVENLABS_API_KEY.",
      });
      return;
    }

    const parsed = CompassTtsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Strip markdown that does not survive being read aloud: heading
    // markers, list bullets, bold/italic asterisks, [[wiki-style]] link
    // wrappers, and code fences. Keeping the prose unchanged keeps the
    // voice natural without inventing words for "asterisk asterisk".
    const spoken = parsed.data.text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    if (!spoken) {
      res.status(400).json({ error: "Nothing speakable in text." });
      return;
    }

    try {
      const upstream = await fetch(
        `${ELEVENLABS_BASE}/v1/text-to-speech/${COMPASS_VOICE_ID}/stream?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenLabsApiKey,
            "Content-Type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: spoken,
            model_id: COMPASS_TTS_MODEL,
          }),
        },
      );

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => "");
        req.log.warn(
          { status: upstream.status, body: text.slice(0, 500) },
          "ElevenLabs TTS failed",
        );
        res.status(502).json({
          error: `Text-to-speech failed (${upstream.status})`,
        });
        return;
      }

      res.status(200);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Accel-Buffering", "no");

      // Pipe the upstream MP3 stream straight to the client so playback
      // can start before the full clip has been synthesised.
      const reader = upstream.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          if (!res.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        }
      }
      res.end();
    } catch (err) {
      req.log.error({ err }, "compass TTS failed");
      if (!res.headersSent) {
        res.status(502).json({
          error: err instanceof Error ? err.message : "TTS failed",
        });
      } else {
        res.end();
      }
    }
  },
);

export default router;
