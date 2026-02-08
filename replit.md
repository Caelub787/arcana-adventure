# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview
Arcana Adventure is a full-stack web application designed to be a central hub for real-time tabletop RPG gameplay. It provides Game Masters (GMs) and players with collaborative tools for managing campaigns, including an interactive battle map with token management, comprehensive character creation and tracking, real-time chat, and campaign administration. The application features a dark fantasy aesthetic, offers distinct GM and player perspectives with robust role-based access control, and aims to streamline the TTRPG experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology Stack**: React 18 with TypeScript, Vite, Wouter, TanStack Query.
- **UI/UX**: Tailwind CSS v4 with a dark fantasy theme, `shadcn/ui` components (Radix UI) styled in "new-york" variant, and Lucide React for iconography.
- **State Management**: React Context for authentication, TanStack Query for server state.
- **Real-time Communication**: WebSockets for live updates.
- **Key Features**:
    - **Battle Map**: Infinite grid, pan/zoom, GM scene management, configurable grids, real-time draggable tokens with HP/energy, custom backgrounds, size-based token scaling, initiative glow, GM player viewport tracking, and a beacon system for highlighting map areas.
    - **Scene Management**: Folder-based organization with drag-drop, separate "View" (GM private) and "Active" (player visible) states, synchronized via WebSockets.
    - **Character Sheet**: Mobile-optimized, responsive, single-scroll interface with real-time updates.
    - **Species/Race System**: Database-driven management of custom species (system-wide or campaign-local).
    - **Level-Up Systems**: Dynamic HP and Energy gain based on species-defined rates and level-dependent dice rolls.
    - **Campaign Chat**: Real-time chat with integrated dice rolls and auto-scroll.
    - **Character Templates**: Admin-created, folder-organized, pre-configured character sheets copyable by GMs.
    - **Attributes & Skills**: Six core attributes, seventeen skills, single-click rolls, Roll Modifier Panel, d30 usage, and a flexible custom skills system.
    - **Traits System**: Admin-defined and character-specific traits with uses-per-long-rest tracking and reset mechanics.
    - **Rest Mechanics**: Short and Long Rest options to restore HP and manage exhaustion.
    - **Exhaustion System**: 0-5 levels tracked per character with visual display and GM controls.
    - **Inventory & Hotbars**: Comprehensive inventory with weight, quantity, stacking. Hotbars for various item types, including an ammunition system with break chance and re-equip, and a throwable items system for persistent map tokens with AOE detonation. GM Library Items enable cross-campaign reuse.
    - **Initiative Tracking**: Real-time initiative system with GM controls.
    - **Roll Notification System**: Visual, animated notifications for all server-authoritative dice rolls.
    - **Targeting System**: Token targeting with range validation, hit detection (HIT!/MISS!/Crit), and GM access to hotbars.
    - **Armor Damage Reduction System**: Configurable armor with damage reduction by type and slot.
    - **Token Effects System**: Combat status effects (poison, burning, etc.) with admin-defined effects, timing configuration, optional damage, spell/item integration, battle map display, automatic processing with duration tracking, and auto-removal.
    - **Feat Tree System**: Interactive skill tree editor with draggable nodes, tier-based styling, prerequisites, species integration, eight dynamic effect types (hp_bonus, energy_bonus, dc_bonus, attribute_bonus, skill_bonus, spell_grant, item_grant, skill_grant, trait_grant), context-sensitive editor, and a reusable feat library.
    - **Spell Management System**: System for defining spells with properties like damage, type, range, cost, and attribute, granted via feats.
    - **Feat Points System**: Characters earn feat points based on level.
    - **Notes System**: Obsidian-like note-taking with nested folders, markdown support, auto-save, multiple tabs, rich text editing, entity references, note linking, new note creation syntax, permission-based character references, a Canvas editor for visual mind-mapping (text, note links, entities, images, videos, external links), Graph View, sharing options, campaign-specific notes/folders, real-time collaborative editing with presence indicators, and folder reordering with drag-and-drop support and sort modes (Name, Date, Custom). Notes tab in the side panel shows a folder browser (NotesFolderBrowser); selecting a note opens a floating/draggable/resizable FloatingNotesEditor panel containing the full CampaignNotesPanel with tabs and sidebar.
    - **Social Features**: User profiles, friend system, and user search.
    - **Sandbox System**: FoundryVTT-style Dynamic System Builder. GMs create custom game systems with a visual drag-and-drop canvas editor. Properties can be placed freely anywhere — directly on the canvas root or inside containers.
      - **Data Model (v3)**: Types defined in `client/src/components/sandbox/types.ts`. Template data stored as JSON with `version` (3), `type`, `canvas` (SheetCanvas), `layoutNodes` (Record<string, LayoutNode>), `properties{}` (map by key), and `settings`. Actor values stored as `Record<string, ActorValue>` keyed by property key.
      - **Sheet Canvas**: Every template has exactly one SheetCanvas (`id`, `width`, `height`, `backgroundConfig`). The canvas is the true blank slate — properties can be placed directly on it without any containers.
      - **Layout Nodes**: Optional organizational containers. Types: `panel`, `tab`, `section`, `group`. Each node has `id`, `type`, `name`, `parentId` (nullable), `childrenIds[]`, `positionConfig`, `sizeConfig`, `layoutMode` (grid/freeform/stack), `gridConfig`, `stackConfig`, `styleConfig`, `behaviorConfig`, `order`. Nodes form a recursive tree — tabs inside panels inside tabs is fully supported.
      - **Tabs**: Tab nodes control visibility of child nodes. They have `behaviorConfig.tabConfig` with `tabPosition`, `activeTabId`, `tabLayout` (top/left/right for button placement), and `tabIcons` (per-child-panel icon/emoji). Tab creation auto-generates 2 child panels. Tab bar supports: click to switch, double-click to rename, right-click for context menu (rename/delete/move/set icon), and "+" button to add new tab pages. Can be nested at any depth.
      - **Collapsible Panels**: Panels support collapsible behavior via `behaviorConfig.panelConfig` with `collapsible` and `defaultCollapsed` flags. Works in both template editor and actor views.
      - **Properties**: Properties use `parentId` (null = canvas root, string = inside a layout node). Any layout node type can host properties. Each property has `id`, `key`, `type`, `parentId`, `defaultValue`, and nested `metadata` containing `label`, `tooltip`, `uiConfig` (x/y/width/height/labelFontSize/valueFontSize/labelPosition), `style`, `options`, `formulaExpression`, `resourceConfig`.
      - **Property Types**: text, number, boolean (checkbox), resource (current/max dual inputs), list (select dropdown), formula (read-only computed), textarea (multi-line text field sized per template).
      - **Type-Specific Settings**: Each property type has unique settings in the property settings panel: text/textarea get placeholder, number gets min/max/step, resource gets show-bar/bar-color, formula gets expression field, list gets comma-separated options editor. Property type can be changed from the settings panel.
      - **Default Template Structure**: New templates start with a blank canvas containing a Name text property placed directly on canvas root.
      - **Template Canvas Editor**: Properties positioned using freeform layout (x/y/width/height from metadata.uiConfig). Grid snapping (10px). Properties can be placed on canvas root or inside any layout node. "Add Layout Node" button creates panel/tab/section/group. "Add Property" button available on canvas root and inside each container.
      - **Render Pipeline**: Load template → load canvas → render canvas-root properties → build layout tree recursively → resolve tab visibility → resolve panel collapse → render layout nodes → inject properties → bind actor values.
      - **Actor Rendering**: Recursive rendering at all nesting depths with tab visibility and panel collapse resolution. Canvas-root properties rendered at absolute positions. Supports desktop (freeform) and mobile (linear flow) layouts.
      - **Migration**: `migrateTemplateData()` in types.ts converts v1 (sections[]), v2 (sectionNodeId), and old array formats to v3 (parentId) automatically on load. Unmatched section references map to canvas root (null).
      - **Profile Picture (PFP) Property**: Dedicated `pfp` property type for character images. Double-click in actor view opens a floating editor panel with Google Drive image browser integration and device file upload (5MB limit). Displays image preview with hover overlay.
      - **Property Styling**: Full visual customization per property — text color, background color/gradient (linear/radial with freeform stops), border (toggle, color, width, radius, style), font weight/family, opacity, padding. Style editor component at `client/src/components/sandbox/PropertyStyleEditor.tsx`.
      - **Tooltips**: All properties support a `tooltip` field for hover descriptions. Rendered as native title attributes on property containers.
      - **Folder Colors**: Sandbox folders support custom colors via right-click context menu with preset color options.

