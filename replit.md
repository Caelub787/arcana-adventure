# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview
Arcana Adventure is a full-stack web application designed to be a comprehensive hub for real-time tabletop RPG gameplay. It provides Game Masters (GMs) and players with collaborative tools for campaign management, character creation, and real-time interaction, all within a dark fantasy aesthetic. The project aims to streamline the TTRPG experience with distinct GM and player perspectives, robust role-based access control, and extensive worldbuilding capabilities. Key capabilities include interactive battle maps, dynamic character sheets, real-time chat with dice rolls, and a sophisticated world wiki system.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
-   **Technology Stack**: React 18 with TypeScript, Vite, Wouter, TanStack Query.
-   **UI/UX**: Tailwind CSS v4 with a dark fantasy theme, `shadcn/ui` components (Radix UI), and Lucide React for iconography. Floating panels are used for various interactive elements, adapting to full-screen overlays on mobile.
-   **State Management**: React Context for authentication, TanStack Query for server state.
-   **Real-time Communication**: WebSockets for live updates.
-   **Key Features**:
    -   **Battle Map**: Interactive map with token management (draggable, HP/energy, initiative, GM viewport tracking), scene management, custom backgrounds, dynamic Fog of War with vision calculations (walls, doors, lighting), and GM-drawn Vision Zones.
    -   **Character Management**: Mobile-optimized character sheets with real-time updates, custom species/races, dynamic HP/energy, templates, and embedded items/spells.
    -   **Game Mechanics**: Real-time chat with dice rolls, attributes/skills, traits, rest mechanics, exhaustion, inventory with hotbars, initiative tracker, roll notifications, targeting with range/hit detection (including AOE), armor damage reduction, and combat status effects.
    -   **Progression Systems**: Interactive feat tree editor for species progression and a class-based system (AA V2) with skill trees, mana resources, and class-specific progression. Both systems support dynamic effects.
    -   **Spell Management**: System for defining spells with properties like damage, type, range, cost, and attribute.
    -   **Roll Templates (AA V2 only)**: Admins create lightweight roll templates (name + roll settings only) in the unified Roll Templates view (stored as items where `isLiveTemplate=true`). Both the AAv2 admin Item AND Spell create/edit dialogs render the same `ItemTemplateLinksPanel` checkbox list, so a single template can be linked to many items AND many spells. Linking copies the template's rolls onto the owner with `fromTemplateRollId` pointers, recorded in `item_template_links` (item↔template) or `spell_template_links` (spell↔template, FK to `items.id`). Subsequent edits/additions/deletions to a template's rolls fan out automatically to every linked item AND spell, including character-owned copies, via provenance-aware propagation. Per-instance overrides: editing an inherited roll on a specific item/spell auto-flips `roll_entries.isOverridden=true`; subsequent template-roll edits skip overridden copies (untouched copies still update), template-roll deletes detach overridden copies (preserved as standalone) but delete non-overridden ones, and template unlinks behave the same way. A `RotateCcw` "Reset to template" button (`POST /api/roll-entries/:id/reset-template`) restores an overridden roll to the template's current values and clears the flag. The badge on inherited rolls shows "(modified)" in violet when overridden. Deleting a template entirely scrubs all inherited rolls across both ownerType='item' and ownerType='spell' and drops both link tables; overridden copies are preserved by detaching their provenance pointer. Owner-template detection uses `isLiveTemplate`, not `isTemplate` (the latter is also set on plain admin system-items).
    -   **Roll DC Check**: Each roll entry can require a DC to succeed (`hasDcCheck`). The check value is resolved by `dcCheckRollMode`: `'main'` (default) compares the main roll's total against the DC; `'separate'` rolls a fresh `1d20 + dcToSucceedAttribute` mod (with attribute "None" supported) and compares that, leaving the main roll's value untouched. The DC value is resolved by `dcToSucceedType`: `'value'` uses the static `dcToSucceed` integer; `'caster'` uses `8 + casterMod[dcToSucceedDcAttribute]`; `'target'` uses the targeted character's `naturalArmor` (their DC value) directly — the previous "8 + target attribute mod" behavior was removed because that's what Save DC does. The shared helper `resolveDcCheck(rollEntry, mainRollTotal, caster, targetChar?)` (`client/src/components/game/GameComponents.tsx`) handles both axes; the two execute paths (`executeSpellRoll` in CharacterSheet, `executeRoll` in ItemDetailDialog) call it without `targetChar`, so type='target' falls back to the static `dcToSucceed` value (or 10) in those flows. UI lives in `RollEntriesEditor.tsx` "DC to Succeed" section: Roll Mode select first, then DC Type, with `dcToSucceedAttribute` only shown in separate mode and `dcToSucceedDcAttribute` only shown in caster mode.
    -   **Roll Folder + Priority Sorting**: Each `roll_entries` row carries an optional `folder` (text) and a `priority` (int, default 1, lower sorts higher). Rolls with a folder render under a collapsible folder header that anchors at the min priority of its contents. Roll Templates (`items` where `isLiveTemplate=true`) additionally carry `templatePriority` (int, default 1) and `templateUseOwnOrder` (bool, default false). When `templateUseOwnOrder=false` (default), the template's inherited rolls interleave with the owner's other rolls by their per-roll priority. When `true`, those inherited rolls render as one contiguous template-group block anchored at `templatePriority`, ordered internally by their own priorities (folder structure inside the group is preserved). All template→owner copy paths (link toggle, item/spell create with templateLinks, item-template-links PUT, spell-template-links PUT, template-roll fanout) propagate `folder` and `priority` automatically via spread; PATCH on a template roll re-syncs both fields to non-overridden inherited copies. Server `enrichWithTemplateNames` (`server/routes.ts`) decorates each inherited roll in `GET /api/roll-entries` responses with `templateName`, `templatePriority`, `templateUseOwnOrder`, and `templateOwnerKey` so the client sort util `client/src/lib/rollSort.ts` (`sortRollsForDisplay`, `collectFolderNames`) can build the unified `roll | folder | template-group` display tree.
    -   **Notes System**: Obsidian-like note-taking with nested folders, markdown, rich text, entity references, collaborative editing, Canvas editor, and Graph View, integrated with the Worldbuilding system. The `CanvasEditor` component is reusable and supports optional providers (`noteSearchProvider`, `entitySearchProvider`, `hideNoteNodes`) for use in both Notes and World Builder contexts.
    -   **World Builder Tabs**: True browser-style tab system across the entire World Builder, in both the standalone `/worldbuilder` page (`WorldBuilder.tsx`) and the campaign-embedded panel (`WorldBuilderContent` in `Campaign.tsx`). Any section (Home, Encyclopedia, Maps, Timeline, Calendar, Graph), individual article, or map editor can be opened as its own tab. Tab types: `home | encyclopedia | article | maps | map-edit | timeline | calendar | graph`. State: `wbTabs: WbTab[]` and `activeWbTabId`. Section nav buttons create/switch tabs. Article tabs open per entity. Map editing opens a dedicated `map-edit` tab (per map, with `mapId`). Per-tab state for timeline (`selectedTimelineId`). Default click navigates in current tab; Ctrl/Cmd+click opens new tab. Home tab auto-creates on world load.
    -   **Worldbuilding Wiki System**: Unified platform for creating independent "Worlds" with articles, maps, timelines, calendars, and relationship graphs. Features include wiki-link autocomplete, public share links, visibility controls, and WebSocket live sync. Worlds can be linked to campaigns.
    -   **Campaign Map Pins**: Interactive pins on the battlemap with percentage-based coordinates, supporting text reveals and scene links. Pins can be marked as shops.
    -   **Shop System**: GMs manage shop inventories (items, prices, stock, currency) linked to map pins. Players can buy/sell items with automatic currency conversion and a charisma-based haggling d20 roll. Shops can be linked to shopkeeper characters for automated currency tracking.
    -   **World Collaboration**: World owners can add friends as collaborators (editors) via World Settings. Collaborators get full read/write access to all world content. Campaign wiki linking lets GMs assign a world wiki to a campaign. Per-article player access control lets GMs grant view/edit access to specific players for `player_visible` articles.
    -   **Campaign Wiki Unification (AA V2)**: In AA V2 campaigns, the World Builder replaces the Notes panel as the unified wiki for all players and GMs. The Notes button is hidden, the World Builder is always visible, and articles default to read-only view with an Edit button for authorized users. Non-GM editors can only modify content fields (articleContent, description, displayName, image, tags) -- visibility and entity type changes are GM-only. A `WikiArticleWithAccess` wrapper component fetches per-user access via `/api/worlds/:worldId/entities/:entityId/my-access` to determine edit permissions.
    -   **Preview-First Article Layout**: Both the standalone WorldBuilder and campaign-embedded wiki display articles in a "google doc" preview layout by default, matching the public SharedWorldView style. Features: hero image with gradient overlay, entity type badge, amber-bordered description, prose-invert content with interactive wiki links, and read-only tag badges. An Edit button appears at the top for users with edit access. The EntitySidePanel (Overview/Links/Refs tabs) has been removed from article views.

