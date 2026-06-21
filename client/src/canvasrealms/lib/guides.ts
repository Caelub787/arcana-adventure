export type GuideStep = {
  // Selectors to try in order. The first one that finds a visible element on
  // the page is used as the highlight target for this step.
  selectors: string[];
  // Short caption shown next to the highlighted element.
  caption: string;
  // If true and no element is found within the discovery window, skip this
  // step instead of failing the guide. Useful for steps that are conditional
  // on viewport (e.g. mobile-only "open the library drawer first") or that
  // depend on user data that may not exist (e.g. "tap a node" when the realm
  // has none yet).
  optional?: boolean;
  // If true and a non-optional step's target never appears (or its templated
  // selectors can't be substituted), end the guide with its `finalCaption`
  // confirmation toast instead of cancelling silently. Use only for steps
  // where "the user already saw the prior step, so calling it done is fine"
  // — e.g. the create-node kind picker after + New was already highlighted.
  endGracefullyOnTimeout?: boolean;
};

export type Guide = {
  id: string;
  title: string;
  steps: GuideStep[];
  // Brief confirmation shown at the end.
  finalCaption?: string;
};

// Stable identifiers for in-app guidance. Keep these in sync with GUIDE_IDS
// in artifacts/api-server/src/routes/compass.ts.
//
// Design rules for guides:
// - Compass is the only surface that suggests guides, so Compass is always
//   already open when a guide starts. Never include a step that "opens
//   Compass".
// - Guides operate in the context of the currently open realm. Never include
//   a step that asks the user to pick or switch realms unless the guide is
//   explicitly about switching realms. The active realm's nodes are already
//   what `[data-guide="node-row"]` matches in the library.
// - Take the SHORTEST path from where the user is right now to the action
//   they asked about. Mobile-only "open the drawer" steps are marked
//   optional so they auto-skip on desktop where the panel is always visible.
export const GUIDES: Record<string, Guide> = {
  "open-library": {
    id: "open-library",
    title: "Tour the library",
    steps: [
      {
        selectors: ['[data-guide="library-toggle"]'],
        caption: "Open your library.",
        optional: true,
      },
      {
        selectors: [
          '[data-guide="library-panel"]',
        ],
        caption: "This is your library — every realm and node lives here.",
      },
      {
        selectors: [
          '[data-guide="realm-row"]',
          '[data-guide="new-realm"]',
          '[data-guide="new-realm-empty"]',
        ],
        caption: "Your realms sit at the top. Tap one to enter, or use + to start a new world.",
      },
      {
        selectors: ['[data-guide="node-row"]'],
        caption: "Inside the open realm, every node shows up under it — tap to open one.",
        optional: true,
      },
    ],
    finalCaption: "That's the library.",
  },
  "create-realm": {
    id: "create-realm",
    title: "Create a realm",
    steps: [
      {
        selectors: ['[data-guide="library-toggle"]'],
        caption: "Open your library first.",
        optional: true,
      },
      {
        selectors: [
          '[data-guide="new-realm"]',
          '[data-guide="new-realm-empty"]',
        ],
        caption: "Tap + to spin up a new realm.",
      },
    ],
    finalCaption: "Name your realm and you're off.",
  },
  "switch-realm": {
    id: "switch-realm",
    title: "Switch realms",
    steps: [
      {
        selectors: ['[data-guide="library-toggle"]'],
        caption: "Open your library.",
        optional: true,
      },
      {
        selectors: ['[data-guide="realm-row"]'],
        caption: "Tap any realm here to jump into it.",
      },
    ],
    finalCaption: "Welcome to the new realm.",
  },
  "create-node": {
    id: "create-node",
    title: "Create a node",
    steps: [
      // Mobile-only: the + New button lives inside the library drawer, which
      // is hidden behind the library-toggle on small viewports. On desktop
      // (lg+) the toggle button is `lg:hidden` so this step finds nothing
      // and is skipped automatically by the overlay.
      {
        selectors: ['[data-guide="library-toggle"]'],
        caption: "Open your library so you can see the + New button.",
        optional: true,
      },
      {
        selectors: ['[data-guide="new-node"]'],
        caption: "Tap + to open the kind picker.",
      },
      // Second step: if the suggestion carried a kindHint
      // (e.g. "character"), highlight that specific menu item once the
      // dropdown opens. Selectors are templated and substituted with the
      // guide's params at runtime — see GuideOverlay. When no kindHint is
      // provided, the templated selector has no substitute and the step
      // is skipped immediately by the overlay. When a kindHint IS
      // provided, treat it as a real step (the menu's portal mount +
      // open animation can take well over 350ms to paint a visible
      // target). If the menu never opens or the kind isn't in it, the
      // overlay falls back to ending the guide gracefully.
      {
        selectors: ['[data-guide="new-node-kind-{kindHint}"]'],
        caption: "Pick this kind from the menu.",
        endGracefullyOnTimeout: true,
      },
    ],
    finalCaption: "Name your node and you're in.",
  },
  "open-node": {
    id: "open-node",
    title: "Open a node",
    steps: [
      {
        selectors: ['[data-guide="library-toggle"]'],
        caption: "Open your library.",
        optional: true,
      },
      {
        selectors: ['[data-guide="node-row"]'],
        caption: "Tap a node to open it in the workspace.",
      },
      {
        selectors: ['[data-guide="new-node"]'],
        caption: "No node yet? Use + to create one.",
        optional: true,
      },
    ],
    finalCaption: "Your node is open and ready to edit.",
  },
  "open-document-compass": {
    id: "open-document-compass",
    title: "Edit a node with Compass",
    steps: [
      {
        selectors: ['[data-guide="document-compass"]'],
        caption: "Tap Compass to expand, rewrite, or continue your prose.",
      },
    ],
    finalCaption: "Compass is now editing this node with you.",
  },
};

export type GuideId = keyof typeof GUIDES;

export function getGuide(id: string): Guide | null {
  return GUIDES[id] ?? null;
}
