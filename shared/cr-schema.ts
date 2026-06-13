import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const realmsTable = pgTable(
  "realms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    accent: text("accent"),
    ownerUserId: text("owner_user_id"),
    arcanaHost: text("arcana_host"),
    arcanaAccessToken: text("arcana_access_token"),
    arcanaRefreshToken: text("arcana_refresh_token"),
    arcanaTokenExpiresAt: timestamp("arcana_token_expires_at", {
      withTimezone: true,
    }),
    arcanaUserId: text("arcana_user_id"),
    arcanaUserDisplay: text("arcana_user_display"),
    arcanaSystem: text("arcana_system"),
    arcanaWebhookId: text("arcana_webhook_id"),
    arcanaWebhookSecret: text("arcana_webhook_secret"),
    wikiDraft: jsonb("wiki_draft"),
    wikiPublishedSnapshotId: uuid("wiki_published_snapshot_id"),
    // When set, this (standalone) realm is shared with the given host campaign:
    // all members of that campaign inherit read-only (viewer) access to it via
    // the campaign bridge in resolveRealmRole, in addition to the campaign's
    // auto-provisioned realm (whose id == campaignId).
    linkedCampaignId: text("linked_campaign_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    ownerIdx: index("realms_owner_user_id_idx").on(t.ownerUserId),
    arcanaWebhookIdx: index("realms_arcana_webhook_id_idx").on(
      t.arcanaWebhookId,
    ),
    linkedCampaignIdx: index("realms_linked_campaign_id_idx").on(
      t.linkedCampaignId,
    ),
  }),
);

export type Realm = typeof realmsTable.$inferSelect;

export const realmCollaboratorsTable = pgTable(
  "realm_collaborators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    realmId: uuid("realm_id")
      .notNull()
      .references(() => realmsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    invitedEmail: text("invited_email"),
    inviteToken: text("invite_token"),
    role: text("role").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    realmUserUnique: uniqueIndex("realm_collaborators_realm_user_uniq")
      .on(t.realmId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    realmEmailUnique: uniqueIndex("realm_collaborators_realm_email_uniq")
      .on(t.realmId, t.invitedEmail)
      .where(sql`${t.invitedEmail} IS NOT NULL AND ${t.userId} IS NULL`),
    inviteTokenUnique: uniqueIndex("realm_collaborators_invite_token_uniq")
      .on(t.inviteToken)
      .where(sql`${t.inviteToken} IS NOT NULL`),
    userIdx: index("realm_collaborators_user_idx").on(t.userId),
  }),
);

export type RealmCollaborator = typeof realmCollaboratorsTable.$inferSelect;

export const foldersTable = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    realmId: uuid("realm_id")
      .notNull()
      .references(() => realmsTable.id, { onDelete: "cascade" }),
    parentFolderId: uuid("parent_folder_id").references(
      (): AnyPgColumn => foldersTable.id,
      { onDelete: "cascade" },
    ),
    name: text("name").notNull(),
    sortIndex: doublePrecision("sort_index").notNull().default(0),
    // When set, this folder is a player's personal folder inside a
    // campaign-linked (shared) realm. Only that user (plus realm owner/editors,
    // i.e. the GM) can see or write inside it. Null = a normal shared folder.
    ownerUserId: text("owner_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    realmParentIdx: index("folders_realm_parent_idx").on(
      t.realmId,
      t.parentFolderId,
    ),
    ownerIdx: index("folders_owner_user_id_idx").on(t.ownerUserId),
    // At most one personal folder per (realm, user). Partial so normal shared
    // folders (ownerUserId IS NULL) are unconstrained.
    ownerPerRealmUniq: uniqueIndex("folders_realm_owner_user_id_uniq")
      .on(t.realmId, t.ownerUserId)
      .where(sql`${t.ownerUserId} IS NOT NULL`),
  }),
);

export type Folder = typeof foldersTable.$inferSelect;

