// The My Library mini-tutorial. Unlike the campaign tour, this one needs no
// TutorialContext/driving - everything it points at is already visible on
// the Dashboard the moment the page loads, so it's just a pure function of
// which system's library is open.
import type { TutorialSection } from "./tutorialTypes";

const LIBRARY_SECTION_ID = "my-library-page";

function step(id: string, title: string, body: string, targetTestId?: string, optional = true) {
  return { id, sectionId: LIBRARY_SECTION_ID, title, body, targetTestId, optional };
}

/** Builds the one-section tutorial for whichever system's library is open. */
export function buildLibraryTutorialSections(systemSlug: string): TutorialSection[] {
  const steps = [
    step(
      "welcome",
      "Your Library",
      "Everything here is yours to reuse across any campaign you run or play in - items, spells, and more.",
    ),
    step(
      "mode-switch",
      "My Library vs Admin",
      "This tab keeps you in your own library. Admins have a separate Admin view for content shared with everyone.",
      "tab-my-library-mode",
    ),
  ];

  if (systemSlug === "aa-v3") {
    steps.push(
      step("items", "Items", "Weapons, armor, and gear you can drop into any A.A. V3 campaign.", "card-system-items"),
      step("spells", "Spells", "Your authored spells, built from A.A. V3's composition system.", "card-v3-spells"),
      step("techniques", "Techniques", "Reusable combat techniques your characters can learn.", "card-techniques"),
      step("species", "Species", "Playable species with their attribute bonuses and defaults.", "card-system-species"),
      step("skills", "Knowledge", "Custom Knowledge entries your characters can pick up.", "card-system-skills"),
      step("token-effects", "Token Effects", "Status effects you can apply to tokens on the map.", "card-token-effects"),
      step("character-templates", "Character Templates", "Save a character as a reusable starting point.", "card-character-templates"),
    );
  } else {
    steps.push(
      step("items", "Items", "Weapons, gear, and any blank customizable items you've made.", "card-system-items"),
      step("spells", "Spells", "Your authored spells and rituals.", "card-system-spells"),
      step("species", "Species", "Playable species and their defaults.", "card-system-species"),
      step("skills", "Skills", "Reusable skill definitions.", "card-system-skills"),
      step("traits", "Traits", "Descriptive traits and features characters can carry.", "card-system-traits"),
    );
    if (systemSlug === "ca") {
      steps.push(
        step(
          "ca-abilities",
          "C.A. Abilities",
          "Ability templates a GM can assign to a blank character Ability - built once here, reused across characters.",
          "card-ca-abilities",
        ),
      );
    }
    steps.push(
      step("token-effects", "Token Effects", "Status effects you can apply to tokens on the map.", "card-token-effects"),
      step("character-templates", "Character Templates", "Save a character as a reusable starting point.", "card-character-templates"),
    );
  }

  steps.push(
    step(
      "wrap-up",
      "That's the basics",
      "Replay this anytime from a campaign's Settings, under Guided Tutorial.",
    ),
  );

  return [{ id: LIBRARY_SECTION_ID, label: "My Library", steps }];
}
