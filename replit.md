# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview

Arcana Adventure is a full-stack web application for real-time tabletop RPG gameplay, offering game masters (GMs) and players collaborative tools for campaigns. Key features include an interactive battle map with token management, comprehensive character creation and tracking, real-time chat, and campaign management. Designed with a dark fantasy aesthetic, it provides distinct GM and player perspectives with role-based access control, aiming to be a central hub for TTRPG enthusiasts.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React 18 with TypeScript, Vite, Wouter for routing, TanStack Query for server state.
**UI/UX Decisions**: Tailwind CSS v4 with a custom dark fantasy theme, `shadcn/ui` components (Radix UI) with a "new-york" style variant for a medieval/fantasy aesthetic, and Lucide React for iconography.
**State Management**: React Context for authentication, TanStack Query for server state, local React hooks for component state.
**Real-time Communication**: WebSocket for live token movement and chat, utilizing campaign-specific "rooms".

**Battle Map Features**:
-   **Infinite Grid Space**: A 20000x20000px world container for limitless panning.
-   **Pan & Zoom**: Fluid pan (1-finger touch/drag or click-drag) and zoom (2-finger pinch or mouse wheel) with smooth Framer Motion animations. Zoom range 0.2x to 3x, with zoom-to-cursor/pinch center.
-   **Scene Management (GM)**: Create, switch, and delete scenes, each with independent settings (background, grid, default view).
-   **Grid System**: Toggleable square or hexagon grids with configurable sizes (30-100px), supporting token snapping.
-   **Backgrounds**: Upload custom base64 battle map images per scene.
-   **Tokens**: Draggable character and enemy tokens with real-time sync, displaying character portraits and HP bars.

### Backend Architecture

**Technology Stack**: Express.js with TypeScript, `express-session` for session management.
**API Design**: RESTful endpoints, session-based authentication, WebSocket server at `/ws`, role-based access control.
**Development/Production**: Vite dev server integration for development; static file serving from `dist/public` for production.

### Data Storage

**Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM for type-safe queries.
**Schema**: Includes `users`, `campaigns`, `scenes`, `campaignMembers`, `characters`, `tokens`, and `chatMessages`.
**Validation**: Zod schemas generated from Drizzle for client/server input validation.

### Authentication & Authorization

**Authentication**: Password hashing with `bcryptjs`, session-based authentication using `express-session` with PostgreSQL storage (`connect-pg-simple`).
**Authorization**: GM and Player roles with granular permissions stored in `campaignMembers`. GMs have full control over their campaigns; Players have restricted access to their own characters and campaign actions.
**Security**: Hashed passwords, session cookies with 7-day expiry, CSRF protection, environment-based session secrets, PII sanitization in API responses.

## External Dependencies

### Third-Party Services
-   **Neon Database**: Serverless PostgreSQL hosting.

### Build & Development Tools
-   **Replit Integrations**: `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`.
-   **Vite Plugins**: `vite-plugin-meta-images`.

### Key NPM Dependencies
-   **UI & Styling**: Radix UI components, `tailwindcss`.
-   **Forms**: `react-hook-form`, `zod`.
-   **Database**: `drizzle-orm`, `@neondatabase/serverless`.
-   **Real-time**: `ws` library.
-   **Utilities**: `date-fns`, `nanoid`, `bcryptjs`.

### Environment Configuration
-   `DATABASE_URL`
-   `SESSION_SECRET`
-   `NODE_ENV`
-   `REPL_ID`