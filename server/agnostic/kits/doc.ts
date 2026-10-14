// Build Agnostic sheet documents on the server, in the exact shape the editor
// (TipTap + y-prosemirror) stores them: one Y.XmlElement per node with its
// attributes, consecutive text in a Y.XmlText with marks as formatting.
// Used by starter kits to ship ready-made templates.
import * as Y from "yjs";

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<DocNode | DocText>;
}
export interface DocText { text: string; marks?: Record<string, Record<string, unknown>> }

const isText = (n: DocNode | DocText): n is DocText => typeof (n as DocText).text === "string";

function fill(parent: Y.XmlFragment | Y.XmlElement, nodes: Array<DocNode | DocText>, at?: number) {
  let text: Y.XmlText | null = null;
  let pos = at ?? parent.length;
  for (const n of nodes) {
    if (isText(n)) {
      if (!n.text) continue;
      if (!text) { text = new Y.XmlText(); parent.insert(pos++, [text]); }
      text.insert(text.length, n.text, n.marks ?? {});
      continue;
    }
    text = null;
    const el = new Y.XmlElement(n.type);
    parent.insert(pos++, [el]);
    for (const [k, v] of Object.entries(n.attrs ?? {})) if (v !== null && v !== undefined) el.setAttribute(k, v as any);
    if (n.content?.length) fill(el, n.content);
  }
}

/** Append nodes to an existing element of a live document (kit upgrades). */
export function appendNodes(parent: Y.XmlFragment | Y.XmlElement, nodes: DocNode[]) { fill(parent, nodes); }
/** Insert nodes at a position in an existing element of a live document (kit upgrades). */
export function insertNodes(parent: Y.XmlFragment | Y.XmlElement, index: number, nodes: DocNode[]) { fill(parent, nodes, index); }

/** A whole document (and its canvases) as the base64 Yjs state the server stores. */
export function buildDocState(nodes: DocNode[], canvases: Record<string, Record<string, unknown>[]> = {}): string {
  const doc = new Y.Doc();
  doc.transact(() => {
    fill(doc.getXmlFragment("default"), nodes);
    const root = doc.getMap<Y.Map<unknown>>("canvases");
    for (const [id, items] of Object.entries(canvases)) {
      const m = new Y.Map<unknown>();
      root.set(id, m);
      for (const it of items) m.set(String(it.id), it);
    }
  });
  const out = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  doc.destroy();
  return out;
}

// --------------------------------------------------------------------------- tiny vocabulary
export const t = (text: string, marks?: DocText["marks"]): DocText => ({ text, marks });
export const b = (text: string): DocText => t(text, { bold: {} });
export const i = (text: string): DocText => t(text, { italic: {} });
export const muted = (text: string): DocText => t(text, { textStyle: { color: "#a8a29e" } });
export const p = (...content: Array<DocNode | DocText | string>): DocNode => ({ type: "paragraph", content: content.map((c) => (typeof c === "string" ? t(c) : c)) });
export const pAlign = (align: "left" | "center" | "right", ...content: Array<DocNode | DocText | string>): DocNode => ({ ...p(...content), attrs: { textAlign: align } });
export const h = (level: 1 | 2 | 3, ...content: Array<DocNode | DocText | string>): DocNode => ({ type: "heading", attrs: { level }, content: content.map((c) => (typeof c === "string" ? t(c) : c)) });
export const hr = (): DocNode => ({ type: "horizontalRule" });
export const icon = (name: string, color = "#d4a24c", size = 16): DocNode => ({ type: "agIcon", attrs: { name, color, size } });
/** A value inside the text. */
export const val = (ref: string, opts: { display?: string; label?: string; showLabel?: boolean; look?: Record<string, unknown> } = {}): DocNode =>
  ({ type: "agField", attrs: { ref, display: opts.display ?? "value", label: opts.label ?? "", showLabel: opts.showLabel ?? false, look: opts.look ?? {} } });
/** A value on its own line (bars, pips, dials, editable values…). */
export const block = (ref: string, opts: { maxRef?: string; display?: string; label?: string; showLabel?: boolean; look?: Record<string, unknown> } = {}): DocNode =>
  ({ type: "agFieldBlock", attrs: { ref, maxRef: opts.maxRef ?? "", display: opts.display ?? "value", label: opts.label ?? "", showLabel: opts.showLabel ?? true, color: "", look: opts.look ?? {} } });
export const button = (actionId: string, label = "", look: Record<string, unknown> = {}): DocNode => ({ type: "agButton", attrs: { actionId, label, look } });
export const columns = (cols: DocNode[][], look: Record<string, unknown> = {}): DocNode =>
  ({ type: "agColumns", attrs: { look }, content: cols.map((c) => ({ type: "agColumn", content: c.length ? c : [p()] })) });
export const section = (regionId: string, look: Record<string, unknown>): DocNode => ({ type: "agRegion", attrs: { regionId, look } });
export const tabs = (tabsId: string, list: Array<{ title: string; icon?: string; content: DocNode[] }>, look: Record<string, unknown> = {}): DocNode =>
  ({ type: "agTabs", attrs: { tabsId, look }, content: list.map((tb) => ({ type: "agTab", attrs: { title: tb.title, icon: tb.icon ?? "", color: "" }, content: tb.content.length ? tb.content : [p()] })) });
export const links = (label: string, cols: unknown[], config: Record<string, unknown>, look: Record<string, unknown> = {}): DocNode =>
  ({ type: "agLinks", attrs: { label, columns: cols, config, look } });
/** A sheet's rolls (see the Rolls block): who rolls and pays, and the costs new rolls start with. */
export const rolls = (via: string, costs: string[], color = "", look: Record<string, unknown> = {}): DocNode => ({ type: "agRolls", attrs: { via, costs, color, look } });
export const canvas = (canvasId: string, width: number, height: number, look: Record<string, unknown> = {}): DocNode =>
  ({ type: "agCanvas", attrs: { canvasId, width, height, background: "", look } });
export const table = (rows: Array<Array<DocNode[]>>, header = true): DocNode => ({
  type: "table",
  content: rows.map((r, ri) => ({
    type: "tableRow",
    content: r.map((cell) => ({ type: header && ri === 0 ? "tableHeader" : "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: cell.length ? cell : [p()] })),
  })),
});