### Backend
-   **Technology Stack**: Express.js with TypeScript, `express-session`.
-   **API Design**: RESTful endpoints, WebSocket server, session-based authentication, and role-based access control.
-   **API Scoping**: Worldbuilding data is accessible via both world-scoped and campaign-scoped routes.

### Data Storage
-   **Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM.
-   **Schema**: Comprehensive schema covering all application entities, including `worlds`, `entities`, `campaign_map_pins`, `shop_items`, and `shop_haggle_rolls`. Worldbuilding tables feature `worldId` and `campaignId` (nullable) for flexible scoping.
-   **Validation**: Zod schemas for input validation.

### Authentication & Authorization
-   **Authentication**: `bcryptjs` for password hashing, session-based authentication with "Remember Me" support.
-   **Authorization**: Three-tier role system (Owner, Assistant GM, Player) and a four-tier character access permission system.
-   **Security**: Hashed passwords, session cookies, CSRF protection, and PII sanitization.

## External Dependencies

### Third-Party Services
-   **Neon Database**: Serverless PostgreSQL hosting.
-   **Google Drive Integration**: Used for GM's image library browser for character/item images.
-   **Google OAuth**: For per-user Google Docs import/export in the Notes system. Users connect their own Google accounts, with tokens stored securely.

### Key NPM Dependencies
-   **UI & Styling**: Radix UI components, `tailwindcss`.
-   **Forms**: `react-hook-form`, `zod`.
-   **Database**: `drizzle-orm`, `@neondatabase/serverless`.
-   **Real-time**: `ws` library.
-   **3D Graphics**: `three`, `@react-three/fiber`, `@react-three/drei`, `cannon-es`.
-   **Utilities**: `date-fns`, `nanoid`, `bcryptjs`.