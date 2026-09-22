// The Notes Workspace mini-tutorial - a small, fixed set of steps (no
// per-system branching, no driving needed) since everything it points at is
// static chrome that's on screen the moment the workspace opens.
import type { TutorialSection } from "./tutorialTypes";

const SECTION_ID = "notes-workspace";

export function buildWorkspaceTutorialSections(): TutorialSection[] {
  return [
    {
      id: SECTION_ID,
      label: "Notes Workspace",
      steps: [
        {
          id: "welcome",
          sectionId: SECTION_ID,
          title: "The Notes Workspace",
          body: "Open several notes at once, each in its own window, instead of switching back and forth in the side panel.",
        },
        {
          id: "rail",
          sectionId: SECTION_ID,
          title: "Browse Notes",
          body: "Pick a note here to open it as a window on the right.",
          targetTestId: "notes-workspace-rail",
          placement: "right",
        },
        {
          id: "empty-hint",
          sectionId: SECTION_ID,
          title: "Open a Note",
          body: "Windows show up here once you open them - drag by their header to move, or the corner to resize.",
          targetTestId: "notes-workspace-empty-hint",
          optional: true,
        },
        {
          id: "split",
          sectionId: SECTION_ID,
          title: "Split",
          body: "Arrange two open notes side by side.",
          targetTestId: "button-workspace-split",
          optional: true,
        },
        {
          id: "tile",
          sectionId: SECTION_ID,
          title: "Tile",
          body: "Arrange every open note in a grid.",
          targetTestId: "button-workspace-tile",
          optional: true,
        },
        {
          id: "close",
          sectionId: SECTION_ID,
          title: "Back to the Campaign",
          body: "Closes the workspace and returns to the game - your open notes aren't lost, just tucked away.",
          targetTestId: "button-workspace-close",
        },
      ],
    },
  ];
}
