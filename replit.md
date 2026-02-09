# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview
Arcana Adventure is a full-stack web application providing a central hub for real-time tabletop RPG gameplay. It offers Game Masters (GMs) and players collaborative tools for campaign management, including an interactive battle map, comprehensive character creation, real-time chat, and campaign administration. The application features a dark fantasy aesthetic, distinct GM and player perspectives with robust role-based access control, and aims to streamline the TTRPG experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
-   **Technology Stack**: React 18 with TypeScript, Vite, Wouter, TanStack Query.
-   **UI/UX**: Tailwind CSS v4 with a dark fantasy theme, `shadcn/ui` components (Radix UI), and Lucide React for iconography.
-   **State Management**: React Context for authentication, TanStack Query for server state.
-   **Real-time Communication**: WebSockets for live updates.
-   **Key Features**:
    -   **Battle Map**: Interactive map with token management (draggable, HP/energy, initiative glow, GM viewport tracking), scene management (folder-based, 'View'/'Active' states), and custom backgrounds.
    -   **Character Management**: Mobile-optimized character sheets with real-time updates, custom species/races, dynamic HP/energy level-up systems, and admin-created character templates.
    -   **Game Mechanics**: Real-time chat with dice rolls, attributes/skills with d30 rolls, traits system, short/long rest mechanics, exhaustion tracking, inventory with hotbars, initiative tracker, roll notifications, targeting system with range/hit detection, armor damage reduction, and combat status effects.
    -   **Feat System**: Interactive feat tree editor with draggable nodes, tier-based styling, prerequisites, and dynamic effects (e.g., bonus to HP, energy, attributes, skills, spells, items).
    -   **Spell Management**: System for defining spells with properties like damage, type, range, cost, and attribute.
    -   **Notes System**: Obsidian-like note-taking with nested folders, markdown, rich text, entity references, real-time collaborative editing, Canvas editor for visual mind-mapping, and Graph View.
    -   **Sandbox System**: A rules-agnostic Dynamic System Builder allowing GMs to design custom VTTRPG systems. Features include flexible property placement, various property types (text, number, resource, button, label, etc.), a full dice engine, expression engine for calculations and conditional visibility, resource enhancements (color thresholds, gradients), and extensive styling options per property.

### Backend
-   **Technology Stack**: Express.js with TypeScript, `express-session`.
-   **API Design**: RESTful endpoints, WebSocket server, session-based authentication, and role-based access control.

### Data Storage
-   **Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM.
-   **Schema**: Comprehensive schema covering all application entities.
-   **Validation**: Zod schemas for input validation.

### Authentication & Authorization
-   **Authentication**: `bcryptjs` for password hashing, session-based authentication.
-   **Authorization**: Three-tier role system (Owner, Assistant GM, Player) and a four-tier character access permission system.
-   **Security**: Hashed passwords, session cookies, CSRF protection, and PII sanitization.

## External Dependencies

### Third-Party Services
-   **Neon Database**: Serverless PostgreSQL hosting.
-   **Google Drive Integration**: Image library browser for character/item images.

### Build & Development Tools
-   **Vite Plugins**: `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`, `vite-plugin-meta-images`.

### Key NPM Dependencies
-   **UI & Styling**: Radix UI components, `tailwindcss`.
-   **Forms**: `react-hook-form`, `zod`.
-   **Database**: `drizzle-orm`, `@neondatabase/serverless`.
-   **Real-time**: `ws` library.
-   **3D Graphics**: `three`, `@react-three/fiber`, `@react-three/drei`, `cannon-es`.
-   **Utilities**: `date-fns`, `nanoid`, `bcryptjs`.

