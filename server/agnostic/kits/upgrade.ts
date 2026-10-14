// Bringing CA Agnostic content that already exists up to date with the kit.
// New campaigns and libraries get the current kit when they're filled; these
// steps upgrade ones made before a change, once each (a level stored per
// scope in agnostic_scope_meta). Each step only adds what's missing and leaves
// anything the GM changed alone wherever it can.
import * as Y from "yjs";
import { randomUUID } from "crypto";
import { noteDocName, type AgNote } from "@shared/agnostic/types";
import type { ScopeStore } from "../store";
import * as repo from "../repo";
import * as docs from "../docs";
import * as snap from "../snapshot";
import { appendNodes } from "./doc";
import { CA_KIT_FOLDER, rankTooltip, abilityTabContent, abilityTemplateSnapshot } from "./ca";

/** Bump when adding a step below. */
export const CA_KIT_LEVEL = 1;
const marker = (key: string) => `kit-upgrade:${key}`;

/** A scope that was just filled with the current kit needs no upgrades. */
export async function markKitCurrent(store: ScopeStore) {
  await repo.setSeedLevel(marker(store.key), CA_KIT_LEVEL);
}

export async function upgradeCAKit(store: ScopeStore) {
  const level = await repo.getSeedLevel(marker(store.key));
  if (level >= CA_KIT_LEVEL) return;
  const characterTemplates = Array.from(store.notes.values()).filter((n) => n.isTemplate && n.name === "CA Character");
  if (!characterTemplates.length) { await repo.setSeedLevel(marker(store.key), CA_KIT_LEVEL); return; }
  if (level < 1) await upgrade1(store, characterTemplates);
  await repo.setSeedLevel(marker(store.key), CA_KIT_LEVEL);
  console.log(`[agnostic] CA kit: ${store.key} brought up to level ${CA_KIT_LEVEL}`);
}

/** Level 1: rank tooltip; abilities become their own sheets listed on the Ability tab. */
async function upgrade1(store: ScopeStore, characterTemplates: AgNote[]) {
  const templateIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => templateIds.has(n.id) || (n.templateId && templateIds.has(n.templateId)));
  await store.run(async (cs) => {
    // The rank ladder behind a ? beside Rank.
    const tip = rankTooltip();
    for (const n of characters) {
      const f = store.fieldsByNote.get(n.id)?.get("rank");
      if (f && !f.options.tooltip) await store.putField({ ...f, options: { ...f.options, tooltip: tip } }, cs);
    }

    // The ability template.
    let abilityTemplate = Array.from(store.notes.values()).find((n) => n.isTemplate && n.name === "CA Ability");
    if (!abilityTemplate) abilityTemplate = await snap.createFromSnapshot(store, abilityTemplateSnapshot(), {}, cs);

    // Each character's single ability (name + description) becomes an ability sheet in its list.
    for (const n of characters) {
      if (n.isTemplate) continue;
      const fields = store.fieldsByNote.get(n.id);
      const name = String(fields?.get("ability_name")?.value ?? "").trim();
      if (!name) continue;
      const already = Array.from(store.links.values()).some((l) => l.toNoteId === n.id && l.label === "holder" && store.notes.get(l.fromNoteId)?.name === name);
      if (already) continue;
      const s = await snap.takeSnapshot(store, abilityTemplate.id);
      const a = await snap.createFromSnapshot(store, s, { name, folder: n.folder ?? CA_KIT_FOLDER, ownerIds: [...n.ownerIds] }, cs, { fromTemplateId: abilityTemplate.id });
      const desc = store.fieldsByNote.get(a.id)?.get("description");
      const oldDesc = String(fields?.get("ability_description")?.value ?? "");
      if (desc && oldDesc) await store.putField({ ...desc, value: oldDesc }, cs);
      await store.putLink({ id: randomUUID(), fromNoteId: a.id, toNoteId: n.id, label: "holder", reverseLabel: "abilities", acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
    }
  });

  // The Ability tab of each character (and its template) shows the abilities list.
  for (const n of characters) await replaceAbilityTab(n);
}

async function replaceAbilityTab(note: AgNote) {
  const name = noteDocName(note.id, note.docEpoch);
  const entry = await docs.getDoc(name, note.id);
  const frag = entry.doc.getXmlFragment("default");
  let tab: Y.XmlElement | null = null;
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === "agTab" && child.getAttribute("title") === "Ability") { tab = child; return; }
      walk(child);
      if (tab) return;
    }
  };
  walk(frag);
  if (!tab) return;
  const t = tab as Y.XmlElement;
  // Already has the list: leave it be.
  const hasList = (node: Y.XmlElement): boolean => node.toArray().some((c) => c instanceof Y.XmlElement && ((c.nodeName === "agLinks" && c.getAttribute("label") === "abilities") || hasList(c)));
  if (hasList(t)) return;
  entry.doc.transact(() => {
    t.delete(0, t.length);
    appendNodes(t, abilityTabContent());
  });
  // Saved with everything else (the doc saves itself shortly after a change).
  docs.subscribe(entry, "kit-upgrade");
  docs.unsubscribe(name, "kit-upgrade");
}