export const nodesTable = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    realmId: uuid("realm_id")
      .notNull()
      .references(() => realmsTable.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => foldersTable.id, {
      onDelete: "set null",
    }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    kind: text("kind").notNull().default("note"),
    mode: text("mode").notNull().default("window"),
    minimized: boolean("minimized").notNull().default(false),
    x: doublePrecision("x").notNull().default(0),
    y: doublePrecision("y").notNull().default(0),
    width: doublePrecision("width").notNull().default(320),
    height: doublePrecision("height").notNull().default(240),
    zIndex: integer("z_index").notNull().default(1),
    color: text("color").notNull().default("#7c5cff"),
    imageUrl: text("image_url"),
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
    arcanaStats: jsonb("arcana_stats"),
    arcanaSync: boolean("arcana_sync").notNull().default(true),
    // When true, this node is hidden from realm viewers (read-only members /
    // campaign-bridged players). Owners/editors always see it; an individual
    // viewer with an explicit edit grant (nodeEditGrantsTable) also sees it.
    isPrivate: boolean("is_private").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    realmKindIdx: index("nodes_realm_kind_idx").on(t.realmId, t.kind),
    realmFolderIdx: index("nodes_realm_folder_idx").on(t.realmId, t.folderId),
    realmKeyIdx: uniqueIndex("nodes_realm_key_idx").on(t.realmId, t.key),
  }),
);

export type Node = typeof nodesTable.$inferSelect;

// Per-node, per-user edit grants. Lets a realm viewer (read-only member or a
// campaign-bridged player) edit the content of specific nodes they've been
// granted, without elevating them to realm-wide editor. Grants also reveal a
// node to a viewer even when it is marked private.
export const nodeEditGrantsTable = pgTable(
  "node_edit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nodeUserIdx: uniqueIndex("node_edit_grants_node_user_idx").on(
      t.nodeId,
      t.userId,
    ),
    userIdx: index("node_edit_grants_user_idx").on(t.userId),
  }),
);

export type NodeEditGrant = typeof nodeEditGrantsTable.$inferSelect;

export const relationshipsTable = pgTable("relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: uuid("realm_id")
    .notNull()
    .references(() => realmsTable.id, { onDelete: "cascade" }),
  fromNodeId: uuid("from_node_id")
    .notNull()
    .references(() => nodesTable.id, { onDelete: "cascade" }),
  toNodeId: uuid("to_node_id")
    .notNull()
    .references(() => nodesTable.id, { onDelete: "cascade" }),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Relationship = typeof relationshipsTable.$inferSelect;

export const viewportsTable = pgTable("viewports", {
  realmId: uuid("realm_id")
    .primaryKey()
    .references(() => realmsTable.id, { onDelete: "cascade" }),
  x: doublePrecision("x").notNull().default(0),
  y: doublePrecision("y").notNull().default(0),
  zoom: doublePrecision("zoom").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Viewport = typeof viewportsTable.$inferSelect;

export const canvasMembersTable = pgTable(
  "canvas_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canvasNodeId: uuid("canvas_node_id")
      .notNull()
      .references(() => nodesTable.id, { onDelete: "cascade" }),
    memberNodeId: uuid("member_node_id")
      .notNull()
      .references(() => nodesTable.id, { onDelete: "cascade" }),
    x: doublePrecision("x").notNull().default(0),
    y: doublePrecision("y").notNull().default(0),
    width: doublePrecision("width").notNull().default(320),
    height: doublePrecision("height").notNull().default(240),
    zIndex: integer("z_index").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    canvasMember: uniqueIndex("canvas_members_canvas_member_idx").on(
      t.canvasNodeId,
      t.memberNodeId,
    ),
  }),
);

export type CanvasMember = typeof canvasMembersTable.$inferSelect;

export const wikiSnapshotsTable = pgTable(
  "wiki_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    realmId: uuid("realm_id")
      .notNull()
      .references(() => realmsTable.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedByUserId: text("published_by_user_id"),
    layout: jsonb("layout").notNull(),
    entries: jsonb("entries").notNull(),
  },
  (t) => ({
    realmPublishedIdx: index("wiki_snapshots_realm_published_idx").on(
      t.realmId,
      t.publishedAt,
    ),
  }),
);

export type WikiSnapshot = typeof wikiSnapshotsTable.$inferSelect;
