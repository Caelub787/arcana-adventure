import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertCampaignSchema, insertCharacterSchema, insertTokenSchema, insertChatMessageSchema, insertSceneSchema, insertHotbarSchema, insertItemSchema, insertSpellSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { WebSocketServer } from "ws";
import { sendPasswordResetEmail } from "./email";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Get session middleware from app
  const sessionMiddleware = (app as any)._router.stack.find(
    (layer: any) => layer.name === 'session'
  )?.handle;
  
  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Map to track campaign rooms
  const campaignRooms = new Map<string, Set<any>>();
  
  // Rate limiting map: userId -> { count, resetTime }
  const rateLimits = new Map<string, { count: number; resetTime: number }>();
  
  // Rate limit check: 10 messages per second per user
  function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const limit = rateLimits.get(userId);
    
    if (!limit || now > limit.resetTime) {
      rateLimits.set(userId, { count: 1, resetTime: now + 1000 });
      return true;
    }
    
    if (limit.count >= 10) {
      return false;
    }
    
    limit.count++;
    return true;
  }

  wss.on("connection", async (ws, req) => {
    // Validate Origin header to prevent CSRF attacks
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:5000',
      'http://localhost:5173', // Vite dev server
      'http://0.0.0.0:5000',
    ];
    
    // Add Replit-specific origins when running on Replit
    if (process.env.REPL_ID) {
      allowedOrigins.push(`https://${process.env.REPL_ID}.repl.co`);
      allowedOrigins.push(`https://${process.env.REPL_ID}-00-`); // Partial match for dev URLs
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    
    // Check if origin matches any allowed origin (with partial match support)
    const isAllowed = !origin || allowedOrigins.some(allowed => 
      origin === allowed || origin.startsWith(allowed) || (allowed.includes('.repl.co') && origin.includes('.repl.co'))
    );
    
    if (!isAllowed) {
      console.warn(`WebSocket connection rejected - invalid origin: ${origin}`);
      ws.close(4403, 'Forbidden - Invalid origin');
      return;
    }
    
    // Parse session from request
    if (!sessionMiddleware) {
      console.error("WebSocket: Session middleware not found");
      ws.close(1011, "Server configuration error");
      return;
    }
    
    // Create mock response object for session middleware
    const mockRes = {
      getHeader: () => {},
      setHeader: () => {},
      end: () => {},
    };
    
    // Parse session
    await new Promise<void>((resolve) => {
      sessionMiddleware(req, mockRes, () => resolve());
    });
    
    const userId = (req as any).session?.userId;
    
    // Reject unauthenticated connections
    if (!userId) {
      ws.close(4401, "Unauthorized - No active session");
      return;
    }
    
    // Fetch user data for authenticated user
    const user = await storage.getUser(userId);
    if (!user) {
      ws.close(4401, "Unauthorized - User not found");
      return;
    }
    
    // Store authenticated user info on WebSocket connection
    (ws as any).userId = userId;
    (ws as any).username = user.username;
    (ws as any).campaigns = new Map<string, { role: string }>(); // Track joined campaigns with roles

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const authenticatedUserId = (ws as any).userId;
        const username = (ws as any).username;
        
        // Rate limiting check
        if (!checkRateLimit(authenticatedUserId)) {
          ws.send(JSON.stringify({
            type: "error",
            message: "Rate limit exceeded. Please slow down."
          }));
          return;
        }
        
        if (message.type === "join_campaign" && message.campaignId) {
          const campaignId = message.campaignId;
          
          // Check if user is a member of this campaign or is the GM
          const campaign = await storage.getCampaign(campaignId);
          if (!campaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Campaign not found"
            }));
            return;
          }
          
          // Check if user is GM (owner)
          const isGM = campaign.gmUserId === authenticatedUserId;
          
          // Check if user is a member
          const membership = await storage.getCampaignMembership(authenticatedUserId, campaignId);
          
          if (!isGM && !membership) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You are not a member of this campaign"
            }));
            return;
          }
          
          // Store campaign with role in Map
          const role = isGM ? "gm" : membership?.role || "player";
          (ws as any).campaigns.set(campaignId, { role });
          
          // Join room
          if (!campaignRooms.has(campaignId)) {
            campaignRooms.set(campaignId, new Set());
          }
          campaignRooms.get(campaignId)!.add(ws);
          
          // Send confirmation with role
          ws.send(JSON.stringify({
            type: "joined_campaign",
            campaignId,
            role
          }));
          
          console.log(`[WebSocket] User ${username} joined campaign ${campaignId} as ${role}`);
        }

        if (message.type === "token_move") {
          const { campaignId, tokenId, x, y, snapToGrid } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized for this campaign"
            }));
            return;
          }
          
          const userRole = userCampaign.role;
          
          // Fetch the token from database to verify ownership
          const token = await storage.getToken(tokenId);
          
          if (!token || token.campaignId !== campaignId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid token for this campaign"
            }));
            return;
          }
          
          // Authorization: GM can move any token, players can only move their own character tokens
          if (userRole !== "gm") {
            // If token has a characterId, verify it belongs to this user
            if (token.characterId) {
              const character = await storage.getCharacter(token.characterId);
              if (!character || character.userId !== authenticatedUserId) {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Not authorized to move this token"
                }));
                return;
              }
            } else {
              // Non-character tokens (enemies, NPCs) can only be moved by GM
              ws.send(JSON.stringify({
                type: "error",
                message: "Only GMs can move non-player tokens"
              }));
              return;
            }
          }
          
          // Update token position in database
          await storage.updateToken(tokenId, { x, y });
          
          // Broadcast to all clients in the campaign
          const room = campaignRooms.get(campaignId);
          if (room) {
            const broadcastMessage = JSON.stringify({
              type: "token_move",
              tokenId,
              x,
              y,
              snapToGrid,
              userId: authenticatedUserId // Use server-side authenticated userId
            });
            
            room.forEach((client) => {
              if (client.readyState === 1) { // OPEN
                client.send(broadcastMessage);
              }
            });
          }
        }

        if (message.type === "chat_message") {
          const { campaignId, text, messageType } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You have not joined this campaign"
            }));
            return;
          }
          
          // Validate message length (max 1000 characters)
          if (!text || typeof text !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid message"
            }));
            return;
          }
          
          if (text.length > 1000) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Message too long (max 1000 characters)"
            }));
            return;
          }
          
          // Validate messageType to prevent injection
          const validMessageTypes = ["chat", "roll", "emote", "system"];
          const sanitizedMessageType = validMessageTypes.includes(messageType) ? messageType : "chat";
          
          // Save to database with server-side authenticated userId
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId, // Use server-authenticated userId
            sender: username, // Use server-authenticated username
            text,
            type: sanitizedMessageType
          });

          // Broadcast to all clients in the campaign
          const room = campaignRooms.get(campaignId);
          if (room) {
            const broadcastMessage = JSON.stringify({ 
              type: "chat_message", 
              message: chatMessage 
            });
            
            room.forEach((client) => {
              if (client.readyState === 1) {
                client.send(broadcastMessage);
              }
            });
          }
        }
      } catch (err) {
        console.error("WebSocket error:", err);
        ws.send(JSON.stringify({
          type: "error",
          message: "An error occurred processing your message"
        }));
      }
    });

    ws.on("close", () => {
      // Remove from all campaign rooms
      const campaigns = (ws as any).campaigns || new Map();
      campaigns.forEach((_, campaignId: string) => {
        const room = campaignRooms.get(campaignId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) {
            campaignRooms.delete(campaignId);
          }
        }
      });
      
      console.log(`[WebSocket] User ${(ws as any).username} disconnected`);
    });
  });

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  /**
   * Permission Validation Functions
   * 
   * These validators enforce role-based access control for game data.
   * GMs have full edit rights, while players have restricted permissions.
   * 
   * Throws errors with descriptive messages when non-GMs attempt unauthorized edits,
   * which are then caught by route handlers and returned as 403 Forbidden responses.
   */

  /**
   * validateCharacterUpdate - Enforces player restrictions on character edits
   * 
   * Players can only modify:
   * - Cosmetic fields: name, portrait, biography
   * - Current resources: hp, energy (not maximums)
   * - Inventory array (legacy field)
   * 
   * GMs can edit all fields including:
   * - Attributes (agility, strength, etc.)
   * - Skills (skillAgility, skillPerception, etc.)
   * - Max HP/Energy
   * - Race stats (size, speed, naturalArmor, etc.)
   * - GM Notes (players cannot see this field)
   */
  function validateCharacterUpdate(updates: Partial<any>, isGM: boolean): void {
    if (!isGM) {
      // Only allow these fields for non-GMs
      const allowedFields = ['name', 'portrait', 'biography', 'hp', 'energy', 'inventory'];
      const attemptedFields = Object.keys(updates);
      const restrictedFields = attemptedFields.filter(
        f => !allowedFields.includes(f)
      );
      if (restrictedFields.length > 0) {
        throw new Error(
          `Forbidden: Only GMs can edit ${restrictedFields.join(', ')}`
        );
      }
    }
  }

  /**
   * validateItemUpdate - Enforces player restrictions on item edits
   * 
   * Players can only modify:
   * - name, description (flavor text)
   * - containerId (move items between containers)
   * - isEquipped (hotbar integration)
   * 
   * GMs can edit all properties including:
   * - Combat stats (damage, mod, range, aoe)
   * - Item properties (durability, rarity, weight)
   * - Pricing (copper, silver, gold, platinum)
   * - Container settings (isContainer, carryCapacity)
   * 
   * This prevents players from cheating by modifying weapon damage or item durability.
   */
  function validateItemUpdate(updates: Partial<any>, isGM: boolean): void {
    if (!isGM) {
      // Only allow name and description for non-GMs (plus container organization)
      const allowedFields = ['name', 'description', 'containerId', 'isEquipped'];
      const attemptedFields = Object.keys(updates);
      const restrictedFields = attemptedFields.filter(
        f => !allowedFields.includes(f)
      );
      if (restrictedFields.length > 0) {
        throw new Error(
          `Forbidden: Only GMs can edit item properties: ${restrictedFields.join(', ')}`
        );
      }
    }
  }

  /**
   * validateSpellUpdate - Enforces player restrictions on spell edits
   * 
   * Players can only modify:
   * - name, description (flavor text)
   * - isEquipped (magic hotbar integration)
   * 
   * GMs can edit all properties including:
   * - Spell mechanics (damage, damageType, range, aoe)
   * - Spell metadata (level, school, castingTime, duration)
   * 
   * This prevents players from upgrading spell power or changing spell levels.
   */
  function validateSpellUpdate(updates: Partial<any>, isGM: boolean): void {
    if (!isGM) {
      // Only allow name and description for non-GMs
      const allowedFields = ['name', 'description', 'isEquipped'];
      const attemptedFields = Object.keys(updates);
      const restrictedFields = attemptedFields.filter(
        f => !allowedFields.includes(f)
      );
      if (restrictedFields.length > 0) {
        throw new Error(
          `Forbidden: Only GMs can edit spell properties: ${restrictedFields.join(', ')}`
        );
      }
    }
  }

  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, username, name } = insertUserSchema.parse(req.body);
      
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ email, password: hashedPassword, username, name });

      req.session.userId = user.id;
      // Only send safe user fields (never send password hash to client)
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          username: user.username, 
          name: user.name 
        } 
      });
    } catch (err) {
      res.status(400).json({ error: "Invalid input" });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.userId = user.id;
      // Only send safe user fields (never send password hash to client)
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          username: user.username, 
          name: user.name 
        } 
      });
    } catch (err) {
      res.status(400).json({ error: "Invalid input" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // Only send safe user fields (never send password hash to client)
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        username: user.username, 
        name: user.name 
      } 
    });
  });

  // Password reset routes
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      console.log(`[PASSWORD RESET] Request received for email: ${email}`);
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        console.log(`[PASSWORD RESET] No user found with email: ${email}`);
        return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
      }

      console.log(`[PASSWORD RESET] User found: ${user.id}`);
      await storage.deleteUserPasswordResetTokens(user.id);

      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt
      });
      console.log(`[PASSWORD RESET] Token created in database`);

      const baseUrl = req.protocol + '://' + req.get('host');
      console.log(`[PASSWORD RESET] Sending email to ${user.email} from Support@arcanaadventure.com`);
      const emailResult = await sendPasswordResetEmail(user.email, resetToken, baseUrl);
      console.log(`[PASSWORD RESET] Email sent successfully:`, emailResult);

      res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (err) {
      console.error("[PASSWORD RESET] Error:", err);
      res.status(500).json({ error: "Failed to send reset email" });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      if (new Date() > resetToken.expiresAt) {
        await storage.deletePasswordResetToken(token);
        return res.status(400).json({ error: "Reset token has expired" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(resetToken.userId, hashedPassword);
      await storage.deletePasswordResetToken(token);

      res.json({ message: "Password successfully reset" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Campaign routes
  app.post("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const { name, gridSize, currentMap } = req.body;
      
      const inviteCode = "ARCANA-" + Math.floor(1000 + Math.random() * 9000);
      
      const campaign = await storage.createCampaign({
        name,
        inviteCode,
        gmUserId: req.session.userId!,
        gridSize: gridSize || 50,
        currentMap
      });

      // Add GM as a member
      await storage.addCampaignMember({
        campaignId: campaign.id,
        userId: req.session.userId!,
        role: "gm"
      });

      // Create default scene (null backgroundImage uses frontend's default Rocky Coast image)
      const defaultScene = await storage.createScene({
        campaignId: campaign.id,
        name: "Default Scene",
        backgroundImage: null,
        gridEnabled: true,
        gridType: "square",
        gridSize: gridSize || 50,
        defaultViewX: 0,
        defaultViewY: 0,
        defaultViewZoom: 1
      });

      // Set the default scene as active
      await storage.setActiveScene(campaign.id, defaultScene.id);

      res.json(campaign);
    } catch (err) {
      res.status(400).json({ error: "Failed to create campaign" });
    }
  });

  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const campaigns = await storage.getUserCampaigns(req.session.userId!);
      res.json(campaigns);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    const campaign = await storage.getCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    res.json(campaign);
  });

  app.patch("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.updateCampaign(req.params.id, req.body);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (err) {
      res.status(400).json({ error: "Failed to update campaign" });
    }
  });

  app.post("/api/campaigns/join", requireAuth, async (req, res) => {
    try {
      const { inviteCode } = req.body;
      
      const campaign = await storage.getCampaignByInviteCode(inviteCode);
      if (!campaign) {
        return res.status(404).json({ error: "Invalid invite code" });
      }

      // Check if already a member
      const members = await storage.getCampaignMembers(campaign.id);
      const alreadyMember = members.some(m => m.userId === req.session.userId);
      
      if (alreadyMember) {
        return res.status(400).json({ error: "Already a member of this campaign" });
      }

      await storage.addCampaignMember({
        campaignId: campaign.id,
        userId: req.session.userId!,
        role: "player"
      });

      res.json(campaign);
    } catch (err) {
      res.status(400).json({ error: "Failed to join campaign" });
    }
  });

  app.delete("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      console.log(`[DELETE] Campaign delete request for ID: ${req.params.id} by user: ${req.session.userId}`);
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        console.log(`[DELETE] Campaign not found: ${req.params.id}`);
        return res.status(404).json({ error: "Campaign not found" });
      }

      console.log(`[DELETE] Campaign found. GM: ${campaign.gmUserId}, Current user: ${req.session.userId}`);
      if (campaign.gmUserId !== req.session.userId) {
        console.log(`[DELETE] Authorization failed. User is not GM.`);
        return res.status(403).json({ error: "Only the GM can delete the campaign" });
      }

      console.log(`[DELETE] Starting cascade delete for campaign ${req.params.id}`);
      await storage.deleteCampaign(req.params.id);
      console.log(`[DELETE] Campaign ${req.params.id} deleted successfully`);
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[DELETE] Error deleting campaign:`, err);
      res.status(400).json({ error: "Failed to delete campaign", details: err.message });
    }
  });

  app.post("/api/campaigns/:id/leave", requireAuth, async (req, res) => {
    try {
      await storage.removeCampaignMember(req.params.id, req.session.userId!);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to leave campaign" });
    }
  });

  app.post("/api/campaigns/:id/favorite", requireAuth, async (req, res) => {
    try {
      await storage.toggleFavorite(req.params.id, req.session.userId!);
      res.json({ success: true });
    } catch (err: any) {
      if (err.message === "Only campaign members can favorite a campaign") {
        return res.status(403).json({ error: err.message });
      }
      res.status(400).json({ error: "Failed to toggle favorite" });
    }
  });

  // Character routes
  app.post("/api/campaigns/:campaignId/characters", requireAuth, async (req, res) => {
    try {
      const character = await storage.createCharacter({
        ...req.body,
        campaignId: req.params.campaignId,
        userId: req.session.userId!
      });
      res.json(character);
    } catch (err) {
      res.status(400).json({ error: "Failed to create character" });
    }
  });

  app.get("/api/campaigns/:campaignId/characters", requireAuth, async (req, res) => {
    try {
      const characters = await storage.getCampaignCharacters(req.params.campaignId);
      res.json(characters);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch characters" });
    }
  });

  app.patch("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwner = character.userId === req.session.userId;
      const isGM = campaign.gmUserId === req.session.userId;

      // Must be either owner or GM
      if (!isOwner && !isGM) {
        return res.status(403).json({ error: "Unauthorized: You must own this character or be the GM" });
      }

      // Validate update based on GM status
      try {
        validateCharacterUpdate(req.body, isGM);
      } catch (validationErr: any) {
        return res.status(403).json({ error: validationErr.message });
      }

      const updatedCharacter = await storage.updateCharacter(req.params.id, req.body);
      res.json(updatedCharacter);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character" });
    }
  });

  // Hotbar routes
  app.get("/api/characters/:characterId/hotbars", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const hotbars = await storage.getHotbarsByCharacter(req.params.characterId);
      res.json(hotbars);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch hotbars" });
    }
  });

  app.post("/api/characters/:characterId/hotbars", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const hotbarData = insertHotbarSchema.parse({
        ...req.body,
        characterId: req.params.characterId
      });

      const hotbar = await storage.upsertHotbar(hotbarData);
      res.json(hotbar);
    } catch (err) {
      res.status(400).json({ error: "Failed to upsert hotbar" });
    }
  });

  app.delete("/api/hotbars/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteHotbar(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete hotbar" });
    }
  });

  // Spell routes
  app.get("/api/characters/:characterId/spells", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const spells = await storage.getSpellsByCharacter(req.params.characterId);
      res.json(spells);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spells" });
    }
  });

  app.post("/api/characters/:characterId/spells", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const spellData = insertSpellSchema.parse({
        ...req.body,
        characterId: req.params.characterId
      });

      const spell = await storage.createSpell(spellData);
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to create spell" });
    }
  });

  app.patch("/api/spells/:id", requireAuth, async (req, res) => {
    try {
      // First fetch the spell to get its character
      const currentSpell = await storage.updateSpell(req.params.id, {});
      if (!currentSpell) {
        return res.status(404).json({ error: "Spell not found" });
      }

      const character = await storage.getCharacter(currentSpell.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwner = character.userId === req.session.userId;
      const isGM = campaign.gmUserId === req.session.userId;

      // Must be either owner or GM
      if (!isOwner && !isGM) {
        return res.status(403).json({ error: "Unauthorized: You must own this character or be the GM" });
      }

      // Validate update based on GM status
      try {
        validateSpellUpdate(req.body, isGM);
      } catch (validationErr: any) {
        return res.status(403).json({ error: validationErr.message });
      }

      const spell = await storage.updateSpell(req.params.id, req.body);
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to update spell" });
    }
  });

  app.delete("/api/spells/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSpell(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete spell" });
    }
  });

  // Token routes
  app.post("/api/campaigns/:campaignId/tokens", requireAuth, async (req, res) => {
    try {
      const token = await storage.createToken({
        ...req.body,
        campaignId: req.params.campaignId
      });
      res.json(token);
    } catch (err) {
      res.status(400).json({ error: "Failed to create token" });
    }
  });

  app.get("/api/campaigns/:campaignId/tokens", requireAuth, async (req, res) => {
    try {
      const tokens = await storage.getCampaignTokens(req.params.campaignId);
      res.json(tokens);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  app.patch("/api/tokens/:id", requireAuth, async (req, res) => {
    try {
      const token = await storage.updateToken(req.params.id, req.body);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(token);
    } catch (err) {
      res.status(400).json({ error: "Failed to update token" });
    }
  });

  app.delete("/api/tokens/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteToken(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete token" });
    }
  });

  // Chat routes
  app.get("/api/campaigns/:campaignId/messages", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getCampaignMessages(req.params.campaignId);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Members routes
  app.get("/api/campaigns/:campaignId/members", requireAuth, async (req, res) => {
    try {
      const members = await storage.getCampaignMembers(req.params.campaignId);
      res.json(members);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // Scene routes
  app.post("/api/campaigns/:campaignId/scenes", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can create scenes
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can create scenes" });
      }

      const scene = await storage.createScene({
        ...req.body,
        campaignId: req.params.campaignId
      });

      res.json(scene);
    } catch (err) {
      res.status(400).json({ error: "Failed to create scene" });
    }
  });

  app.get("/api/campaigns/:campaignId/scenes", requireAuth, async (req, res) => {
    try {
      const scenes = await storage.getCampaignScenes(req.params.campaignId);
      res.json(scenes);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch scenes" });
    }
  });

  app.get("/api/scenes/:sceneId", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      res.json(scene);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch scene" });
    }
  });

  app.put("/api/scenes/:sceneId", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }

      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can update scenes
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can update scenes" });
      }

      const updatedScene = await storage.updateScene(req.params.sceneId, req.body);
      res.json(updatedScene);
    } catch (err) {
      res.status(400).json({ error: "Failed to update scene" });
    }
  });

  app.delete("/api/scenes/:sceneId", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }

      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can delete scenes
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can delete scenes" });
      }

      await storage.deleteScene(req.params.sceneId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete scene" });
    }
  });

  app.post("/api/campaigns/:campaignId/active-scene", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can set active scene
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can set the active scene" });
      }

      const { sceneId } = req.body;
      if (!sceneId) {
        return res.status(400).json({ error: "Scene ID is required" });
      }

      // Verify scene belongs to campaign
      const scene = await storage.getScene(sceneId);
      if (!scene || scene.campaignId !== req.params.campaignId) {
        return res.status(400).json({ error: "Scene not found or does not belong to this campaign" });
      }

      await storage.setActiveScene(req.params.campaignId, sceneId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to set active scene" });
    }
  });

  // Admin emails for system-wide access
  const ADMIN_EMAILS = ['notclaudenot@gmail.com', 'reedmcaleb@gmail.com'];

  // Helper to check if user is admin
  const isAdminUser = async (userId: string | undefined): Promise<boolean> => {
    if (!userId) return false;
    const user = await storage.getUser(userId);
    return user ? ADMIN_EMAILS.includes(user.email.toLowerCase()) : false;
  };

  // Admin middleware
  const requireAdmin: typeof requireAuth = async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdminUser(req.session.userId))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // System item routes (admin only)
  app.get("/api/admin/system-items", requireAdmin, async (req, res) => {
    try {
      const items = await storage.getSystemItems();
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system items" });
    }
  });

  app.post("/api/admin/system-items", requireAdmin, async (req, res) => {
    try {
      const itemData = insertItemSchema.parse({
        ...req.body,
        isTemplate: true,
        characterId: null,
        campaignId: null
      });
      const item = await storage.createItem(itemData);
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: "Failed to create system item" });
    }
  });

  app.patch("/api/admin/system-items/:id", requireAdmin, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item || !item.isTemplate || item.characterId || item.campaignId) {
        return res.status(404).json({ error: "System item not found" });
      }
      const updatedItem = await storage.updateItem(req.params.id, req.body);
      res.json(updatedItem);
    } catch (err) {
      res.status(400).json({ error: "Failed to update system item" });
    }
  });

  app.delete("/api/admin/system-items/:id", requireAdmin, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item || !item.isTemplate || item.characterId || item.campaignId) {
        return res.status(404).json({ error: "System item not found" });
      }
      await storage.deleteItem(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete system item" });
    }
  });

  // Campaign template item routes (GM only)
  app.get("/api/campaigns/:campaignId/template-items", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Get campaign template items and system items
      const [campaignItems, systemItems] = await Promise.all([
        storage.getCampaignTemplateItems(req.params.campaignId),
        storage.getSystemItems()
      ]);
      
      res.json({ campaignItems, systemItems });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch template items" });
    }
  });

  app.post("/api/campaigns/:campaignId/template-items", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can create campaign items" });
      }
      
      const itemData = insertItemSchema.parse({
        ...req.body,
        isTemplate: true,
        characterId: null,
        campaignId: req.params.campaignId
      });
      const item = await storage.createItem(itemData);
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: "Failed to create campaign item" });
    }
  });

  app.patch("/api/campaigns/:campaignId/template-items/:id", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can edit campaign items" });
      }
      
      const item = await storage.getItem(req.params.id);
      if (!item || item.campaignId !== req.params.campaignId || !item.isTemplate) {
        return res.status(404).json({ error: "Campaign item not found" });
      }
      
      const updatedItem = await storage.updateItem(req.params.id, req.body);
      res.json(updatedItem);
    } catch (err) {
      res.status(400).json({ error: "Failed to update campaign item" });
    }
  });

  app.delete("/api/campaigns/:campaignId/template-items/:id", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can delete campaign items" });
      }
      
      const item = await storage.getItem(req.params.id);
      if (!item || item.campaignId !== req.params.campaignId || !item.isTemplate) {
        return res.status(404).json({ error: "Campaign item not found" });
      }
      
      await storage.deleteItem(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete campaign item" });
    }
  });

  // Item routes
  app.get("/api/characters/:characterId/items", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const items = await storage.getItemsByCharacter(req.params.characterId);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.post("/api/characters/:characterId/items", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const itemData = insertItemSchema.parse({
        ...req.body,
        characterId: req.params.characterId
      });

      const item = await storage.createItem(itemData);
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: "Failed to create item" });
    }
  });

  app.patch("/api/items/:id", requireAuth, async (req, res) => {
    try {
      // Get current item first
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }

      const character = await storage.getCharacter(currentItem.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwner = character.userId === req.session.userId;
      const isGM = campaign.gmUserId === req.session.userId;

      // Must be either owner or GM
      if (!isOwner && !isGM) {
        return res.status(403).json({ error: "Unauthorized: You must own this character or be the GM" });
      }

      // Validate update based on GM status
      try {
        validateItemUpdate(req.body, isGM);
      } catch (validationErr: any) {
        return res.status(403).json({ error: validationErr.message });
      }

      // Cycle detection for containerId updates
      if (req.body.containerId !== undefined && req.body.containerId !== null) {
        const targetContainerId = req.body.containerId;
        
        // Can't put an item inside itself
        if (targetContainerId === req.params.id) {
          return res.status(400).json({ error: "Cannot move an item into itself" });
        }

        // Check if target container is a descendant of the item being moved
        const allItems = await storage.getItemsByCharacter(currentItem.characterId);
        const containerMap = new Map<string, string | null>();
        allItems.forEach(item => {
          containerMap.set(item.id, item.containerId);
        });

        // Traverse up from target container to check for cycles
        let current: string | null | undefined = targetContainerId;
        const visited = new Set<string>();
        while (current) {
          if (current === req.params.id) {
            return res.status(400).json({ 
              error: "Cannot create container cycle - the target container is inside the item you're trying to move" 
            });
          }
          if (visited.has(current)) {
            // Prevent infinite loop in case of existing cycle
            break;
          }
          visited.add(current);
          current = containerMap.get(current);
        }
      }

      // Perform the actual update
      const updatedItem = await storage.updateItem(req.params.id, req.body);
      if (!updatedItem) {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json(updatedItem);
    } catch (err) {
      res.status(400).json({ error: "Failed to update item" });
    }
  });

  app.post("/api/items/:id/damage", requireAuth, async (req, res) => {
    try {
      const amount = req.body.amount || 1;
      const item = await storage.damageItem(req.params.id, amount);
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const character = await storage.getCharacter(item.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.gmUserId !== req.session.userId && character.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      res.json(item);
    } catch (err) {
      console.error("Error damaging item:", err);
      res.status(400).json({ error: "Failed to damage item" });
    }
  });

  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const character = await storage.getCharacter(item.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwnerOrGM = character.userId === req.session.userId || campaign.gmUserId === req.session.userId;
      if (!isOwnerOrGM) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await storage.deleteItem(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete item" });
    }
  });

  return httpServer;
}
