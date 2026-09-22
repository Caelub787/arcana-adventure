// The tutorial's actual content: what to point at and what to say, grouped
// into named sections. Everything here is data - TutorialOverlay/
// TutorialRunner (the engine, see TutorialOverlay.tsx) don't know or care
// what any of these steps mean, only how to find and highlight their
// targetTestId and run their onEnter.
//
// When a future feature changes or moves a button, or a new one is added,
// this is the one file to update: add/adjust a step (and its testid) here -
// the engine adapts automatically, since it never hardcodes layout, only
// reads whatever rect the named element currently has.
import type { TutorialSection } from "./tutorialTypes";

export interface TutorialContext {
  isMobile: boolean;
  isCA: boolean;
  isGm: boolean;
  /** Opens the demo character's sheet, optionally to a given CA tab (switches tabs if it's already open). If the viewer has no character of their own, this creates a throwaway one first (and the caller deletes it again once the section is done) - so it may take a moment the first time. */
  openDemoCharacterSheet: (tab?: string) => void | Promise<void>;
  /** Opens notes the way this device actually opens them - the side panel on desktop, the full-screen mobile nav on mobile. */
  openNotes: () => void;
}

/**
 * Static id/label/gating metadata for every section, kept separate from the
 * step-building functions below (which need a live TutorialContext) so
 * Settings' per-section replay checklist can list sections without needing
 * one. Keep this in sync with the sectionId/label used in each
 * buildXSection function below - there's no single source of truth for the
 * label text itself, just for which sections exist and in what order.
 */
export const TUTORIAL_SECTION_META: { id: string; label: string; caOnly?: boolean }[] = [
  { id: "getting-around", label: "Getting Around" },
  { id: "side-toolbar", label: "Side Toolbar" },
  { id: "side-panel", label: "Side Panel" },
  { id: "ca-character-sheet", label: "Character Sheet", caOnly: true },
  { id: "workspace-notes", label: "Workspace & Notes" },
  { id: "my-library", label: "My Library" },
];

function buildGettingAroundSection(ctx: TutorialContext): TutorialSection {
  return {
    id: "getting-around",
    label: "Getting Around",
    steps: [
      {
        id: "welcome",
        sectionId: "getting-around",
        title: "Welcome to ArcanaVTT",
        body: "Quick tour of the campaign screen - navigation, tools, your character sheet, and notes. Skip anytime, or come back to it later from Settings.",
      },
      {
        // The corner panel-switcher row this used to preview here got its
        // own dedicated pass right after Side Toolbar (see
        // buildSidePanelSection) - previewing one of its buttons here too
        // meant the tour visited the right side, then the left toolbar,
        // then doubled back to the right side, which read as backtracking.
        id: "nav-search",
        sectionId: "getting-around",
        title: "Quick Search",
        body: "Jump straight to a character, item, or note by name from anywhere in the campaign.",
        targetTestId: "button-global-search",
        optional: true,
      },
    ],
  };
}

function buildSideToolbarSection(): TutorialSection {
  return {
    id: "side-toolbar",
    label: "Side Toolbar",
    steps: [
      {
        id: "toolbar-select",
        sectionId: "side-toolbar",
        title: "Selection Tool",
        body: "The default pointer - click and drag tokens, select multiple with a box.",
        targetTestId: "selection-mode-select",
        placement: "right",
      },
      {
        id: "toolbar-ruler",
        sectionId: "side-toolbar",
        title: "Ruler",
        body: "Measure distance on the map, or check a spell's range and area.",
        targetTestId: "selection-mode-ruler",
        placement: "right",
        optional: true,
      },
      {
        id: "toolbar-camera",
        sectionId: "side-toolbar",
        title: "Camera Controls",
        body: "Press and hold for options to center on your token, reset, or lock the camera in place.",
        targetTestId: "button-camera-controls",
        placement: "right",
        optional: true,
      },
      {
        id: "toolbar-token-options",
        sectionId: "side-toolbar",
        title: "Token Options",
        body: "Press and hold to change how your token moves, or hide names and resource bars.",
        targetTestId: "button-token-options",
        placement: "right",
        optional: true,
      },
      {
        id: "toolbar-notes",
        sectionId: "side-toolbar",
        title: "Quick Notes",
        body: "Open notes directly from the map without leaving what you're doing.",
        targetTestId: "button-notes-battlemap",
        placement: "right",
        optional: true,
      },
    ],
  };
}

