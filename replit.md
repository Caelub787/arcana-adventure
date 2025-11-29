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
-   **Grid System**: Toggleable square or hexagon grids with configurable sizes (30-100px), thickness (1-5px), and opacity (10-100%). Grid controls use debouncing (300ms) to prevent server spam during slider adjustments.
-   **Free Token Movement**: When grid is disabled, tokens move freely using real (float) coordinates without snapping. Grid-enabled mode snaps tokens to grid centers.
-   **Backgrounds**: Upload custom base64 battle map images per scene. Default: Rocky Coast gridded battlemap.
-   **Tokens**: Draggable circular character tokens with real-time sync, displaying character portraits with HP bars. Tokens snap and scale to scene grid size when grid enabled. GM can hold-click tokens to reveal delete button.
-   **Hotbars Overlay**: All 5 hotbar types (weapons, magic, skills, consumables, utility) displayed at the bottom of the battlemap for quick access without opening character sheet. Shows abbreviated item/spell names, damage, and level indicators with tooltips for full details.
-   **Portrait Upload**: Character sheet Background tab includes portrait upload with square cropping tool (drag-to-position, size slider, bounds clamping, center initialization). Portraits display as 256x256 JPEG for optimal storage and render as circular tokens on the battle map.
-   **Item Image Upload**: Inventory items support image upload with drag-to-position square cropping dialog (similar to portrait upload). Images stored as 128x128 JPEG base64.

**Character Sheet Design** (Mobile-Optimized):
-   **Icon-based Tabs**: 7 tabs matching battlemap sidebar icons with color-coded styling:
    - Overview (User, stone), Attributes (BarChart3, blue), Skills (Zap, green), Inventory (Backpack, amber), Magic (Sparkles, purple), Hotbars (Grid3X3, red), Background (ScrollText, cyan)
-   **Tab States**: Active tabs have bright background/text/border; inactive tabs are muted with hover effects
-   **Responsive Layout**: Full-screen dialog on mobile (w-full h-full), constrained on desktop (max-w-4xl)
-   **Single Scroll**: Entire character sheet scrolls as one unit instead of multiple mini scroll areas
-   **Touch-friendly**: Minimum 44px touch targets on tabs, larger icons on mobile (h-5 w-5)
-   **Accessibility**: aria-labels on all tabs, data-testid attributes preserved
-   **Real-time Updates**: Uses liveCharacter state with optimistic UI updates via mutation callbacks

**Race System** (20 playable races):
-   Race selection dropdown auto-fills: Size, Natural Armor, Size Bonus, Feat Tree, Speed, Fly Speed
-   Races: Human, Elf, Dwarf, Halfling, Orc, Tiefling, Dragonborn, Gnome, Half-Elf, Half-Orc, Aasimar, Goliath, Tabaxi, Kenku, Aarakocra, Firbolg, Kobold, Lizardfolk, Changeling, Warforged
-   Size categories: Small (sizeBonus +1), Medium (sizeBonus 0), Large (sizeBonus -1)
-   Natural Armor ranges from 4-8 based on race
-   Flying races (Aarakocra) have flySpeed > 0

**Attributes System** (6 attributes, range -2 to 5):
-   Might (physical power), Finesse (agility), Wit (intelligence), Presence (charisma), Will (mental fortitude), Craft (technical skill)
-   Modifier equals the attribute value (no (value-10)/2 calculation)
-   Both players and GMs can edit their own character's attributes

**Skills System** (15 skills, alphabetically ordered, range -2 to 5):
-   Skills: Agility, Arcana, Charisma, Concentration, Culture, Deception, History, Intimidation, Investigation, Medicine, Perception, Sleight of Hand, Stealth, Strength, Wisdom
-   Modifier equals the skill value
-   Both players and GMs can edit their own character's skills

**Campaign Creation**:
-   Dialog with campaign name input and game system dropdown (currently "Arcana Adventure" only).
-   Cancel button navigates back to home page.
-   New campaigns get Rocky Coast as default background.

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