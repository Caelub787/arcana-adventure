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
    -   **Notes System**: Obsidian-like note-taking with nested folders, markdown, rich text, entity references, collaborative editing, Canvas editor, and Graph View, integrated with the Worldbuilding system.
    -   **Worldbuilding Wiki System**: Unified platform for creating independent "Worlds" with articles, maps, timelines, calendars, and relationship graphs. Features include wiki-link autocomplete, public share links, visibility controls, and WebSocket live sync. Worlds can be linked to campaigns.
    -   **Campaign Map Pins**: Interactive pins on the battlemap with percentage-based coordinates, supporting text reveals and scene links. Pins can be marked as shops.
    -   **Shop System**: GMs manage shop inventories (items, prices, stock, currency) linked to map pins. Players can buy/sell items with automatic currency conversion and a charisma-based haggling d20 roll. Shops can be linked to shopkeeper characters for automated currency tracking.

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