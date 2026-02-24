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
    -   **Notes System**: Obsidian-like note-taking with nested folders, markdown, rich text, entity references, collaborative editing, Canvas editor, and Graph View.
    -   **Sandbox System**: Rules-agnostic Dynamic System Builder for custom VTTRPG systems, featuring flexible property placement, various property types, a full dice engine, expression engine for calculations and conditional visibility, and extensive styling options.
    -   **Vision Zones**: GM-drawn freeform polygons to define indoor/outdoor areas, overriding scene day/night settings for vision calculations.
    -   **Worldbuilding Wiki System**: Full wiki-style worldbuilding encyclopedia. Entity types: character, location, faction, quest, event, lore, item, encounter, clue, magic, timeline, article. Each entity has a rich markdown article editor with type-specific template fields, wiki-link syntax ([[EntityName]]), auto-save, and markdown toolbar. Three views: Wiki (article editor with sidebar navigation), Timeline (chronological event display with era grouping), and Graph (force-directed relationship visualization with pan/zoom). Features: 22 link types, visibility controls (GM-only/shared/player-visible), "What Links Here" backlinks, recently edited sidebar, category filtering, entity cross-referencing, and live WebSocket sync. Components: WorldBuilder page (/worldbuilder), WikiArticleEditor, TimelineView, RelationshipGraph, WorldbuilderPanel (sidebar), EntitySidePanel (embedded or overlay, 6-tab detail view), EntityPicker (searchable dropdown), SheetEmbed/InventoryEmbed (live character data views).

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

### Key NPM Dependencies
-   **UI & Styling**: Radix UI components, `tailwindcss`.
-   **Forms**: `react-hook-form`, `zod`.
-   **Database**: `drizzle-orm`, `@neondatabase/serverless`.
-   **Real-time**: `ws` library.
-   **3D Graphics**: `three`, `@react-three/fiber`, `@react-three/drei`, `cannon-es`.
-   **Utilities**: `date-fns`, `nanoid`, `bcryptjs`.