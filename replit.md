# Arcana Adventure - Mobile RPG Manager & Tabletop Hub

## Overview

Arcana Adventure is a full-stack web application designed for tabletop RPG gameplay, enabling game masters (GMs) and players to collaborate in real-time campaigns. The application features a battle map with token management, character creation and tracking, real-time chat, and campaign management capabilities. Built with a dark fantasy aesthetic, it provides both GM and player perspectives with role-based access control.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- **React 18** with TypeScript for the UI layer
- **Vite** as the build tool and development server with HMR support
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query (React Query)** for server state management and data fetching
- **Tailwind CSS v4** for styling with custom dark fantasy theme variables

**UI Component Library**
- **shadcn/ui** components built on Radix UI primitives
- Custom "new-york" style variant with medieval/fantasy theming
- Extensive component library including dialogs, sheets, cards, forms, and data display components
- **Lucide React** for iconography

**State Management Strategy**
- Authentication state managed through React Context (`AuthContext`)
- Server state managed by TanStack Query with custom query functions
- Local component state with React hooks
- Session-based authentication with cookies

**Real-time Communication**
- WebSocket connection for live token movements and chat messages
- Campaign-specific "rooms" for broadcasting updates to participants
- Custom WebSocket event types for `join_campaign`, `token_move`, and `chat_message`

**Battle Map Features**
- Interactive grid-based battle map with token management
- **Pan functionality**: Click and drag to pan the map view, with drag constraints to keep the map bounded within the viewport
- **Zoom functionality**: 
  - Desktop: Mouse wheel scroll to zoom in/out, zooms toward cursor position
  - Mobile/Touch: Two-finger pinch gesture to zoom in/out, zooms toward pinch center
  - Zoom range: 0.5x to 3x scale
  - Smooth zoom animations using Framer Motion
  - Zoom-to-pointer implementation keeps the focal point stationary during zoom
- **Reset View button**: Positioned at top center with refresh icon, returns both pan position and zoom level to default state
- **UI Layout**: Reset button at top center, control hints at bottom center
- Grid-snapped token movement for precise positioning
- Configurable grid sizes (30-100px, each square = 5ft)
- Real-time token synchronization via WebSocket

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript for the HTTP server
- **express-session** for session management with PostgreSQL session store
- Separate entry points for development (`index-dev.ts` with Vite middleware) and production (`index-prod.ts` with static file serving)

**API Design**
- RESTful endpoints for CRUD operations
- Session-based authentication (no JWT tokens)
- WebSocket server running on same HTTP server at `/ws` path
- Role-based access control (GM vs Player permissions)

**Development vs Production**
- Development: Vite dev server integrated as Express middleware for HMR
- Production: Static files served from `dist/public` directory
- Custom error handling and logging middleware

### Data Storage

**Database**
- **PostgreSQL** via Neon serverless (cloud-hosted)
- **Drizzle ORM** for type-safe database queries and schema management
- Schema defined in `shared/schema.ts` for code sharing between client and server

**Database Schema**
```
users (id, email, username, name, password, createdAt)
campaigns (id, name, inviteCode, gmUserId, gridSize, currentMap, createdAt, lastPlayed)
campaignMembers (id, campaignId, userId, role, joinedAt, isFavorite)
characters (id, campaignId, userId, name, class, level, hp, maxHp, energy, maxEnergy, inventory, createdAt)
tokens (id, campaignId, characterId, type, x, y, image, createdAt)
chatMessages (id, campaignId, userId, sender, text, timestamp)
```

**Schema Validation**
- Zod schemas generated from Drizzle schema using `drizzle-zod`
- Input validation on both client and server using shared schema definitions
- Type-safe inserts and queries through Drizzle's TypeScript integration

### Authentication & Authorization

**Authentication Flow**
- Password hashing with **bcryptjs**
- Session-based authentication using `express-session`
- Sessions stored in PostgreSQL via `connect-pg-simple`
- Protected routes require authentication check via `ProtectedRoute` component

**Authorization Model**
- Two primary roles: GM (Game Master) and Player
- GMs have full control over campaigns they create
- Players can join campaigns via invite codes
- Role stored in `campaignMembers` table for granular access control

**Security Considerations**
- Passwords hashed before storage
- Session cookies with 7-day expiration
- CSRF protection via session validation
- Environment-based session secrets
- API endpoints sanitize responses to prevent PII leakage (e.g., campaign members API returns only necessary fields: id, userId, role, username)

## External Dependencies

### Third-Party Services
- **Neon Database** - Serverless PostgreSQL hosting (accessed via `@neondatabase/serverless`)
- Connection via `DATABASE_URL` environment variable

### Build & Development Tools
- **Replit** platform integrations:
  - `@replit/vite-plugin-cartographer` - Development tooling
  - `@replit/vite-plugin-dev-banner` - Development environment indicators
  - `@replit/vite-plugin-runtime-error-modal` - Enhanced error display
- Custom Vite plugin (`vite-plugin-meta-images`) for OpenGraph image meta tag management

### Key NPM Dependencies
- **UI & Styling**: `@radix-ui/*` (18+ packages), `tailwindcss`, `class-variance-authority`, `clsx`
- **Forms**: `react-hook-form`, `@hookform/resolvers`, `zod`
- **Database**: `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`
- **WebSocket**: `ws` library for real-time communication
- **Utilities**: `date-fns`, `nanoid`, `bcryptjs`

### Asset Management
- Static images stored in `attached_assets/generated_images/`
- Custom fonts: Cinzel (display), MedievalSharp (medieval), Inter (sans-serif)
- Google Fonts integration for typography
- Public assets served from `client/public/` directory

### Environment Configuration
Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `SESSION_SECRET` - Secret key for session encryption (defaults provided for development)
- `NODE_ENV` - Environment flag (development/production)
- `REPL_ID` - Replit deployment identifier (when deployed on Replit)