// None of these steps drive a panel open: on mobile, every side panel
// (including notes) takes over the FULL screen, which would cover the very
// button this section is pointing at. These steps stay purely descriptive of
// the button row; the panels themselves get their own driven walkthroughs
// later (see buildWorkspaceNotesSection for notes; the others aren't deep
// enough to need one).
function buildSidePanelSection(ctx: TutorialContext): TutorialSection {
  const steps: TutorialSection["steps"] = [
    {
      id: "panel-chat",
      sectionId: "side-panel",
      title: "Chat & Rolls",
      body: "Campaign chat, dice rolls, and the adventure log all live here.",
      targetTestId: "button-panel-chat",
      placement: "left",
    },
    {
      id: "panel-characters",
      sectionId: "side-panel",
      title: "Characters",
      body: "See everyone in the campaign and open any character sheet from here.",
      targetTestId: "button-panel-characters",
      placement: "left",
    },
    {
      id: "panel-initiative",
      sectionId: "side-panel",
      title: "Initiative",
      body: "Track turn order once combat starts.",
      targetTestId: "button-panel-initiative",
      placement: "left",
      optional: true,
    },
    {
      id: "panel-notes",
      sectionId: "side-panel",
      title: "Notes",
      body: "Your campaign's shared notes and wiki - covered in its own section shortly.",
      targetTestId: "button-panel-notes",
      placement: "left",
    },
  ];
  if (ctx.isGm) {
    steps.push({
      id: "panel-scene",
      sectionId: "side-panel",
      title: "Scene Management",
      body: "GM-only: manage maps, fog of war, and scene settings.",
      targetTestId: "button-panel-scene",
      placement: "left",
      optional: true,
    });
  }
  steps.push({
    id: "panel-settings",
    sectionId: "side-panel",
    title: "Settings",
    body: "Campaign settings, invite codes, and member management - also where you can restart this tutorial later.",
    targetTestId: "button-panel-settings",
    placement: "left",
  });
  return { id: "side-panel", label: "Side Panel", steps };
}

function buildCASheetSection(ctx: TutorialContext): TutorialSection | null {
  if (!ctx.isCA) return null;
  return {
    id: "ca-character-sheet",
    label: "Character Sheet",
    steps: [
      {
        id: "ca-overview-tab",
        sectionId: "ca-character-sheet",
        title: "Overview",
        body: "Your character's portrait, rank, energy, and wounds all live on this first tab.",
        targetTestId: "tab-overview",
        onEnter: () => ctx.openDemoCharacterSheet("overview"),
      },
      {
        id: "ca-rank",
        sectionId: "ca-character-sheet",
        title: "Rank",
        body: "Rank rises as your energy pool grows - Bronze, Silver, Gold, Obsidian, then Terran. It sets your lifespan and unlocks stars along the way.",
        targetTestId: "ca-section-rank",
        onEnter: () => ctx.openDemoCharacterSheet("overview"),
        optional: true,
      },
      {
        id: "ca-energy",
        sectionId: "ca-character-sheet",
        title: "Energy",
        body: "Your energy pool - what you spend to use abilities, and what determines your Rank.",
        targetTestId: "ca-section-energy",
        onEnter: () => ctx.openDemoCharacterSheet("overview"),
        optional: true,
      },
      {
        id: "ca-wounds",
        sectionId: "ca-character-sheet",
        title: "Wounds",
        body: "Wounds replace hit points here - mark one when you take a real injury, and note what it is and its effect. This is narrative, tracked by your GM's rulings rather than an automatic formula.",
        targetTestId: "ca-section-wounds",
        onEnter: () => ctx.openDemoCharacterSheet("overview"),
        optional: true,
      },
      {
        id: "ca-skills-tab",
        sectionId: "ca-character-sheet",
        title: "Skills",
        body: "Your six attributes and the skills under each.",
        targetTestId: "tab-skills",
        onEnter: () => ctx.openDemoCharacterSheet("skills"),
      },
      {
        id: "ca-attribute",
        sectionId: "ca-character-sheet",
        title: "Attributes",
        body: "Each attribute's value sets the die every skill under it rolls - higher attributes roll bigger dice.",
        targetTestId: "card-ca-attr-might",
        onEnter: () => ctx.openDemoCharacterSheet("skills"),
        optional: true,
      },
      {
        id: "ca-skill-row",
        sectionId: "ca-character-sheet",
        title: "Skills",
        body: "Tap a skill to roll it. Double-click (or press and hold) its value to edit the base number directly.",
        targetTestId: "row-ca-skill-athletics",
        onEnter: () => ctx.openDemoCharacterSheet("skills"),
        optional: true,
      },
      {
        id: "ca-ability-tab",
        sectionId: "ca-character-sheet",
        title: "Ability",
        body: "Your character's unique Ability and its rolls - a GM can also assign Beast Orbs here for you to absorb.",
        targetTestId: "tab-ability",
        onEnter: () => ctx.openDemoCharacterSheet("ability"),
      },
      {
        id: "ca-inventory-tab",
        sectionId: "ca-character-sheet",
        title: "Inventory",
        body: "Everything your character carries, plus any custom items your GM has made.",
        targetTestId: "tab-inventory",
        onEnter: () => ctx.openDemoCharacterSheet("inventory"),
      },
      {
        id: "ca-traits-tab",
        sectionId: "ca-character-sheet",
        title: "Traits",
        body: "Descriptive traits and features, each with its own rolls if it needs them.",
        targetTestId: "tab-traits",
        onEnter: () => ctx.openDemoCharacterSheet("traits"),
      },
    ],
  };
}

