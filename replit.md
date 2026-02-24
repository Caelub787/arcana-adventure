# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview
Arcana Adventure is a full-stack web application designed as a comprehensive hub for real-time tabletop RPG gameplay. It offers Game Masters (GMs) and players collaborative tools for campaign management, including an interactive battle map, character creation, real-time chat, and campaign administration. The project aims to streamline the TTRPG experience with a dark fantasy aesthetic, distinct GM and player perspectives, and robust role-based access control.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
-   **Technology Stack**: React 18 with TypeScript, Vite, Wouter, TanStack Query.
-   **UI/UX**: Tailwind CSS v4 with a dark fantasy theme, `shadcn/ui` components (Radix UI), and Lucide React for iconography.
-   **State Management**: React Context for authentication, TanStack Query for server state.
-   **Real-time Communication**: WebSockets for live updates.
-   **Key Features**:
    -   **Battle Map**: Interactive map with token management (draggable, HP/energy, initiative glow, GM viewport tracking), scene management, custom backgrounds, and a dynamic Fog of War system with walls, doors, windows, lighting, and vision calculation.
    -   **Character Management**: Mobile-optimized character sheets with real-time updates, custom species/races, dynamic HP/energy, templates, and embedded items/spells.
    -   **Game Mechanics**: Real-time chat with dice rolls, attributes/skills, traits, rest mechanics, exhaustion, inventory with hotbars, initiative tracker, roll notifications, targeting with range/hit detection (including AOE), armor damage reduction, combat status effects, and a customizable player hotbar.
    -   **Feat System**: Interactive feat tree editor with draggable nodes, tier-based styling, prerequisites, and dynamic effects.
    -   **Spell Management**: System for defining spells with properties like damage, type, range, cost, and attribute.
    -   **Notes System**: Obsidian-like note-taking with nested folders, markdown, rich text, entity references, collaborative editing, Canvas editor, and Graph View. Integrated with Worldbuilding — notes support [[Entity Name]] wiki-links that resolve to worldbuilding entities, and campaign Notes panel includes a "World" section for browsing/editing world entities inline.
    -   **Sandbox System**: Rules-agnostic Dynamic System Builder for custom VTTRPG systems, featuring flexible property placement, various property types, a full dice engine, expression engine for calculations and conditional visibility, and extensive styling options.
    -   **Vision Zones**: GM-drawn freeform polygons to define indoor/outdoor areas, overriding scene day/night settings for vision calculations.
    -   **Worldbuilding Wiki System**: Unified worldbuilding platform accessible via World Builder page (/worldbuilder) and within campaigns via Notes. Five sections: Encyclopedia (wiki articles for 12 entity types with markdown editor, template fields, 22 link types), Maps (interactive world maps with clickable pins — text reveals, map drill-downs, entity links), Timeline (dynamic events grouped by era with calendar integration), Calendar (custom calendar systems with custom months/days/weekdays and day annotations), and Graph (force-directed relationship visualization). Features: public share links for players (/shared/:token, no auth required), visibility controls (GM-only/shared/player-visible), breadcrumb map navigation, pin placement editor, WebSocket live sync for all changes.
    -   **Share System**: GMs can generate public share links for their world. Unauthenticated visitors see all player-visible content (articles, maps, timeline, calendar) in a read-only view.

### Backend
-   **Technology Stack**: Express.js with TypeScript, `express-session`.
-   **API Design**: RESTful endpoints, WebSocket server, session-based authentication, and role-based access control.

### Data Storage
-   **Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM.
-   **Schema**: Comprehensive schema covering all application entities.
-   **New Worldbuilding Tables**: `world_share_links` (public share tokens), `world_maps` (interactive maps with self-referential parent_map_id), `world_map_pins` (clickable pins with text_reveal/map_link/entity_link types), `world_calendars` (custom calendar systems with month/day/weekday names), `world_timeline_events` (timeline events with era grouping and calendar integration).
-   **Validation**: Zod schemas for input validation.

### Authentication & Authorization
-   **Authentication**: `bcryptjs` for password hashing, session-based authentication.
-   **Authorization**: Three-tier role system (Owner, Assistant GM, Player) and a four-tier character access permission system.
-   **Security**: Hashed passwords, session cookies, CSRF protection, and PII sanitization.

## Key Worldbuilding Components
-   `client/src/pages/WorldBuilder.tsx` — Main unified world builder with sidebar section navigation
-   `client/src/pages/SharedWorldView.tsx` — Public read-only world viewer (no auth)
-   `client/src/components/worldbuilding/WikiArticleEditor.tsx` — Markdown article editor with template fields
-   `client/src/components/worldbuilding/WorldMapViewer.tsx` — Interactive map viewer with clickable pins
-   `client/src/components/worldbuilding/WorldMapEditor.tsx` — GM map editor (place pins, set images)
-   `client/src/components/worldbuilding/TimelineView.tsx` — Dynamic timeline with era grouping
-   `client/src/components/worldbuilding/WorldCalendar.tsx` — Custom calendar system
-   `client/src/components/worldbuilding/RelationshipGraph.tsx` — Force-directed entity graph
-   `client/src/components/worldbuilding/EntitySidePanel.tsx` — Entity detail panel (6 tabs)
-   `client/src/components/worldbuilding/WorldbuilderPanel.tsx` — Entity creation dialog
-   `client/src/lib/worldbuilding-api.ts` — All worldbuilding API hooks and WebSocket sync

## External Dependencies

### Third-Party Services
-   **Neon Database**: Serverless PostgreSQL hosting.
-   **Google Drive Integration**: Image library browser for character/item images.

### Key NPM Dependencies
-   **UI & Styling**: Radix UI components, `tailwindcss`.
-   **Forms**: `react-hook-form`, `zod`.
-   **Database**: `drizzle-orm`, `@neondatabase/serverless`.
-   **Real-time**: `ws` library.
-   **3D Graphics**: `three`, `@react-three/fiber`, `@react-three/drei`, `cannon-es`.
-   **Utilities**: `date-fns`, `nanoid`, `bcryptjs`.
