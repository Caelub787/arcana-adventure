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