function buildWorkspaceNotesSection(ctx: TutorialContext): TutorialSection {
  return {
    id: "workspace-notes",
    label: "Workspace & Notes",
    steps: [
      {
        // No onEnter here - on mobile, opening notes takes over the FULL
        // screen, which would cover this very button. The next two steps
        // drive it open once we're no longer pointing at the button itself.
        id: "notes-open",
        sectionId: "workspace-notes",
        title: "Notes",
        body: "Your campaign's shared wiki - session notes, lore, and anything else worth writing down. Everyone sees what's shared with them; the GM can keep some of it secret.",
        targetTestId: "button-panel-notes",
        placement: "left",
      },
      {
        id: "notes-new",
        sectionId: "workspace-notes",
        title: "Creating Notes",
        body: "Add a folder, note, canvas, table, scene, or book from here.",
        targetTestId: "button-sidebar-new",
        onEnter: () => ctx.openNotes(),
        optional: true,
      },
      {
        id: "notes-workspace",
        sectionId: "workspace-notes",
        title: "Full Workspace",
        body: "Open several notes at once, side by side, in their own resizable windows.",
        targetTestId: "button-open-notes-workspace",
        onEnter: () => ctx.openNotes(),
        optional: true,
      },
    ],
  };
}

function buildMyLibrarySection(): TutorialSection {
  return {
    id: "my-library",
    label: "My Library",
    steps: [
      {
        id: "my-library",
        sectionId: "my-library",
        title: "My Library",
        body: "Your own collection of items, spells, and other content you can reuse across any of your campaigns. It opens outside this campaign, so we won't jump into it now - just know it's there.",
        targetTestId: "button-panel-my-library",
        placement: "left",
        optional: true,
      },
      {
        id: "wrap-up",
        sectionId: "my-library",
        title: "You're all set",
        body: "That's the tour. You can replay all of this, or just one section of it, anytime from Settings.",
      },
    ],
  };
}

/** Builds every section relevant to this campaign/role/device, in tour order, filtering out any that don't apply (e.g. the CA section for a non-CA campaign). */
export function buildTutorialSections(ctx: TutorialContext): TutorialSection[] {
  return [
    buildGettingAroundSection(ctx),
    buildSideToolbarSection(),
    buildSidePanelSection(ctx),
    buildCASheetSection(ctx),
    buildWorkspaceNotesSection(ctx),
    buildMyLibrarySection(),
  ].filter((s): s is TutorialSection => s !== null);
}
