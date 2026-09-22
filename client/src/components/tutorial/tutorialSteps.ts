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
  /** Force-reveals the Camera Controls hold-menu's hidden Reset/Lock buttons, so a step can highlight one without faking a real pointer hold. */
  openCameraOptions: () => void;
  /** Force-reveals the Token Options hold-menu's hidden Names/Bars buttons. */
  openTokenOptions: () => void;
  /** Closes whichever hold-menu the two methods above forced open. There's no onExit hook on a step, so every Side Toolbar step calls this or one of the two above to leave the toolbar in the right state for the next step. */
  closeHoldMenus: () => void;
  /** The data-testid of the viewer's own pinned tracker chip, once demoPlayerTracker has pinned it (or it was already pinned). Fixed per-user, so it's safe to use as a step's targetTestId directly. */
  pinnedSelfChipTestId: string;
  /** Pins the viewer to the shared player tracker for the demo, if they aren't shown there already - resolves once the pin is reflected locally, so the very next step can rely on the chip actually being on screen. */
  demoPlayerTracker: () => Promise<void>;
  /** Injects one fake roll onto the viewer's own tracker chip, purely client-side - triggers the same tumble-and-reveal animation a real roll does. */
  showFakeRollNotification: () => void;
  /** Unpins the viewer again if demoPlayerTracker was the one who pinned them, and clears the fake roll. Safe to call unconditionally. */
  endPlayerTrackerDemo: () => void;
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
  { id: "player-tracker", label: "Player Tracker" },
  { id: "side-panel", label: "Side Panel" },
  { id: "workspace-notes", label: "Workspace & Notes" },
  { id: "my-library", label: "My Library" },
  { id: "ca-character-sheet", label: "Character Sheet", caOnly: true },
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

function buildSideToolbarSection(ctx: TutorialContext): TutorialSection {
  const steps: TutorialSection["steps"] = [
    {
      id: "toolbar-select",
      sectionId: "side-toolbar",
      title: "Selection Tool",
      body: "The default pointer - click and drag tokens, select multiple with a box.",
      targetTestId: "selection-mode-select",
      placement: "right",
      onEnter: ctx.closeHoldMenus,
    },
    {
      id: "toolbar-ruler",
      sectionId: "side-toolbar",
      title: "Ruler",
      body: "Measure distance on the map, or check a spell's range and area.",
      targetTestId: "selection-mode-ruler",
      placement: "right",
      optional: true,
      onEnter: ctx.closeHoldMenus,
    },
    {
      id: "toolbar-camera",
      sectionId: "side-toolbar",
      title: "Camera Controls",
      body: "Click to center the camera on your token. Press and hold for more options.",
      targetTestId: "button-camera-controls",
      placement: "right",
      optional: true,
      onEnter: ctx.closeHoldMenus,
    },
    {
      id: "toolbar-camera-reset",
      sectionId: "side-toolbar",
      title: "Reset Camera",
      body: "Snaps the camera back to its starting position and zoom.",
      targetTestId: "button-camera-controls-option-reset",
      placement: "right",
      optional: true,
      onEnter: ctx.openCameraOptions,
    },
    {
      id: "toolbar-camera-lock",
      sectionId: "side-toolbar",
      title: "Lock Camera",
      body: "Locks the camera in place so it can't be accidentally dragged or zoomed - handy for spectating or streaming.",
      targetTestId: "button-camera-controls-option-lock",
      placement: "right",
      optional: true,
      onEnter: ctx.openCameraOptions,
    },
    {
      id: "toolbar-token-options",
      sectionId: "side-toolbar",
      title: "Token Options",
      body: "Click to change how your token moves. Press and hold for more options.",
      targetTestId: "button-token-options",
      placement: "right",
      optional: true,
      onEnter: ctx.closeHoldMenus,
    },
    {
      id: "toolbar-token-names",
      sectionId: "side-toolbar",
      title: "Hide Token Names",
      body: "Toggles whether your token's name label shows on the map.",
      targetTestId: "button-token-options-option-names",
      placement: "right",
      optional: true,
      onEnter: ctx.openTokenOptions,
    },
    {
      id: "toolbar-token-bars",
      sectionId: "side-toolbar",
      title: "Hide Resource Bars",
      body: "Toggles whether your token shows its resource bars on the map.",
      // Only rendered for systems with a wound/resource bar (C.A. included) -
      // optional so the tour skips it cleanly everywhere else.
      targetTestId: "button-token-options-option-bars",
      placement: "right",
      optional: true,
      onEnter: ctx.openTokenOptions,
    },
    {
      id: "toolbar-notes",
      sectionId: "side-toolbar",
      title: "Quick Notes",
      body: "Open notes directly from the map without leaving what you're doing.",
      targetTestId: "button-notes-battlemap",
      placement: "right",
      optional: true,
      onEnter: ctx.closeHoldMenus,
    },
  ];
  if (ctx.isGm) {
    steps.push(
      {
        id: "toolbar-player-viewports",
        sectionId: "side-toolbar",
        title: "Player Screens",
        body: "GM-only: see exactly what each player is currently looking at on the map.",
        targetTestId: "button-toggle-player-viewports",
        placement: "right",
        optional: true,
        onEnter: ctx.closeHoldMenus,
      },
      {
        id: "toolbar-clear-placed-items",
        sectionId: "side-toolbar",
        title: "Clear Placed Items",
        body: "GM-only: clears every thrown or dropped item from the battlefield at once. Only shows up once something's actually been placed.",
        targetTestId: "button-clear-placed-items",
        placement: "right",
        optional: true,
        onEnter: ctx.closeHoldMenus,
      },
    );
  }
  return { id: "side-toolbar", label: "Side Toolbar", steps };
}

