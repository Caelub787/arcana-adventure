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
    - **Sandbox System**: Simplified game system with custom templates/actors. Features a non-blurring 320px side panel for character management (fullscreen on mobile), floating/draggable actor and template editors (400px collapsible panels on desktop, fullscreen on mobile), hierarchical folder organization with expand/collapse, unified actor/template list with type badges, inline create form with type selector, and GM-only template dropdown in actor editors. All sandbox mutations enforce GM-only authorization.

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