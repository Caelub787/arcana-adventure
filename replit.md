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
    - **Sandbox System**: FoundryVTT-style Dynamic System Builder. GMs create custom game systems with section-based templates and a visual drag-and-drop canvas editor.
      - **Data Model**: Types defined in `client/src/components/sandbox/types.ts`. Template data stored as JSON with `version` (2), `type`, `canvas` (SheetCanvas), `layoutNodes` (Record<string, LayoutNode>), `properties{}` (map by key), and `settings`. Actor values stored as `Record<string, ActorValue>` keyed by property key.
      - **Sheet Canvas**: Every template has exactly one SheetCanvas (`id`, `width`, `height`, `backgroundConfig`). The canvas represents the entire visible sheet area — there is no default body section; the canvas itself is the body.
      - **Layout Nodes**: Everything visible on a sheet is a LayoutNode. Types: `panel`, `tab`, `section`, `group`. Each node has `id`, `type`, `name`, `parentId` (nullable), `childrenIds[]`, `positionConfig` (x/y/anchor/zIndex), `sizeConfig` (width/height/minWidth/minHeight), `layoutMode` (grid/freeform/stack), `gridConfig`, `stackConfig`, `styleConfig`, `behaviorConfig`, `order`. Nodes form a tree via parentId/childrenIds.
      - **Tabs**: Tab nodes are layout nodes that control visibility of child nodes. They have `behaviorConfig.tabConfig` with `tabPosition` (top/bottom/left/right) and `activeTabId`. Tabs can exist inside the canvas, on outer edges, or nested inside other panels. Tabs do not hold properties — they show and hide child layout nodes.
      - **Sections**: Section nodes are the only nodes that host properties. Properties attach ONLY to section nodes via `sectionNodeId`. If a section node is hidden by a tab, its properties are hidden.
      - **Property Types**: text, number, boolean (checkbox), resource (current/max dual inputs), list (select dropdown), formula (read-only computed), pfp (profile picture). Each property has `id`, `key`, `type`, `sectionNodeId`, `defaultValue`, and nested `metadata` containing `label`, `tooltip`, `uiConfig` (x/y/width/height/labelFontSize/valueFontSize/labelPosition), `style`, `options`, `formulaExpression`, `resourceConfig`.
      - **Default Template Structure**: New templates auto-generate with a single "Main" section node containing PFP and Name properties.
      - **Template Canvas Editor**: Properties are positioned within section nodes using freeform layout (x/y/width/height from metadata.uiConfig). Grid snapping (10px) for alignment. Each section shows an add-property button. Properties can be dragged and resized within sections. "Add Layout Node" button allows creating panel/tab/section/group nodes.
      - **Render Pipeline**: Load template → load sheet canvas → build layout tree recursively → resolve tab visibility → render layout nodes → inject sections → inject properties → bind actor values.
      - **Actor Rendering**: Layout nodes rendered recursively with tab visibility resolution. Properties rendered with absolute positioning within their section node. Supports desktop (freeform positioned) and mobile (linear flow) layouts.
      - **Migration**: `migrateTemplateData()` in types.ts converts v1 (sections[]) and old array formats to v2 (canvas + layoutNodes) automatically on load.
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