### Backend
- **Technology Stack**: Express.js with TypeScript, `express-session`.
- **API Design**: RESTful endpoints, WebSocket server at `/ws`, session-based authentication, and role-based access control.

### Data Storage
- **Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM.
- **Schema**: Comprehensive schema covering all application entities.
- **Validation**: Zod schemas for input validation.

### Authentication & Authorization
- **Authentication**: `bcryptjs` for password hashing, session-based authentication.
- **Authorization**: Three-tier role system (Owner, Assistant GM, Player) with distinct permissions.
- **Character Access Levels**: Four-tier permission system (None, Name, View, Edit) for character visibility and modification.
- **Security**: Hashed passwords, session cookies, CSRF protection, and PII sanitization.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Google Drive Integration**: Image library browser for character/item images from a shared folder.

### Build & Development Tools
- **Replit Integrations**: `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`.
- **Vite Plugins**: `vite-plugin-meta-images`.

### Key NPM Dependencies
- **UI & Styling**: Radix UI components, `tailwindcss`.
- **Forms**: `react-hook-form`, `zod`.
- **Database**: `drizzle-orm`, `@neondatabase/serverless`.
- **Real-time**: `ws` library.
- **3D Graphics**: `three`, `@react-three/fiber`, `@react-three/drei`, `cannon-es`.
- **Utilities**: `date-fns`, `nanoid`, `bcryptjs`.