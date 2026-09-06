import type React from "react";

// Body diagrams the wound systems (C.A. and Swampy) pin wounds onto.
//
// Swampy currently reuses C.A.'s two diagrams because it started as a copy of
// it. When Swampy gets its own art, drop the files in client/src/assets and
// point the 'swampy' entry at them — nothing else needs to change.

import caWoundBodyMale from "@/assets/ca_wound_body_male.png";
import caWoundBodyFemale from "@/assets/ca_wound_body_female.png";

/**
 * How a diagram is drawn, which decides how it has to be rendered on a dark
 * panel:
 *
 *  - `light-on-transparent` — pale line art with a transparent background.
 *    Drops straight onto the panel; just needs lifting a little.
 *  - `dark-on-light` — line art on an opaque white background, which is what
 *    comes out of most drawing tools and scanners. Painted as-is it is a white
 *    block. Inverting it gives light lines on black, and `screen` blending
 *    then drops that black out, leaving only the lines.
 *
 * Getting this wrong is very visible — the whole panel turns white — so it is
 * recorded per image rather than guessed at render time.
 */
export type WoundBodyArtStyle = "light-on-transparent" | "dark-on-light";

interface WoundBodySet {
  male: string;
  female: string;
  style: WoundBodyArtStyle;
}

const BODY_IMAGES: Record<string, WoundBodySet> = {
  ca: { male: caWoundBodyMale, female: caWoundBodyFemale, style: "light-on-transparent" },
  swampy: { male: caWoundBodyMale, female: caWoundBodyFemale, style: "light-on-transparent" },
};

function setFor(systemSlug: string | null | undefined): WoundBodySet {
  return BODY_IMAGES[systemSlug ?? ""] ?? BODY_IMAGES.ca;
}

export function woundBodyImage(systemSlug: string | null | undefined, sex: "male" | "female"): string {
  const set = setFor(systemSlug);
  return sex === "female" ? set.female : set.male;
}

export function woundBodyArtStyle(systemSlug: string | null | undefined): WoundBodyArtStyle {
  return setFor(systemSlug).style;
}

/**
 * How to paint one of these on a dark panel.
 *
 * `light-on-transparent` art is already white ink on transparency, so it just
 * goes in an <img> as-is - no lifting needed, unlike the old assets whose
 * drawing was black and effectively invisible here.
 *
 * `dark-on-light` art is opaque white throughout, so painting it directly
 * gives a white block. Inverting it produces light lines on black, and
 * `screen` blending drops that black out.
 *
 * A CSS mask filled with a colour token was tried, so the ink colour could be
 * switched between white and the gilt without regenerating the files. It
 * rendered nothing at all - so the colour is baked into the asset instead,
 * which is verifiable by looking at the file.
 */
export function woundBodyImageStyle(systemSlug: string | null | undefined): React.CSSProperties {
  return woundBodyArtStyle(systemSlug) === "dark-on-light"
    ? { filter: "invert(1) brightness(1.15) contrast(1.15)", mixBlendMode: "screen" }
    : {};
}
