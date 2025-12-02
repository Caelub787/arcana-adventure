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
- **Exhaustion System**: 0-5 levels tracked on characters. Visual display with color-coded bar and +/- GM controls. Level effects: 1=-10ft speed, 2=-20ft speed + Disadvantage on skill checks, 3=-30ft speed + Disadvantage on skill & attack rolls, 4=-40ft speed + Disadvantage on all rolls + HP halved, 5=Death. Items can be marked as rations (rationServings field in Admin Settings) for rest consumption.
- **Inventory & Hotbars**: Includes a comprehensive inventory with weight calculation (base carry capacity + Might modifier), quantity management, and item stacking. Hotbars support weapons (left hand, right hand, ammunition slots with compatibility checks), magic, skills, consumables, and utility items. Two-handed weapons (marked with `isHeavy` or legacy `weight === 'heavy'`) automatically occupy both weapon slots (0 and 2), blocking the right-hand slot (1).
- **Ammunition System**: Configurable break chance (0-100%) per ammunition item, battlemap hotbar displays grouped total quantity of matching ammunition (same name/type), automatic re-equip of next matching ammunition stack when current stack depletes.
- **Initiative Tracking**: Real-time initiative system accessible to all users, with GM controls for combat management, turn advancement, and visibility.
- **Roll Notification System**: Visual, animated notifications for all dice rolls (d4-d20) with distinct styling for different roll types (dice, initiative, "Crit Success" on natural 20, "Crit Failure" on natural 1). All rolls are server-authoritative and integrated into the chat.
- **Targeting System**: Token targeting with range validation and hit detection. Selection modes (Select/Target) displayed as stacked vertical buttons on the left side of battlemap, always visible. Target mode allows selecting enemy tokens for attacks. Double-clicking a token in Select mode assigns that character to the user. Range checking validates weapon range against target distance (50px grid = 5ft, melee default 5ft, ranged uses weapon.range). Hit detection compares attack roll to target's naturalArmor as DC, displaying HIT!/MISS!/Crit Success!/Crit Failure! in notifications. GMs see character hotbars when clicking any token in select mode.
- **Armor Damage Reduction System**: Armor items can be configured with damage reduction properties via Admin Settings. Each armor has: armorSlot (helm/chest/arm/legs/boots), armorBonus (added to character DC), damageReductionType (Sharp/Blunt/Piercing/Flame/Frost/Storm/Tide/Stone/Flux/Light/Dark/Sound), and damageReduction value. When a damage roll is made against a targeted character, equipped armor with matching damageReductionType subtracts its damageReduction from the damage. Final damage is applied to target's HP automatically. Google Drive image library browser available for item images in Admin Settings.
- **Feat Tree System**: Comprehensive skill tree/talent system for character progression. Features include:
  - **Admin Settings Grid Editor**: Visual infinite canvas editor for creating and managing feat trees. Uses the same pan/zoom mechanics as the battlemap (drag to pan, scroll/pinch to zoom). Feats can be placed anywhere on the infinite grid. Supports tier assignment (1-5), effect configuration, and prerequisite connections via the link button.
  - **Prerequisite Connections**: Visual SVG lines connect prerequisite feats. Feats can only be unlocked when at least one connected prerequisite is already unlocked.
  - **Species Integration**: Each species can have a feat tree assigned. Characters automatically inherit their species' feat tree and can view/unlock feats from their character sheet.
  - **Feat Effects**: Six effect types that are dynamically calculated (not persisted to stats):
    - `hp_bonus`: Adds to character's max HP. Supports flat bonus or per-level scaling via subtype selector.
    - `dc_bonus`: Adds to character's defense DC (shown in DC breakdown)
    - `attribute_bonus`: Adds to attribute values with dropdown selector (might, finesse, wit, presence, will, craft)
    - `skill_bonus`: Adds to skill values with dropdown selector for all 17 skills
    - `spell_grant`: Grants access to a system-defined spell, selected via dropdown from the spells database
    - `item_grant`: Grants access to an item (target specifies item ID)
  - **Context-Sensitive Effect Editor**: Effect type selection dynamically shows appropriate controls - dropdowns for skill/attribute/spell selection, subtype selector for HP bonus modes.
  - **Legacy Effect Compatibility**: Minimal normalization preserves all existing effect data formats without modification.
  - **Visual Bonus Indicators**: Star icons with purple highlighting show which stats are feat-enhanced. Breakdowns display feat bonuses separately from base values.
  - **Character Sheet Integration**: Clickable feat tree label opens a dialog viewer showing the grid layout with unlocked feats highlighted in green and locked feats grayed out. Prerequisites are validated before allowing unlock.
  - **Feat Template System**: Reusable feat definitions that can be shared across multiple feat trees. Templates store name, description, tier, cost, and effects. Admin can select "From Library" when creating a feat to pre-fill from a template, and "Save as Template" to create new templates from existing feats. Feats can optionally reference a templateId linking to the source template.
  - **Database Tables**: `feat_templates`, `feat_trees`, `feats` (with optional `templateId`), `feat_connections`, `character_feats` for storing templates, tree definitions, and character unlock progress.
- **Spell Management System**: Comprehensive system for defining and managing spells that can be granted through feats.
  - **Admin Spells Interface**: Dedicated "Spells" section in Admin Settings with search, create, edit, and delete functionality.
  - **Spell Properties**: Each spell includes name, description, damageDice (e.g., "2d6"), damage type, range, energy cost, cast time, duration, and attribute (for attack/damage modifiers).
  - **Damage Types**: 13 damage types matching armor reduction system (Sharp, Blunt, Piercing, Flame, Frost, Storm, Tide, Stone, Flux, Light, Dark, Sound, Health). Health damage type heals targets instead of damaging them.
  - **Spell Rolling**: Spells function like weapons on hotbar - single click triggers attack roll (d20 + attribute modifier), double click triggers damage roll (damageDice + attribute modifier). Attack rolls check against target's DC for HIT!/MISS! notifications.
  - **Health Damage Type Healing**: When a spell or weapon has damageType "Health", the damage is applied as healing (adding HP to target, capped at maxHP) instead of subtraction.
  - **Feat Integration**: Spells are granted to characters via the `spell_grant` effect type on feats. Dropdown selector shows all available system spells.
  - **Database Table**: `system_spells` stores spell definitions with UUID primary keys for consistent reference.
- **Feat Points System**: Characters earn feat points based on level using formula: level + (2 × floor(level/3)). This awards 1 point per level normally, but 3 points on levels divisible by 3 (levels 3, 6, 9, etc.). Example: Level 1 = 1 point, Level 3 = 5 total points, Level 6 = 10 total points.

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
- **Google Drive Integration**: Image library browser for character portraits and item images. Restricted to a specific shared folder (ID: `1MAdVTaRIO4r2ZsQU5AxEyQgb9iH_na6D`) to protect other Drive contents. Features folder navigation, image thumbnails, search, and 10MB file size limit.

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