function buildPlayerTrackerSection(ctx: TutorialContext): TutorialSection {
  return {
    id: "player-tracker",
    label: "Player Tracker",
    steps: [
      {
        id: "tracker-intro",
        sectionId: "player-tracker",
        title: "Player Tracker",
        body: "Pinned players (and any NPCs your GM pins) show up here, with a live wound/energy readout right on their card. You're pinned here just for this demo - unpinned again once it's done, unless you were already showing.",
        targetTestId: ctx.pinnedSelfChipTestId,
        placement: "right",
        onEnter: () => ctx.demoPlayerTracker(),
      },
      {
        id: "tracker-roll",
        sectionId: "player-tracker",
        title: "Live Rolls",
        body: "Every roll shows up here the instant it happens, with a brief tumble before it settles - here's what that looks like.",
        targetTestId: ctx.pinnedSelfChipTestId,
        placement: "right",
        onEnter: () => ctx.showFakeRollNotification(),
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
  const onOverview = () => ctx.openDemoCharacterSheet("overview");
  const onSkills = () => ctx.openDemoCharacterSheet("skills");
  const onAbility = () => ctx.openDemoCharacterSheet("ability");
  const onInventory = () => ctx.openDemoCharacterSheet("inventory");
  const onTraits = () => ctx.openDemoCharacterSheet("traits");
  const steps: TutorialSection["steps"] = [];
  steps.push(
    {
      id: "ca-overview-tab",
      sectionId: "ca-character-sheet",
      title: "Overview",
      body: "Your character's portrait, identity, rank, energy, and wounds all live on this first tab.",
      targetTestId: "tab-overview",
      onEnter: onOverview,
    },
    {
      id: "ca-bio",
      sectionId: "ca-character-sheet",
      title: "Bio",
      body: "Double-click (or long-press) the portrait to change it - and everything around it edits the same way: name, race, DC, speed, fly speed, swim speed, size, lifespan, age, birthday, languages, and your aura color.",
      targetTestId: "container-ca-portrait",
      onEnter: onOverview,
      optional: true,
    },
    {
      id: "ca-rank",
      sectionId: "ca-character-sheet",
      title: "Rank",
      body: "Rank rises as your energy pool grows - Bronze, Silver, Gold, Obsidian, then Terran. It sets your lifespan and unlocks stars along the way.",
      targetTestId: "ca-section-rank",
      onEnter: onOverview,
      optional: true,
    },
    {
      id: "ca-physique",
      sectionId: "ca-character-sheet",
      title: "Physique",
      body: "How much energy your body is built to carry. Going over it doesn't cap your pool - it triggers overload effects your GM configures.",
      targetTestId: "ca-section-physique",
      onEnter: onOverview,
      optional: true,
    },
    {
      id: "ca-energy",
      sectionId: "ca-character-sheet",
      title: "Energy",
      body: "Your energy pool - what you spend to use abilities, and what determines your Rank.",
      targetTestId: "ca-section-energy",
      onEnter: onOverview,
      optional: true,
    },
    {
      id: "ca-wounds",
      sectionId: "ca-character-sheet",
      title: "Wounds",
      body: "Wounds replace hit points here. Click Add Wound and tap the body diagram to place one, then record what it is and its effect - this is narrative, tracked by your GM's rulings rather than an automatic formula. Treat Wound heals one and removes it for good.",
      targetTestId: "ca-section-wounds",
      onEnter: onOverview,
      optional: true,
    },
    {
      id: "ca-skills-tab",
      sectionId: "ca-character-sheet",
      title: "Skills",
      body: "Your six attributes and the skills under each.",
      targetTestId: "tab-skills",
      onEnter: onSkills,
    },
    {
      id: "ca-skills-info",
      sectionId: "ca-character-sheet",
      title: "How Rolling Works",
      body: "Tap this info icon anytime for a refresher on exactly how an attribute's value turns into a die, and how skill rolls use it.",
      targetTestId: "button-ca-skills-info",
      onEnter: onSkills,
      optional: true,
    },
    {
      id: "ca-point-budgets",
      sectionId: "ca-character-sheet",
      title: "Point Budgets",
      body: "Shows how many attribute and skill points you've spent, so you always know what's left to assign.",
      targetTestId: "ca-point-budgets",
      onEnter: onSkills,
      optional: true,
    },
    {
      id: "ca-attribute",
      sectionId: "ca-character-sheet",
      title: "Attributes",
      body: "All six attributes - Might, Finesse, Constitution, Will, Anemos, and Intelligence - work the same way: its value sets the die every skill under it rolls, so higher attributes roll bigger dice. This is Might; scroll up to see the rest.",
      targetTestId: "card-ca-attr-might",
      onEnter: onSkills,
      optional: true,
    },
    {
      id: "ca-skill-row",
      sectionId: "ca-character-sheet",
      title: "Skills",
      body: "Every skill under every attribute works the same way: tap to roll it, double-click (or press and hold) its value to edit the base number directly. This is Athletics, under Might - scroll down to see the rest.",
      targetTestId: "row-ca-skill-athletics",
      onEnter: onSkills,
      optional: true,
    },
    {
      id: "ca-ability-tab",
      sectionId: "ca-character-sheet",
      title: "Ability",
      body: "Your character's one unique Ability - its own name, description, and rolls.",
      targetTestId: "tab-ability",
      onEnter: onAbility,
    },
    ...(ctx.isGm ? [{
      id: "ca-assign-ability",
      sectionId: "ca-character-sheet",
      title: "Assign an Ability",
      body: "GM-only: pick a reusable Ability template from your library to give this character their unique Ability.",
      targetTestId: "button-assign-ca-ability",
      onEnter: onAbility,
      optional: true,
    }] : []),
    {
      id: "ca-cultivation",
      sectionId: "ca-character-sheet",
      title: "Cultivation",
      body: "Your energy type - defaults to your species, but you can set your own here.",
      targetTestId: "ca-section-cultivation",
      onEnter: onAbility,
      optional: true,
    },
    {
      id: "ca-ability-rolls",
      sectionId: "ca-character-sheet",
      title: "Ability Rolls",
      body: "Rolls your GM built for this Ability, tapped and executed the same way as an item's.",
      targetTestId: "card-ca-ability-rolls",
      onEnter: onAbility,
      optional: true,
    },
    {
      id: "ca-absorbed-orbs",
      sectionId: "ca-character-sheet",
      title: "Absorbed Beast Orbs",
      body: "Any Beast Orb you've absorbed shows up here with its own rolls, still intact. Remove one anytime to send it back to your inventory.",
      targetTestId: "card-ca-ability-absorbed",
      onEnter: onAbility,
      // Only rendered once at least one Beast Orb has actually been
      // absorbed - nothing to show on a fresh (or the tutorial's own
      // throwaway) character, so this skips cleanly rather than stalling.
      optional: true,
    },
    {
      id: "ca-inventory-tab",
      sectionId: "ca-character-sheet",
      title: "Inventory",
      body: "Everything your character carries, plus any custom items your GM has made.",
      targetTestId: "tab-inventory",
      onEnter: onInventory,
    },
    {
      id: "ca-absorb-item",
      sectionId: "ca-character-sheet",
      title: "Absorbing a Beast Orb",
      body: "A Beast Orb in your inventory can be absorbed straight into your Ability tab - it leaves your inventory until you remove it again.",
      targetTestId: "button-absorb-item",
      onEnter: onInventory,
      // Only shows up on an actual Beast Orb item's detail view, so this
      // is expected to skip for most characters most of the time.
      optional: true,
    },
    {
      id: "ca-traits-tab",
      sectionId: "ca-character-sheet",
      title: "Traits",
      body: "Descriptive traits and features, each with its own rolls if it needs them.",
      targetTestId: "tab-traits",
      onEnter: onTraits,
    },
  );
  return { id: "ca-character-sheet", label: "Character Sheet", steps };
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
    ],
  };
}

/** Builds every section relevant to this campaign/role/device, in tour order, filtering out any that don't apply (e.g. the CA section for a non-CA campaign). */
export function buildTutorialSections(ctx: TutorialContext): TutorialSection[] {
  const sections = [
    buildGettingAroundSection(ctx),
    buildSideToolbarSection(ctx),
    buildPlayerTrackerSection(ctx),
    buildSidePanelSection(ctx),
    buildWorkspaceNotesSection(ctx),
    buildMyLibrarySection(),
    // Character Sheet runs last - it's the deepest, most-detailed section,
    // and ending the whole tour by handing the player back to their own
    // sheet reads better than cutting away to My Library right after it.
    buildCASheetSection(ctx),
  ].filter((s): s is TutorialSection => s !== null);

  // The closing step belongs on whichever section actually ends up last -
  // Character Sheet for a CA campaign, My Library otherwise - not hardcoded
  // onto one of them, now that which section is last depends on isCA.
  const lastSection = sections[sections.length - 1];
  if (lastSection) {
    lastSection.steps.push({
      id: "wrap-up",
      sectionId: lastSection.id,
      title: "You're all set",
      body: "That's the tour. You can replay all of this, or just one section of it, anytime from Settings.",
    });
  }

  return sections;
}
