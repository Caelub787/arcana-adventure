// Agnostic system tables. Fully separate from every other system's data:
// nothing here is read by A.A./C.A./Swampy code and vice versa. Shapes of the
// JSON columns are defined in shared/agnostic/types.ts.
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { AgAcl, AgActionOptions, AgActionStep, AgCampaignSettings, AgFieldOptions, AgLayout, AgSnapshot, AgTemplateMeta, AgTokenBar } from "./agnostic/types";

export const agnosticNotes = pgTable("agnostic_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(), // 'admin' | 'library' | 'campaign'
  scopeId: text("scope_id").notNull(),
  type: text("type").notNull().default("note"),
  isTemplate: boolean("is_template").notNull().default(false),
  templateMeta: jsonb("template_meta").$type<AgTemplateMeta | null>(),
  templateId: varchar("template_id"),
  templateVersion: integer("template_version"),
  name: text("name").notNull().default(""),
  portrait: text("portrait"),
  ownerIds: text("owner_ids").array().notNull().default(sql`'{}'::text[]`),
  acl: jsonb("acl").$type<AgAcl>().notNull(),
  bodyAcl: jsonb("body_acl").$type<AgAcl>().notNull(),
  tokenBars: jsonb("token_bars").$type<AgTokenBar[] | null>(),
  folder: text("folder"),
  sortOrder: integer("sort_order").notNull().default(0),
  docEpoch: integer("doc_epoch").notNull().default(0),
  /** Set on a sheet's own copy of another (an item given to a character): what it was copied from. */
  copyOf: varchar("copy_of"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ scopeIdx: index("agnostic_notes_scope_idx").on(t.scope, t.scopeId) }));

export const agnosticFields = pgTable("agnostic_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  value: jsonb("value"),
  formula: text("formula"),
  options: jsonb("options").$type<AgFieldOptions>().notNull().default(sql`'{}'::jsonb`),
  acl: jsonb("acl").$type<AgAcl>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  templateFieldId: varchar("template_field_id"),
}, (t) => ({ noteKey: uniqueIndex("agnostic_fields_note_key").on(t.noteId, t.key) }));

export const agnosticRegions = pgTable("agnostic_regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  acl: jsonb("acl").$type<AgAcl>().notNull(),
  inline: boolean("inline").notNull().default(false),
  label: text("label"),
  templateRegionId: varchar("template_region_id"),
}, (t) => ({ noteIdx: index("agnostic_regions_note_idx").on(t.noteId) }));

/** Yjs document states (base64), named note:<id>:<epoch> / region:<id>:<epoch>. */
export const agnosticDocs = pgTable("agnostic_docs", {
  name: text("name").primaryKey(),
  noteId: varchar("note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ noteIdx: index("agnostic_docs_note_idx").on(t.noteId) }));

export const agnosticLinks = pgTable("agnostic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromNoteId: varchar("from_note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  toNoteId: varchar("to_note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  reverseLabel: text("reverse_label").notNull(),
  acl: jsonb("acl").$type<AgAcl>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ fromIdx: index("agnostic_links_from_idx").on(t.fromNoteId), toIdx: index("agnostic_links_to_idx").on(t.toNoteId) }));

export const agnosticModifiers = pgTable("agnostic_modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  via: text("via").notNull(),
  targetKey: text("target_key").notNull(),
  op: text("op").notNull(),
  amount: text("amount").notNull(),
  condition: text("condition"),
  label: text("label"),
}, (t) => ({ noteIdx: index("agnostic_modifiers_note_idx").on(t.noteId) }));

export const agnosticActions = pgTable("agnostic_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  steps: jsonb("steps").$type<AgActionStep[]>().notNull(),
  acl: jsonb("acl").$type<AgAcl>().notNull(),
  color: text("color"),
  options: jsonb("options").$type<AgActionOptions>(),
}, (t) => ({ noteIdx: index("agnostic_actions_note_idx").on(t.noteId) }));

export const agnosticVersions = pgTable("agnostic_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => agnosticNotes.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  label: text("label"),
  snapshot: jsonb("snapshot").$type<AgSnapshot>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by"),
}, (t) => ({ noteIdx: index("agnostic_versions_note_idx").on(t.noteId, t.createdAt) }));

export const agnosticComponents = pgTable("agnostic_components", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  params: jsonb("params").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  layout: jsonb("layout").$type<AgLayout>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ scopeIdx: index("agnostic_components_scope_idx").on(t.scope, t.scopeId) }));

