# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview
Arcana Adventure is a full-stack web application designed for real-time tabletop RPG gameplay. It provides Game Masters (GMs) and players with collaborative tools for managing campaigns, including an interactive battle map with token management, comprehensive character creation and tracking, real-time chat, and campaign administration. The application features a dark fantasy aesthetic, offers distinct GM and player perspectives with role-based access control, and aims to serve as a central hub for TTRPG enthusiasts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology Stack**: React 18 with TypeScript, Vite, Wouter for routing, TanStack Query for server state.
- **UI/UX**: Tailwind CSS v4 with a dark fantasy theme, `shadcn/ui` components (Radix UI) with a "new-york" style variant, and Lucide React for iconography.
- **State Management**: React Context for authentication, TanStack Query for server state, local React hooks for component state.
- **Real-time Communication**: WebSockets for live updates across campaigns.
- **Key Features**:
    - **Battle Map**: Infinite grid space, fluid pan & zoom, GM scene management, configurable square/hexagon grids, real-time draggable character tokens with HP bars, custom background uploads, and viewport-independent centering.
    - **Scene Management**: Folder-based organization for scenes with drag-drop support. **View/Activate buttons** separate GM editing from player visibility - GMs can "View" a scene privately for editing while a different scene remains "Active" for players. WebSocket-synced active scene changes.
    - **Character Sheet**: Mobile-optimized design, responsive layout, single-scroll interface, and real-time updates.
    - **Species/Race System**: Database-driven management of custom species with auto-filled attributes. Supports both **System Species** (admin-created, global) and **Campaign Species** (GM-created, campaign-local with "(Campaign)" badge).
    - **Level-Up HP System**: Dynamic HP gain based on species `hpPerLevel` and level-dependent dice rolls.
    - **Attributes & Skills**: Six core attributes and seventeen skills with modifiers. Features single-click rolls, Roll Modifier Panel, and d30 usage for high attribute values. Includes a flexible **Custom Skills System** for admin-defined and character-specific skills.
    - **Traits System**: Admin-defined and character-specific traits with uses-per-long-rest tracking. Traits reset on long rest. Full admin management in Admin Settings and character sheet integration with use tracking, rolling, and visual uses display.
    - **Rest Mechanics**: Short and Long Rest options that restore HP and manage exhaustion, consuming rations automatically.
    - **Exhaustion System**: 0-5 levels tracked per character with visual display and GM controls, impacting speed, skill checks, and attack rolls.
    - **Inventory & Hotbars**: Comprehensive inventory with weight calculation, quantity management, item stacking, and hotbars for weapons, magic, skills, consumables, and utility items. Features an **Ammunition System** with configurable break chance and automatic re-equip.
    - **Initiative Tracking**: Real-time initiative system with GM controls for combat management.
    - **Roll Notification System**: Visual, animated notifications for all server-authoritative dice rolls integrated into chat.
    - **Targeting System**: Token targeting with range validation, hit detection (HIT!/MISS!/Crit Success!/Crit Failure!), and GM access to character hotbars.
    - **Armor Damage Reduction System**: Configurable armor items with damage reduction properties by type (Sharp/Blunt/Piercing/Flame/Frost/Storm/Tide/Stone/Flux/Light/Dark/Sound) and slot.
    - **Token Effects System**: Combat status effects (poison, burning, stun, etc.) with admin-defined effects, timing configuration (start of round vs start of turn), and optional damage settings.
        - **Effect Definitions**: Admin-created effects with name, image, description, timing, and optional damage (dice + type).
        - **Spell/Item Integration**: Effects can be linked to spells and weapons with trigger conditions (always, on success, on failure).
        - **Battle Map Display**: Effects icon on token top-right for GMs to apply effects, active effects shown on right side of tokens (max 4 visible with overflow indicator).
        - **Automatic Effect Processing**: When combat advances (start of turn or new round), effects automatically trigger dice rolls, apply damage/healing to characters, create chat messages, and broadcast WebSocket notifications. Multiple effects on the same turn accumulate correctly.
        - **Token Management**: Delete button moved to left side with confirmation dialog for safety.
    - **Feat Tree System**: Comprehensive, interactive skill tree editor for character progression.
        - **Feat Nodes**: Draggable nodes with tier-based visual styling (Bronze to Legendary).
        - **Prerequisites**: Curved SVG connection lines, requiring at least one prerequisite to be unlocked.
        - **Species Integration**: Feat trees assigned to species, inherited by characters.
        - **Feat Effects**: Eight effect types dynamically calculated client-side (hp_bonus, energy_bonus, dc_bonus, attribute_bonus, skill_bonus, spell_grant, item_grant, skill_grant for custom skills, trait_grant).
        - **Editor**: Context-sensitive effect editor and visual bonus indicators.
        - **Feat Library**: All feats are automatically saved to a reusable library. Enhanced template selector with search, effect previews, and tier badges when adding feats from library.
    - **Spell Management System**: System for defining and managing spells with properties like damage dice, type, range, energy cost, and attribute. Spells are granted via feats, roll like weapons, and support 13 damage types, including "Health" for healing.
    - **Feat Points System**: Characters earn feat points based on level for unlocking feats.
    - **Notes System**: Obsidian-like note-taking with folders, markdown support, and auto-save.
        - **Note Types**: Regular text notes and canvas pages for visual mind-mapping.
        - **Entity References**: Type `[[` to search and link game entities (spells, items, traits, skills, species, characters). Opening the reference picker with blank search shows all available entities. References are clickable in read mode, displaying entity details in a popup dialog.
        - **Permission-Based Characters**: Users can reference characters they own or all characters in campaigns where they are GM. Character references show portrait, race, level, HP, and energy.
        - **Canvas Editor**: Infinite pan/zoom canvas with draggable text, note link, and entity nodes connected by curved lines.
        - **Graph View**: Force-directed visualization showing all notes and their connections.
        - **Sharing**: Share notes with friends with view or edit permissions.
        - **Campaign Notes**: Notes can be scoped to campaigns via "Campaign Notes" button.
    - **Social Features**: User profiles with avatars/bios, friend system with requests, and user search.

### Backend
- **Technology Stack**: Express.js with TypeScript, `express-session` for session management.
- **API Design**: RESTful endpoints, WebSocket server at `/ws`, session-based authentication, and role-based access control.

### Data Storage
- **Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM.
- **Schema**: Comprehensive schema covering users, campaigns, scenes, characters, tokens, chat messages, initiative entries, feat data, spell definitions, custom skills, and traits.
- **Validation**: Zod schemas derived from Drizzle for client/server input validation.

### Authentication & Authorization
- **Authentication**: `bcryptjs` for password hashing, session-based authentication using `express-session` with PostgreSQL storage.
- **Authorization**: Three-tier role system:
    - **Owner (Primary GM)**: Full campaign control including role management
    - **Assistant GM**: Elevated permissions via isGM() for most GM actions, but cannot kick/ban the owner or change roles
    - **Player**: Standard player permissions
  Role changes available via dropdown in campaign settings (owner-only).
- **Security**: Hashed passwords, session cookies, CSRF protection, and PII sanitization.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Google Drive Integration**: Image library browser for character portraits and item images, restricted to a specific shared folder.

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