## Recent Changes (Feb 2026)
- **Multi-Roll System**: New `rollEntries` table allows GMs to define multiple roll entries per item or spell. Each roll has name, type (attack/damage/heal/effect), dice formula, modifier, attribute bonus, damage type, and apply-to-stat (hp/energy/none). Rolls are clickable from ItemDetailDialog and SpellDetailDialog. Self-targeting stat application via WebSocket combat damage/energy.
- **Character Overview Redesign**: Portrait always visible top-left, HP/Energy bars stacked right, DC below, two-column info grid, feat tree at bottom.
- **Embedded Items/Spells**: Character actor sheets can embed items/spells from other templates. Each embedded item stores its own values, has collapsible UI, roll buttons that merge parent actor context with item values.
- **AOE Targeting**: Button properties have `targetingConfig` (type: none/self/single/aoe, shape, range, hitFormula, damageFormula). AOE buttons enter battlemap targeting mode, auto-resolve hits against tokens in area.
- **Player Hotbar**: 8-slot customizable bottom bar (localStorage-persisted per campaign/user). Slots: roll buttons or sheet shortcuts. Right-click to clear, toggle visibility.
- **Dice Engine Fixes**: Corrected keep/drop lowest, per-die explosion totaling for keep/drop, proper error reporting.
- **Fog of War System**: Complete dynamic fog of war with walls, doors, windows, lighting, and vision calculation.
  - **Schema**: `scene_walls`, `scene_doors`, `scene_windows`, `scene_lights` tables. Fog settings on scenes (`fogEnabled`, `fogOpacity`, `fogExploredDimness`, `isDayTime`, `globalLightLevel`, `fogState`). Vision fields on characters (`visionType`, `visionDistanceFeet`, `darkvisionDistanceFeet`, `blindsightDistanceFeet`, `truesightDistanceFeet`, `tremorsenseDistanceFeet`, `visionDayDistanceFeet`, `visionNightDistanceFeet`). Vision overrides on tokens (`isBlind`, `visionOverrideDistance`, `visionOverrideType`). Vision modifiers on traits.
  - **Wall Types**: solid (blocks all), transparent (movement only), one_way (vision from one side), invisible (movement only, faint rendering)
  - **Door/Window States**: Doors can be open/closed/locked with click-to-toggle. Windows always allow partial vision.
  - **Vision Engine** (`client/src/lib/visionEngine.ts`): Raycasting at 1-degree intervals with shadow casting for visibility polygon calculation. Blocking segments from walls, closed doors, windows. Vision types: normal, darkvision, blindsight, truesight, tremorsense with day/night distance fields.
  - **Lighting**: Static lights with radius, color, intensity, flicker. Placed on map via GM tool.
  - **Day/Night**: Scene-level toggle affects vision distances. Global light level (0.0-1.0).
  - **GM Tools Panel** (`FogOfWarOverlay.tsx`): Wall drawing (snap-to-grid, wall types), door/window/light placement, fog toggle, day/night toggle, opacity/dimness sliders, clear walls.
  - **WebSocket Sync**: Real-time fog updates via `wall_created`, `door_toggled`, `fog_state_updated`, etc. GM-authoritative fog state.
  - **Player View**: Players see fog with vision polygon cutouts based on their token positions and character vision settings. Vision filtered to only show the current player's assigned token's view. Fog is fully opaque (fillOpacity=1) for players. Tokens outside vision polygons are completely hidden (not rendered). Walls, doors, windows, and lights are hidden from players when fog is enabled. Players with no assigned token see no tokens when fog is enabled.
  - **Vision Polygon Export**: FogOfWarOverlay exports computed vision polygons via `onVisionPolygonsChange` callback. BattleMap uses point-in-polygon ray casting to filter visible tokens.
  - **Nighttime Filter**: Dark blue tint overlay (`#0a1628` at 35% opacity) applied when scene is set to nighttime.
  - **Token Vision Settings**: Long-press on token shows Layers icon in bottom-left. Clicking it opens vision settings panel (vision type, day/night distance).
  - **Click-to-Place Tokens**: GM clicks "+" on character in panel, then clicks map to place token at that location.
  - **Character Sheet Tab Buttons**: Removed right-side floating tab buttons. Character sheets accessed via triple-click on tokens.
  - **Right Toolbar Order**: Characters, Initiative, Notes, Scene Settings (GM), Fog of War (GM), Settings.
- **Chat /roll Command**: `/roll` command in chat (e.g. `/roll 1d20`, `/roll 2d6+3`) using existing dice engine. Results displayed as roll messages.
- **Private Messaging**: Chat has "To:" dropdown to select recipient (All or specific member). Whisper messages only visible to sender and recipient. Purple styling for whisper messages. Schema: `recipient_id` and `recipient_name` columns on `chat_messages`. Server filters whispers in both WebSocket broadcast and REST fetch.
- **Character Panel Performance**: Optimistic updates for folder creation and character moves between folders to eliminate refetch lag.
- **Floating Notes Fixes**: Fixed close/minimize buttons (pointer capture was blocking button clicks), fixed canvas/notes not filling available space when panel resized larger.
- **Vision Engine Improvements**: Fixed wall bidirectional blocking (improved raycasting deduplication precision and epsilon handling). Players now see only their single assigned token's vision, not all characters. GM "See as Player" and "See All Vision" toggles persist in localStorage per campaign. Added vision properties (visionType, dayVisionDistance, nightVisionDistance) to both system and campaign species tables with form fields in admin and campaign species editors. Character creation auto-inherits species vision defaults.
- **Light-Vision Integration**: Lights no longer independently reveal areas to players. Instead, `calculateVisionInLight()` in visionEngine.ts casts rays from the player's token position, clipped to each light's circle. Players only see lit areas they have line-of-sight to from their token. Walls between the player and a light's illumination block visibility correctly. Distance culling skips lights beyond 5000px + lightRadius.
- **Ctrl+Snap to Endpoints**: When drawing walls/doors/windows/lights, holding Ctrl (or Cmd on Mac) snaps to the nearest existing endpoint (wall corner, door edge, window edge, or light position) within 1.5 grid cells. Works whether grid snap is on or off. Uses `findNearestEndpoint()` helper in FogOfWarOverlay.tsx.
- **Character Sheet Button Position**: Moved from `bottom-[72px]` to `bottom-[140px]` to avoid overlapping with the player hotbar.