export const agnosticSettings = pgTable("agnostic_settings", {
  campaignId: varchar("campaign_id").primaryKey(),
  settings: jsonb("settings").$type<AgCampaignSettings>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Per-scope bookkeeping (e.g. which built-in components were already added, so deleting one sticks). */
export const agnosticScopeMeta = pgTable("agnostic_scope_meta", {
  scopeKey: text("scope_key").primaryKey(),
  seedLevel: integer("seed_level").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Boot schema guard statements (server/app.ts runs these idempotently). */
export const AGNOSTIC_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS agnostic_notes (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL,
    scope_id text NOT NULL,
    type text NOT NULL DEFAULT 'note',
    is_template boolean NOT NULL DEFAULT false,
    template_meta jsonb,
    template_id varchar,
    template_version integer,
    name text NOT NULL DEFAULT '',
    portrait text,
    owner_ids text[] NOT NULL DEFAULT '{}'::text[],
    acl jsonb NOT NULL,
    body_acl jsonb NOT NULL,
    token_bars jsonb,
    folder text,
    sort_order integer NOT NULL DEFAULT 0,
    doc_epoch integer NOT NULL DEFAULT 0,
    copy_of varchar,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_notes_scope_idx ON agnostic_notes (scope, scope_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_fields (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    type text NOT NULL,
    value jsonb,
    formula text,
    options jsonb NOT NULL DEFAULT '{}'::jsonb,
    acl jsonb NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    template_field_id varchar
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS agnostic_fields_note_key ON agnostic_fields (note_id, key)`,
  `CREATE TABLE IF NOT EXISTS agnostic_regions (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    acl jsonb NOT NULL,
    inline boolean NOT NULL DEFAULT false,
    label text,
    template_region_id varchar
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_regions_note_idx ON agnostic_regions (note_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_docs (
    name text PRIMARY KEY,
    note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    state text NOT NULL,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_docs_note_idx ON agnostic_docs (note_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_links (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    from_note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    to_note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    label text NOT NULL,
    reverse_label text NOT NULL,
    acl jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_links_from_idx ON agnostic_links (from_note_id)`,
  `CREATE INDEX IF NOT EXISTS agnostic_links_to_idx ON agnostic_links (to_note_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_modifiers (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    via text NOT NULL,
    target_key text NOT NULL,
    op text NOT NULL,
    amount text NOT NULL,
    condition text,
    label text
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_modifiers_note_idx ON agnostic_modifiers (note_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_actions (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    name text NOT NULL,
    steps jsonb NOT NULL,
    acl jsonb NOT NULL,
    color text,
    options jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_actions_note_idx ON agnostic_actions (note_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_versions (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id varchar NOT NULL REFERENCES agnostic_notes(id) ON DELETE CASCADE,
    reason text NOT NULL,
    label text,
    snapshot jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    created_by varchar
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_versions_note_idx ON agnostic_versions (note_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS agnostic_components (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL,
    scope_id text NOT NULL,
    name text NOT NULL,
    params jsonb NOT NULL DEFAULT '[]'::jsonb,
    layout jsonb NOT NULL,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agnostic_components_scope_idx ON agnostic_components (scope, scope_id)`,
  `CREATE TABLE IF NOT EXISTS agnostic_settings (
    campaign_id varchar PRIMARY KEY,
    settings jsonb NOT NULL,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS agnostic_scope_meta (
    scope_key text PRIMARY KEY,
    seed_level integer NOT NULL DEFAULT 0,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  // Battlemap: a token can stand for any Agnostic note (portrait + live bars).
  `ALTER TABLE IF EXISTS tokens ADD COLUMN IF NOT EXISTS agnostic_note_id varchar`,
  `ALTER TABLE IF EXISTS agnostic_actions ADD COLUMN IF NOT EXISTS options jsonb`,
  // A sheet's own copy of another (an item given to a character).
  `ALTER TABLE IF EXISTS agnostic_notes ADD COLUMN IF NOT EXISTS copy_of varchar`,
  // Agnostic sheets in the campaign's initiative order (they aren't rows in characters).
  `ALTER TABLE IF EXISTS initiative_entries ALTER COLUMN character_id DROP NOT NULL`,
  `ALTER TABLE IF EXISTS initiative_entries ADD COLUMN IF NOT EXISTS agnostic_note_id varchar`,
  `ALTER TABLE IF EXISTS initiative_entries ADD COLUMN IF NOT EXISTS agnostic_name text`,
  `ALTER TABLE IF EXISTS initiative_entries ADD COLUMN IF NOT EXISTS agnostic_portrait text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS initiative_entries_campaign_agnostic_unique ON initiative_entries (campaign_id, agnostic_note_id)`,
  // Hotbar slots holding an Agnostic sheet or button.
  `ALTER TABLE IF EXISTS free_hotbar_entries ADD COLUMN IF NOT EXISTS agnostic_ref text`,
];
