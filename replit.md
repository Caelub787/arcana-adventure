# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview
Arcana Adventure is a full-stack web application designed for real-time tabletop RPG gameplay, providing GMs and players with collaborative tools for campaigns. It features an interactive battle map with token management, comprehensive character creation and tracking, real-time chat, and campaign management. The application sports a dark fantasy aesthetic, offering distinct GM and player perspectives with role-based access control, and aims to be a central hub for TTRPG enthusiasts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology Stack**: React 18 with TypeScript, Vite, Wouter for routing, TanStack Query for server state.
- **UI/UX**: Tailwind CSS v4 with a dark fantasy theme, `shadcn/ui` components (Radix UI) with a "new-york" style variant, and Lucide React for iconography.
- **State Management**: React Context for authentication, TanStack Query for server state, local React hooks for component state.
- **Real-time Communication**: WebSockets for live token movement, chat, and permission updates within campaign-specific "rooms".
- **Battle Map**: Features include infinite grid space, fluid pan & zoom, GM scene management, configurable square/hexagon grids, free token movement, custom background uploads, and real-time draggable character tokens with HP bars.
- **Character Sheet**: Mobile-optimized design with icon-based tabs, responsive layout, single-scroll interface, touch-friendly elements, and real-time updates via optimistic UI.
- **Race System**: Supports 20 playable races with auto-filled attributes like size, natural armor, and speed.
- **Attributes & Skills**: Six attributes and fifteen skills, all with modifiers equal to their value. Features single-click rolls and double-click/long-press for a Roll Modifier Panel.
- **Inventory & Hotbars**: Includes a comprehensive inventory with weight calculation (base carry capacity + Might modifier), quantity management, and item stacking. Hotbars support weapons (left hand, right hand, ammunition slots with compatibility checks), magic, skills, consumables, and utility items.
- **Initiative Tracking**: Real-time initiative system accessible to all users, with GM controls for combat management, turn advancement, and visibility.
- **Roll Notification System**: Visual, animated notifications for all dice rolls (d4-d20) with distinct styling for different roll types (dice, initiative, "Crit Success" on natural 20, "Crit Failure" on natural 1). All rolls are server-authoritative and integrated into the chat.

### Backend
- **Technology Stack**: Express.js with TypeScript, `express-session` for session management.
- **API Design**: RESTful endpoints, session-based authentication, WebSocket server at `/ws`, and role-based access control.

### Data Storage
- **Database**: PostgreSQL via Neon serverless, managed with Drizzle ORM.
- **Schema**: Comprehensive schema including `users`, `campaigns`, `scenes`, `characters`, `tokens`, `chatMessages`, `initiativeEntries`, and more.
- **Validation**: Zod schemas derived from Drizzle for robust client/server input validation.

### Authentication & Authorization
- **Authentication**: `bcryptjs` for password hashing, session-based authentication using `express-session` with PostgreSQL storage.
- **Authorization**: GM and Player roles with granular permissions. GMs have full control over their campaigns, including character access levels (None/View/Edit) and member moderation (kick/ban).
- **Security**: Hashed passwords, session cookies with 7-day expiry, CSRF protection, and PII sanitization.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting.

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