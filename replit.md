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
- **Battle Map**: Features include infinite grid space, fluid pan & zoom, GM scene management, configurable square/hexagon grids, free token movement, custom background uploads, and real-time draggable character tokens with HP bars. Viewport-independent centering ensures saved map views display consistently across mobile and desktop devices using world-coordinate storage (version 1) instead of pixel offsets. ResizeObserver tracks viewport changes for real-time recalculation.
- **Character Sheet**: Mobile-optimized design with icon-based tabs, responsive layout, single-scroll interface, touch-friendly elements, and real-time updates via optimistic UI.
- **Species/Race System**: Database-driven species management via Admin Settings. Supports custom species with auto-filled attributes (lifespan, speed, flySpeed, size, naturalArmor, sizeBonus, startingHP, startingMaxHP, hpPerLevel, startingEnergy, startingMaxEnergy, featTree). Human species seeded as baseline.
- **Level-Up HP System**: Characters gain HP through dice rolls when leveling up. HP formula is based on species `hpPerLevel` value with dice count scaling: 1d at levels 1-3, 2d at levels 4-6, 3d at levels 7-9, etc. (formula: 1 + floor((level-1)/3)). Bonus HP from level-ups is tracked separately in `bonusHpFromLevelUps` and persists when race changes - only base HP recalculates from new species. Level-up button appears in character sheet when `level > lastLevelUpRolled`.
- **Attributes & Skills**: Six attributes (Might, Finesse, Wit, Presence, Craft, Will) and seventeen skills, all with modifiers equal to their value. Features single-click rolls and double-click/long-press for a Roll Modifier Panel. Skill rolls include both skill modifier AND parent attribute modifier (e.g., Stealth = d20 + Stealth mod + Finesse mod). Uses d30 instead of d20 when the relevant attribute value is >= 5.
- **Skill-to-Attribute Mapping**: Might (Strength), Finesse (Agility, Sleight of Hand, Stealth), Wit (Arcana, History, Investigation, Perception, Wisdom, Culture), Presence (Charisma, Deception, Intimidation), Craft (Medicine), Will (Concentration, Survival, Beast Handling).
- **Rest Mechanics**: Short Rest (coffee icon) restores HP equal to character level, requires 2 rations. Long Rest (moon icon) restores all HP, reduces exhaustion by 1 level, requires 4 rations. Rations are consumed automatically from inventory.
- **Exhaustion System**: 0-7 levels tracked on characters. Visual display with color-coded bar and +/- GM controls. Level effects: 1=Disadvantage on rolls, 2=Speed halved, 3=Max HP halved, 4=Cannot take actions, 5=Speed reduced to 0, 6=Cannot move/act, 7=Death. Items can be marked as rations (isRation checkbox in Admin Settings) for rest consumption.
- **Inventory & Hotbars**: Includes a comprehensive inventory with weight calculation (base carry capacity + Might modifier), quantity management, and item stacking. Hotbars support weapons (left hand, right hand, ammunition slots with compatibility checks), magic, skills, consumables, and utility items. Two-handed weapons (marked with `isHeavy` or legacy `weight === 'heavy'`) automatically occupy both weapon slots (0 and 2), blocking the right-hand slot (1).
- **Ammunition System**: Configurable break chance (0-100%) per ammunition item, battlemap hotbar displays grouped total quantity of matching ammunition (same name/type), automatic re-equip of next matching ammunition stack when current stack depletes.
- **Initiative Tracking**: Real-time initiative system accessible to all users, with GM controls for combat management, turn advancement, and visibility.
- **Roll Notification System**: Visual, animated notifications for all dice rolls (d4-d20) with distinct styling for different roll types (dice, initiative, "Crit Success" on natural 20, "Crit Failure" on natural 1). All rolls are server-authoritative and integrated into the chat.
- **Targeting System**: Token targeting with range validation and hit detection. Selection modes (Select/Target) displayed as stacked vertical buttons on the left side of battlemap, always visible. Target mode allows selecting enemy tokens for attacks. Double-clicking a token in Select mode assigns that character to the user. Range checking validates weapon range against target distance (50px grid = 5ft, melee default 5ft, ranged uses weapon.range). Hit detection compares attack roll to target's naturalArmor as DC, displaying HIT!/MISS!/Crit Success!/Crit Failure! in notifications. GMs see character hotbars when clicking any token in select mode.
- **Armor Damage Reduction System**: Armor items can be configured with damage reduction properties via Admin Settings. Each armor has: armorSlot (helm/chest/arm/legs/boots), armorBonus (added to character DC), damageReductionType (Sharp/Blunt/Piercing/Flame/Frost/Storm/Tide/Stone/Flux/Light/Dark/Sound), and damageReduction value. When a damage roll is made against a targeted character, equipped armor with matching damageReductionType subtracts its damageReduction from the damage. Final damage is applied to target's HP automatically. Google Drive image library browser available for item images in Admin Settings.

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
- **Google Drive Integration**: Image library browser for character portraits and item images. Restricted to a specific shared folder (ID: `1XIIbXfkyJhClfACBa-G6B53n14sVSVUb`) to protect other Drive contents. Features folder navigation, image thumbnails, search, and 10MB file size limit.

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