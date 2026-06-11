// Compute the pixel position of a caret index inside a <textarea> by
// rendering a hidden mirror <div> with the same text content and styles up
// to the target offset, then measuring a marker span. This is the standard
// technique used by libraries like `textarea-caret-position` and is the
// only reliable way to locate a character offset in a <textarea>, which
// (unlike contenteditable) gives no DOM nodes per character.

const MIRROR_PROPS: (keyof CSSStyleDeclaration)[] = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "MozTabSize" as unknown as keyof CSSStyleDeclaration,
];

export interface CaretCoords {
  /** Top of the caret line, in pixels relative to the textarea's padding box. */
  top: number;
  /** Left of the caret, in pixels relative to the textarea's padding box. */
  left: number;
  /** Line height in pixels (caret height). */
  height: number;
}

export function getCaretCoordinates(
  el: HTMLTextAreaElement,
  position: number,
): CaretCoords {
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const div = doc.createElement("div");
  div.setAttribute("aria-hidden", "true");
  doc.body.appendChild(div);

  const style = div.style;
  const computed = win.getComputedStyle(el);

  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.top = "0";
  style.left = "-9999px";

  for (const prop of MIRROR_PROPS) {
    try {
      // @ts-expect-error - copying computed style across CSSStyleDeclaration
      style[prop] = computed[prop];
    } catch {
      // ignore unsupported props
    }
  }

  const value = el.value.substring(0, position);
  // Replace spaces with non-breaking spaces is *not* needed for textareas
  // because we set white-space: pre-wrap. Just escape nothing — assign as
  // text node so HTML is not interpreted.
  div.textContent = value;

  const span = doc.createElement("span");
  // Use a zero-width-ish character so the span has measurable position even
  // at the end of a line.
  span.textContent = el.value.substring(position) || ".";
  div.appendChild(span);

  const lineHeight = parseFloat(computed.lineHeight);
  const fontSize = parseFloat(computed.fontSize);
  const height =
    Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fontSize * 1.2;

  const coords: CaretCoords = {
    top: span.offsetTop,
    left: span.offsetLeft,
    height,
  };

  doc.body.removeChild(div);
  return coords;
}

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Compute one rectangle per visual line for the text range [start, end) inside
 * a <textarea>. Uses the same mirror-div technique as `getCaretCoordinates`,
 * but wraps the selected slice in a <span> and reads `getClientRects()` —
 * which returns one rect per wrapped line for inline content. Coordinates are
 * returned in the same reference frame as `getCaretCoordinates` (i.e. measured
 * from the textarea's padding edge), so the two helpers can be mixed freely.
 */
export function getSelectionRects(
  el: HTMLTextAreaElement,
  start: number,
  end: number,
): SelectionRect[] {
  if (end <= start) return [];
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const div = doc.createElement("div");
  div.setAttribute("aria-hidden", "true");
  doc.body.appendChild(div);

  const style = div.style;
  const computed = win.getComputedStyle(el);

  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.top = "0";
  style.left = "-9999px";

  for (const prop of MIRROR_PROPS) {
    try {
      // @ts-expect-error - copying computed style across CSSStyleDeclaration
      style[prop] = computed[prop];
    } catch {
      // ignore unsupported props
    }
  }

  const value = el.value;
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));

  const before = value.substring(0, safeStart);
  const selected = value.substring(safeStart, safeEnd);
  const after = value.substring(safeEnd);

  if (before.length > 0) div.appendChild(doc.createTextNode(before));
  const span = doc.createElement("span");
  span.textContent = selected;
  div.appendChild(span);
  // Trailing content keeps wrapping accurate and gives the mirror a final
  // measurable position even when the selection ends at the last character.
  div.appendChild(doc.createTextNode(after.length > 0 ? after : "."));

  const divRect = div.getBoundingClientRect();
  const borderTop = parseFloat(computed.borderTopWidth) || 0;
  const borderLeft = parseFloat(computed.borderLeftWidth) || 0;

  const clientRects = Array.from(span.getClientRects());
  const rects: SelectionRect[] = clientRects
    .filter((r) => r.width > 0 || r.height > 0)
    .map((r) => ({
      top: r.top - divRect.top - borderTop,
      left: r.left - divRect.left - borderLeft,
      width: r.width,
      height: r.height,
    }));

  doc.body.removeChild(div);
  return rects;
}
