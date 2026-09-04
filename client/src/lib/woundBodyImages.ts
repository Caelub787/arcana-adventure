// Body diagrams the wound systems (C.A. and Swampy) pin wounds onto.
//
// Swampy currently reuses C.A.'s two diagrams because it started as a copy of
// it. When Swampy gets its own art, drop the files in client/src/assets and
// point the 'swampy' entry at them — nothing else needs to change.

import caWoundBodyMale from "@/assets/ca_wound_body_male.png";
import caWoundBodyFemale from "@/assets/ca_wound_body_female.png";

const BODY_IMAGES: Record<string, { male: string; female: string }> = {
  ca: { male: caWoundBodyMale, female: caWoundBodyFemale },
  swampy: { male: caWoundBodyMale, female: caWoundBodyFemale },
};

export function woundBodyImage(systemSlug: string | null | undefined, sex: "male" | "female"): string {
  const set = BODY_IMAGES[systemSlug ?? ""] ?? BODY_IMAGES.ca;
  return sex === "female" ? set.female : set.male;
}
