import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertCampaignSchema, insertCharacterSchema, insertTokenSchema, insertChatMessageSchema, insertSceneSchema, insertHotbarSchema, insertItemSchema, insertSpellSchema, initiativeEntries } from "@shared/schema";
import bcrypt from "bcryptjs";
import { WebSocketServer } from "ws";
import { sendPasswordResetEmail } from "./email";
import crypto from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { createRollResult, createWebSocketDiceRollMessage, type RollRequest } from "./dice/serverRollHandler";

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

  /**
   * broadcastToAuthorizedUsers - Permission-filtered WebSocket broadcast for character updates
   * 
   * This function broadcasts character-related updates only to users who have permission
   * to view the character. It uses batch permission lookups to avoid N+1 queries.
   * 
   * Access is granted if:
   * - User is the character owner
   * - User is the campaign GM
   * - User has explicit 'view' or 'edit' permission
   */
  async function broadcastToAuthorizedUsers(
    campaignId: string,
    characterId: string,
    message: any
  ): Promise<void> {
    const room = campaignRooms.get(campaignId);
    if (!room || room.size === 0) return;

    // Get character and campaign data once
    const character = await storage.getCharacter(characterId);
    if (!character) return;

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) return;

    // Gather all userIds from connected clients in this campaign room
    const connectedClients = Array.from(room).filter(
      (client) => client.readyState === 1 // OPEN
    );

    const userIds: string[] = [];
    const userClientMap = new Map<string, any[]>(); // userId -> [clients]

    for (const client of connectedClients) {
      const userId = (client as any).userId;
      if (userId) {
        if (!userClientMap.has(userId)) {
          userClientMap.set(userId, []);
          userIds.push(userId);
        }
        userClientMap.get(userId)!.push(client);
      }
    }

    if (userIds.length === 0) return;

    // Batch query: get all permissions for this character for all connected users
    const permissions = await storage.getCharacterPermissionsForUsers(characterId, userIds);
    const permissionMap = new Map(permissions.map(p => [p.userId, p.accessLevel]));

    // Prepare the message string once
    const messageString = JSON.stringify(message);

    // Send to authorized users only
    for (const userId of userIds) {
      const isOwner = character.userId === userId;
      const isGM = campaign.gmUserId === userId;
      
      // Owner and GM always have access
      if (isOwner || isGM) {
        const clients = userClientMap.get(userId);
        clients?.forEach(client => client.send(messageString));
        continue;
      }

      // Check explicit permission
      const accessLevel = permissionMap.get(userId);
      if (accessLevel === 'view' || accessLevel === 'edit') {
        const clients = userClientMap.get(userId);
        clients?.forEach(client => client.send(messageString));
      }
      // Else: Don't send - user has no permission (accessLevel is 'none' or undefined)
    }
  }

  wss.on("connection", async (ws, req) => {
    // Buffer messages received during async setup
    const messageBuffer: any[] = [];
    let setupComplete = false;
    
    // Attach message handler IMMEDIATELY to capture early messages
    ws.on("message", async (data) => {
      if (!setupComplete) {
        // Buffer messages until setup is complete
        messageBuffer.push(data);
        console.log(`[WebSocket] Buffering message during setup`);
        return;
      }
      await handleMessage(ws, data);
    });
    
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
    
    // Check if origin matches any allowed origin (with partial match support for Replit domains)
    const isAllowed = !origin || allowedOrigins.some(allowed => 
      origin === allowed || 
      origin.startsWith(allowed) || 
      (allowed.includes('.repl.co') && origin.includes('.repl.co')) ||
      origin.includes('.picard.replit.dev') ||
      origin.includes('.replit.dev')
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
    
    console.log(`[WebSocket] User ${user.username} (${userId}) connected successfully`);
    
    // Mark setup as complete and process buffered messages
    setupComplete = true;
    if (messageBuffer.length > 0) {
      console.log(`[WebSocket] Processing ${messageBuffer.length} buffered messages`);
      for (const bufferedData of messageBuffer) {
        await handleMessage(ws, bufferedData);
      }
    }
    
    // Define message handler function
    async function handleMessage(ws: any, data: any) {
      try {
        const message = JSON.parse(data.toString());
        const authenticatedUserId = (ws as any).userId;
        const username = (ws as any).username;
        
        console.log(`[WebSocket] Received message from ${username}:`, message.type);
        
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
          console.log(`[WebSocket] Processing join_campaign request from ${username} for campaign ${campaignId}`);
          
          // Check if user is a member of this campaign or is the GM
          const campaign = await storage.getCampaign(campaignId);
          if (!campaign) {
            console.log(`[WebSocket] Campaign ${campaignId} not found`);
            ws.send(JSON.stringify({
              type: "error",
              message: "Campaign not found"
            }));
            return;
          }
          
          // Check if user is GM (owner)
          const isGM = campaign.gmUserId === authenticatedUserId;
          console.log(`[WebSocket] User ${username} isGM: ${isGM}, gmUserId: ${campaign.gmUserId}, userId: ${authenticatedUserId}`);
          
          // Check if user is a member
          const membership = await storage.getCampaignMembership(authenticatedUserId, campaignId);
          console.log(`[WebSocket] User ${username} membership:`, membership);
          
          if (!isGM && !membership) {
            console.log(`[WebSocket] User ${username} not authorized for campaign ${campaignId}`);
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
          const confirmationMsg = JSON.stringify({
            type: "joined_campaign",
            campaignId,
            role
          });
          console.log(`[WebSocket] Sending joined_campaign confirmation to ${username}:`, confirmationMsg);
          ws.send(confirmationMsg);
          
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

        // Character update handler - broadcasts only to authorized users
        if (message.type === "character_update") {
          const { campaignId, characterId, updates } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You have not joined this campaign"
            }));
            return;
          }
          
          // Validate required fields
          if (!characterId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "characterId is required"
            }));
            return;
          }
          
          // Verify the sender has permission to edit this character
          const character = await storage.getCharacter(characterId);
          if (!character) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character not found"
            }));
            return;
          }
          
          // Check if character belongs to this campaign
          if (character.campaignId !== campaignId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character does not belong to this campaign"
            }));
            return;
          }
          
          const userRole = userCampaign.role;
          const isOwner = character.userId === authenticatedUserId;
          const isGM = userRole === "gm";
          
          // Only owner or GM can broadcast character updates
          // Other users with edit permission can edit via REST but not broadcast
          if (!isOwner && !isGM) {
            // Check if user has edit permission
            const permission = await storage.getCharacterPermission(characterId, authenticatedUserId);
            if (!permission || permission.accessLevel !== 'edit') {
              ws.send(JSON.stringify({
                type: "error",
                message: "Not authorized to update this character"
              }));
              return;
            }
          }
          
          // Broadcast to authorized users only (permission-filtered)
          // This uses the simpler approach: send a notification that triggers client refetch
          // The client will then fetch via REST which enforces permissions
          await broadcastToAuthorizedUsers(campaignId, characterId, {
            type: "character_changed",
            characterId,
            updatedBy: authenticatedUserId
          });
          
          console.log(`[WebSocket] Character ${characterId} update broadcast by ${username}`);
        }
        
        // Handle dice roll requests - server-authoritative
        if (message.type === "request_dice_roll") {
          const { campaignId, dieType, modifier, purpose, characterId } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You have not joined this campaign"
            }));
            return;
          }
          
          // Validate die type (d30 for attribute rolls with +5 modifier)
          const validDieTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd30'];
          if (!validDieTypes.includes(dieType)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid die type"
            }));
            return;
          }
          
          // Create server-side roll result using crypto.randomInt
          const rollRequest: RollRequest = {
            dieType,
            modifier: modifier || 0,
            purpose,
            characterId,
          };
          
          const rollResult = createRollResult(rollRequest, authenticatedUserId, username);
          const wsMessage = createWebSocketDiceRollMessage(rollResult);
          
          // Get character name if characterId is provided
          let characterName = "";
          if (characterId) {
            const character = await storage.getCharacter(characterId);
            if (character) {
              characterName = character.name;
            }
          }
          
          // Format dice roll result for chat
          const modifierText = rollResult.modifier !== 0 
            ? (rollResult.modifier > 0 ? ` + ${rollResult.modifier}` : ` - ${Math.abs(rollResult.modifier)}`)
            : "";
          const purposeText = purpose ? ` - ${purpose}` : "";
          const characterText = characterName ? ` (${characterName})` : "";
          const rollText = `${dieType.toUpperCase()}${purposeText}${characterText}: ${rollResult.result}${modifierText} = ${rollResult.total}`;
          
          // Save dice roll to chat as a "roll" type message
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId,
            sender: username,
            text: rollText,
            type: "roll"
          });
          
          // Broadcast dice roll result (for 3D animation) AND chat message to all clients
          const room = campaignRooms.get(campaignId);
          if (room) {
            // Send dice roll for animation
            const rollBroadcast = JSON.stringify(wsMessage);
            // Send chat message for chat display
            const chatBroadcast = JSON.stringify({ 
              type: "chat_message", 
              message: chatMessage 
            });
            
            room.forEach((client) => {
              if (client.readyState === 1) {
                client.send(rollBroadcast);
                client.send(chatBroadcast);
              }
            });
          }
          
          console.log(`[WebSocket] Dice roll by ${username}: ${dieType} = ${rollResult.result} (total: ${rollResult.total})`);
        }
        
        // Handle initiative roll requests - server-authoritative
        if (message.type === "request_initiative_roll") {
          const { campaignId, sceneId, characterId } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You have not joined this campaign"
            }));
            return;
          }
          
          // Verify scene exists
          const scene = await storage.getScene(sceneId);
          if (!scene) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Scene not found"
            }));
            return;
          }
          
          // Get the character
          const character = await storage.getCharacter(characterId);
          if (!character) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character not found"
            }));
            return;
          }
          
          // Check authorization
          const campaign = await storage.getCampaign(scene.campaignId);
          const isGM = campaign?.gmUserId === authenticatedUserId;
          const isOwner = character.userId === authenticatedUserId;
          
          if (!isGM && !isOwner) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized to roll initiative for this character"
            }));
            return;
          }
          
          // Server-authoritative d20 roll using crypto.randomInt
          const d20Roll = crypto.randomInt(1, 21);
          const finesse = character.finesse || 0;
          const total = d20Roll + finesse;
          
          // Create initiative entry
          const entry = await storage.createInitiativeEntry({
            sceneId,
            characterId,
            value: total,
            isHidden: false
          });
          
          // Format initiative roll for chat
          const modifierText = finesse !== 0 
            ? (finesse > 0 ? ` + ${finesse}` : ` - ${Math.abs(finesse)}`)
            : "";
          const rollText = `Initiative - ${character.name}: ${d20Roll}${modifierText} = ${total}`;
          
          // Save to chat as a "roll" type message
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId,
            sender: username,
            text: rollText,
            type: "roll"
          });
          
          // Broadcast initiative update, dice roll, and chat message to all clients
          const room = campaignRooms.get(campaignId);
          if (room) {
            // Send initiative roll notification (for animation)
            const initiativeRollBroadcast = JSON.stringify({
              type: 'initiative_roll',
              sceneId,
              characterId,
              characterName: character.name,
              result: d20Roll,
              modifier: finesse,
              total,
              username
            });
            
            // Send initiative update (to refresh initiative tracker)
            const initiativeUpdateBroadcast = JSON.stringify({
              type: 'initiative_update',
              sceneId,
              campaignId
            });
            
            // Send chat message
            const chatBroadcast = JSON.stringify({ 
              type: "chat_message", 
              message: chatMessage 
            });
            
            room.forEach((client) => {
              if (client.readyState === 1) {
                client.send(initiativeRollBroadcast);
                client.send(initiativeUpdateBroadcast);
                client.send(chatBroadcast);
              }
            });
          }
          
          console.log(`[WebSocket] Initiative roll by ${username} for ${character.name}: ${d20Roll} + ${finesse} = ${total}`);
        }
      } catch (err) {
        console.error("WebSocket error:", err);
        ws.send(JSON.stringify({
          type: "error",
          message: "An error occurred processing your message"
        }));
      }
    }

    ws.on("close", () => {
      // Remove from all campaign rooms
      const campaigns = (ws as any).campaigns || new Map();
      campaigns.forEach((_: any, campaignId: string) => {
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

  /**
   * checkCharacterAccess - Helper function to check character permissions
   * 
   * Returns whether the user has access to a character based on:
   * - Character ownership
   * - GM status in the campaign
   * - Campaign membership verification
   * - Explicit permissions granted by the GM
   */
  async function checkCharacterAccess(
    characterId: string,
    userId: string,
    requiredLevel: 'view' | 'edit'
  ): Promise<{ allowed: boolean; isOwner: boolean; isGM: boolean; character?: any; campaign?: any; permission?: any }> {
    const character = await storage.getCharacter(characterId);
    if (!character) {
      return { allowed: false, isOwner: false, isGM: false };
    }
    
    const campaign = await storage.getCampaign(character.campaignId);
    if (!campaign) {
      return { allowed: false, isOwner: false, isGM: false };
    }
    
    const isOwner = character.userId === userId;
    const isGM = campaign.gmUserId === userId;
    
    // Verify user is still a member of the campaign (skip for GM)
    if (!isGM) {
      const isMember = await storage.isCampaignMember(campaign.id, userId);
      if (!isMember) {
        return { allowed: false, isOwner: false, isGM: false, character, campaign };
      }
    }
    
    if (isOwner || isGM) {
      return { allowed: true, isOwner, isGM, character, campaign };
    }
    
    const permission = await storage.getCharacterPermission(characterId, userId);
    if (!permission) {
      return { allowed: false, isOwner, isGM, character, campaign };
    }
    
    if (requiredLevel === 'view') {
      return { 
        allowed: permission.accessLevel === 'view' || permission.accessLevel === 'edit', 
        isOwner, 
        isGM, 
        character, 
        campaign,
        permission
      };
    } else {
      return { 
        allowed: permission.accessLevel === 'edit', 
        isOwner, 
        isGM, 
        character, 
        campaign,
        permission
      };
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
      console.error('[GET /api/campaigns] Error:', err);
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
  
  // Get chat messages for a campaign
  app.get("/api/campaigns/:id/chat", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getCampaignMessages(req.params.id, 100);
      // Return in chronological order (oldest first)
      res.json(messages.reverse());
    } catch (err) {
      console.error('Error fetching chat messages:', err);
      res.status(500).json({ error: "Failed to fetch chat messages" });
    }
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

      // Check if user is banned from this campaign
      const isBanned = await storage.isUserBanned(campaign.id, req.session.userId!);
      if (isBanned) {
        return res.status(403).json({ error: "You have been banned from this campaign" });
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

  // Get assigned character for current user in campaign
  app.get("/api/campaigns/:id/assigned-character", requireAuth, async (req, res) => {
    try {
      const characterId = await storage.getAssignedCharacter(req.params.id, req.session.userId!);
      res.json({ characterId });
    } catch (err) {
      res.status(400).json({ error: "Failed to get assigned character" });
    }
  });

  // Set assigned character for current user in campaign
  app.post("/api/campaigns/:id/assigned-character", requireAuth, async (req, res) => {
    try {
      const { characterId } = req.body;
      await storage.setAssignedCharacter(req.params.id, req.session.userId!, characterId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to set assigned character" });
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

  app.get("/api/campaigns/:campaignId/characters", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const isGM = campaign.gmUserId === req.session.userId;
      const allCharacters = await storage.getCampaignCharacters(req.params.campaignId);
      
      // If GM, return all characters
      if (isGM) {
        return res.json(allCharacters);
      }
      
      // Get all permissions for this user in this campaign in one query
      const userId = req.session.userId;
      const characterIds = allCharacters.map(c => c.id);
      
      // Batch query: get all permissions for these characters for this user
      const allPermissions = await storage.getUserPermissionsForCharacters(userId, characterIds);
      const permissionMap = new Map(allPermissions.map(p => [p.characterId, p.accessLevel]));
      
      // Filter characters based on ownership or permissions
      const filteredCharacters = allCharacters.filter(char => {
        // Character owner always has access
        if (char.userId === userId) {
          return true;
        }
        
        // Check permission from map
        const accessLevel = permissionMap.get(char.id);
        return accessLevel === 'view' || accessLevel === 'edit';
      });
      
      res.json(filteredCharacters);
    } catch (e) {
      res.status(500).json({ error: "Failed to get characters" });
    }
  });

  app.get("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'view');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to view this character" });
      }
      
      res.json(access.character);
    } catch (err) {
      res.status(500).json({ error: "Failed to get character" });
    }
  });

  app.patch("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to edit this character" });
      }

      // Validate update based on GM status
      try {
        validateCharacterUpdate(req.body, access.isGM);
      } catch (validationErr: any) {
        return res.status(403).json({ error: validationErr.message });
      }

      // Validate attribute and skill point totals based on level
      const character = access.character;
      const updates = req.body;
      const level = updates.level ?? character.level ?? 1;
      const maxPositiveAttrPoints = 6 + Math.floor(level / 3);
      const maxNegativeAttrPoints = 4;
      const maxPositiveSkillPoints = 12 + ((level - 1) * 2);
      const maxNegativeSkillPoints = 6;

      const attrs = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];
      const attrValues = attrs.map(a => updates[a] ?? character[a] ?? 0);
      const positiveAttr = attrValues.filter((v: number) => v > 0).reduce((s: number, v: number) => s + v, 0);
      const negativeAttr = Math.abs(attrValues.filter((v: number) => v < 0).reduce((s: number, v: number) => s + v, 0));

      const skills = ['skillAgility', 'skillArcana', 'skillCharisma', 'skillConcentration', 'skillCulture', 'skillDeception', 'skillHistory', 'skillIntimidation', 'skillInvestigation', 'skillMedicine', 'skillPerception', 'skillSleightOfHand', 'skillStealth', 'skillStrength', 'skillWisdom'];
      const skillValues = skills.map(s => updates[s] ?? character[s] ?? 0);
      const positiveSkill = skillValues.filter((v: number) => v > 0).reduce((s: number, v: number) => s + v, 0);
      const negativeSkill = Math.abs(skillValues.filter((v: number) => v < 0).reduce((s: number, v: number) => s + v, 0));

      if (positiveAttr > maxPositiveAttrPoints || negativeAttr > maxNegativeAttrPoints) {
        return res.status(400).json({ 
          error: `Invalid attribute points: +${positiveAttr}/-${negativeAttr} (expected +${maxPositiveAttrPoints}/-${maxNegativeAttrPoints} for level ${level})` 
        });
      }
      if (positiveSkill > maxPositiveSkillPoints || negativeSkill > maxNegativeSkillPoints) {
        return res.status(400).json({ 
          error: `Invalid skill points: +${positiveSkill}/-${negativeSkill} (expected +${maxPositiveSkillPoints}/-${maxNegativeSkillPoints} for level ${level})` 
        });
      }

      const updatedCharacter = await storage.updateCharacter(req.params.id, req.body);
      res.json(updatedCharacter);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character" });
    }
  });

  // Delete character - GM only, also deletes associated tokens
  app.delete("/api/characters/:id", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      const campaign = await storage.getCampaign(character.campaignId!);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Only campaign GM can delete characters
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can delete characters" });
      }
      
      // Delete character and all associated tokens in a single transaction
      await storage.deleteCharacterWithTokens(req.params.id);
      
      // Broadcast character deletion to campaign room
      const room = campaignRooms.get(character.campaignId!);
      if (room) {
        const message = JSON.stringify({
          type: 'character_deleted',
          characterId: req.params.id,
        });
        room.forEach((ws) => {
          if (ws.readyState === 1) {
            ws.send(message);
          }
        });
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete character:", err);
      res.status(500).json({ error: "Failed to delete character" });
    }
  });

  // Hotbar routes
  app.get("/api/characters/:characterId/hotbars", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'view');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to view this character's hotbars" });
      }

      const hotbars = await storage.getHotbarsByCharacter(req.params.characterId);
      res.json(hotbars);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch hotbars" });
    }
  });

  app.post("/api/characters/:characterId/hotbars", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to edit this character's hotbars" });
      }

      const hotbarData = insertHotbarSchema.parse({
        ...req.body,
        characterId: req.params.characterId
      });

      // Server-side armor slot validation
      if (hotbarData.hotbarType === 'armor' && hotbarData.itemId) {
        const item = await storage.getItem(hotbarData.itemId);
        if (!item) {
          return res.status(400).json({ error: "Item not found" });
        }
        if (item.itemType !== 'armor') {
          return res.status(400).json({ error: "Only armor items can be equipped in armor slots" });
        }
        
        // Map slot numbers to required armor slot types
        const slotToArmorType: Record<number, string> = {
          0: 'helm',
          1: 'chest',
          2: 'arm',
          3: 'legs',
          4: 'boots'
        };
        const requiredSlot = slotToArmorType[hotbarData.slotNumber];
        if (item.armorSlot !== requiredSlot) {
          const slotLabels: Record<string, string> = { helm: 'Helm', chest: 'Chest', arm: 'Arm', legs: 'Legs', boots: 'Boots' };
          return res.status(400).json({ 
            error: `${item.name} is ${slotLabels[item.armorSlot || ''] || 'Unknown'} armor - it can only go in the ${slotLabels[requiredSlot]} slot` 
          });
        }
      }

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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'view');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to view this character's spells" });
      }

      const spells = await storage.getSpellsByCharacter(req.params.characterId);
      res.json(spells);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spells" });
    }
  });

  app.post("/api/characters/:characterId/spells", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to add spells to this character" });
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

      const access = await checkCharacterAccess(currentSpell.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to edit this character's spells" });
      }

      // Validate update based on GM status
      try {
        validateSpellUpdate(req.body, access.isGM);
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
      // First fetch the spell to get its character
      const currentSpell = await storage.updateSpell(req.params.id, {});
      if (!currentSpell) {
        return res.status(404).json({ error: "Spell not found" });
      }

      const access = await checkCharacterAccess(currentSpell.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to delete this character's spells" });
      }

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

  // Kick a player (GM only)
  app.post("/api/campaigns/:campaignId/kick/:userId", requireAuth, async (req, res) => {
    try {
      const { campaignId, userId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can kick players" });
      }

      if (userId === campaign.gmUserId) {
        return res.status(400).json({ error: "Cannot kick the GM" });
      }

      await storage.kickMember(campaignId, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to kick player" });
    }
  });

  // Ban a player (GM only)
  app.post("/api/campaigns/:campaignId/ban/:userId", requireAuth, async (req, res) => {
    try {
      const { campaignId, userId } = req.params;
      const { reason } = req.body;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can ban players" });
      }

      if (userId === campaign.gmUserId) {
        return res.status(400).json({ error: "Cannot ban the GM" });
      }

      const ban = await storage.banMember(campaignId, userId, reason);
      res.json(ban);
    } catch (err) {
      res.status(400).json({ error: "Failed to ban player" });
    }
  });

  // Unban a player (GM only)
  app.delete("/api/campaigns/:campaignId/bans/:userId", requireAuth, async (req, res) => {
    try {
      const { campaignId, userId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can unban players" });
      }

      await storage.unbanMember(campaignId, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to unban player" });
    }
  });

  // Get banned players list (GM only)
  app.get("/api/campaigns/:campaignId/bans", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can view banned players" });
      }

      const bans = await storage.getCampaignBans(campaignId);
      res.json(bans);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch banned players" });
    }
  });

  // GM level-up all characters route
  app.post("/api/campaigns/:campaignId/level-up-all", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GM can level up all characters" });
      }
      
      const { mode, targetLevel } = req.body;
      const characters = await storage.getCampaignCharacters(req.params.campaignId);
      
      const updates = [];
      for (const char of characters) {
        let newLevel = char.level;
        if (mode === 'set' && targetLevel) {
          newLevel = Math.min(20, Math.max(1, targetLevel));
        } else if (mode === 'add') {
          newLevel = Math.min(20, (char.level || 1) + 1);
        }
        
        if (newLevel !== char.level) {
          await storage.updateCharacter(char.id, { level: newLevel });
          updates.push({ id: char.id, name: char.name, newLevel });
        }
      }
      
      res.json({ message: "Characters leveled up", updates });
    } catch (e) {
      console.error("Level up error:", e);
      res.status(500).json({ error: "Failed to level up characters" });
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

  // Admin system species routes
  app.get("/api/admin/system-species", requireAdmin, async (req, res) => {
    try {
      const systemName = req.query.system as string | undefined;
      const species = await storage.getSystemSpecies(systemName);
      res.json(species);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system species" });
    }
  });

  app.post("/api/admin/system-species", requireAdmin, async (req, res) => {
    try {
      const species = await storage.createSystemSpecies(req.body);
      res.json(species);
    } catch (err) {
      res.status(400).json({ error: "Failed to create species" });
    }
  });

  app.patch("/api/admin/system-species/:id", requireAdmin, async (req, res) => {
    try {
      const species = await storage.getSystemSpeciesById(req.params.id);
      if (!species) {
        return res.status(404).json({ error: "Species not found" });
      }
      const updated = await storage.updateSystemSpecies(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update species" });
    }
  });

  app.delete("/api/admin/system-species/:id", requireAdmin, async (req, res) => {
    try {
      const species = await storage.getSystemSpeciesById(req.params.id);
      if (!species) {
        return res.status(404).json({ error: "Species not found" });
      }
      await storage.deleteSystemSpecies(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete species" });
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'view');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to view this character's items" });
      }

      const items = await storage.getItemsByCharacter(req.params.characterId);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.post("/api/characters/:characterId/items", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to add items to this character" });
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

      const access = await checkCharacterAccess(currentItem.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to edit this character's items" });
      }

      // Validate update based on GM status
      try {
        validateItemUpdate(req.body, access.isGM);
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

      const access = await checkCharacterAccess(item.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to damage this character's items" });
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
      
      const access = await checkCharacterAccess(item.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to delete this character's items" });
      }

      await storage.deleteItem(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete item" });
    }
  });

  // Get current user's permissions for all characters in a campaign
  app.get("/api/campaigns/:campaignId/my-permissions", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Get all characters in the campaign
      const allCharacters = await storage.getCampaignCharacters(req.params.campaignId);
      const characterIds = allCharacters.map(c => c.id);
      
      // Get all permissions for this user
      const permissions = await storage.getUserPermissionsForCharacters(req.session.userId!, characterIds);
      
      // Build a map of characterId -> accessLevel, including ownership
      const permissionMap: Record<string, string> = {};
      
      // Add explicit permissions
      for (const p of permissions) {
        permissionMap[p.characterId] = p.accessLevel;
      }
      
      // Add ownership (owners always have 'edit' level)
      for (const char of allCharacters) {
        if (char.userId === req.session.userId) {
          permissionMap[char.id] = 'owner';
        }
      }
      
      // Check if user is GM
      const isGM = campaign.gmUserId === req.session.userId;
      
      res.json({ permissions: permissionMap, isGM });
    } catch (e) {
      console.error("Failed to get my permissions:", e);
      res.status(500).json({ error: "Failed to get permissions" });
    }
  });

  // Character Permissions routes
  app.get("/api/characters/:id/permissions", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can view character permissions" });
      }
      
      const permissions = await storage.getCharacterPermissions(req.params.id);
      res.json(permissions);
    } catch (e) {
      res.status(500).json({ error: "Failed to get permissions" });
    }
  });

  app.put("/api/characters/:id/permissions/:userId", requireAuth, async (req, res) => {
    try {
      const { accessLevel } = req.body;
      if (!["none", "view", "edit"].includes(accessLevel)) {
        return res.status(400).json({ error: "Invalid access level" });
      }
      
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      const campaign = await storage.getCampaign(character.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can set character permissions" });
      }
      
      const result = await storage.setCharacterPermission(
        req.params.id,
        req.params.userId,
        accessLevel
      );
      
      // Broadcast permission update to affected user via WebSocket
      const campaignId = character.campaignId;
      const room = campaignRooms.get(campaignId);
      console.log(`[Permission Update] Campaign: ${campaignId}, Room exists: ${!!room}, Room size: ${room?.size || 0}`);
      
      if (room) {
        const permissionUpdateMessage = JSON.stringify({
          type: 'permission_update',
          campaignId,
          characterId: req.params.id,
          characterName: character.name,
          targetUserId: req.params.userId,
          accessLevel,
        });
        
        // Send to all clients of the affected user in this campaign room
        const clients = Array.from(room);
        let sentToTarget = false;
        let sentToGM = false;
        
        for (const client of clients) {
          const clientUserId = (client as any).userId;
          console.log(`[Permission Update] Checking client userId: ${clientUserId}, target: ${req.params.userId}, GM: ${req.session.userId}`);
          
          if (client.readyState === 1 && clientUserId === req.params.userId) {
            client.send(permissionUpdateMessage);
            sentToTarget = true;
            console.log(`[Permission Update] Sent to target user: ${req.params.userId}`);
          }
        }
        
        // Also notify the GM who made the change
        for (const client of clients) {
          if (client.readyState === 1 && (client as any).userId === req.session.userId) {
            client.send(permissionUpdateMessage);
            sentToGM = true;
            console.log(`[Permission Update] Sent to GM: ${req.session.userId}`);
          }
        }
        
        console.log(`[Permission Update] Summary - Sent to target: ${sentToTarget}, Sent to GM: ${sentToGM}`);
      }
      
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to set permission" });
    }
  });

  // Initiative Tracking routes
  app.get("/api/scenes/:sceneId/initiative", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const isGM = campaign.gmUserId === req.session.userId;
      const entries = await storage.getSceneInitiative(req.params.sceneId);
      
      // If not GM, filter out hidden entries
      const visibleEntries = isGM ? entries : entries.filter(e => !e.isHidden);
      
      res.json({
        entries: visibleEntries,
        inCombat: scene.inCombat,
        currentTurnCharacterId: scene.currentTurnCharacterId
      });
    } catch (e) {
      console.error("Failed to get initiative:", e);
      res.status(500).json({ error: "Failed to get initiative" });
    }
  });

  app.post("/api/scenes/:sceneId/initiative", requireAuth, async (req, res) => {
    try {
      const { characterId, value, isHidden } = req.body;
      
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const character = await storage.getCharacter(characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      const isGM = campaign?.gmUserId === req.session.userId;
      const isOwner = character.userId === req.session.userId;
      
      // Only GM or character owner can roll initiative
      if (!isGM && !isOwner) {
        return res.status(403).json({ error: "Not authorized to roll initiative for this character" });
      }
      
      const entry = await storage.createInitiativeEntry({
        sceneId: req.params.sceneId,
        characterId,
        value,
        isHidden: isHidden ?? false
      });
      
      // Broadcast initiative update to campaign room
      const room = campaignRooms.get(scene.campaignId);
      if (room) {
        const initiativeMessage = JSON.stringify({
          type: 'initiative_update',
          sceneId: req.params.sceneId,
          campaignId: scene.campaignId
        });
        
        const clients = Array.from(room);
        for (const client of clients) {
          if (client.readyState === 1) {
            client.send(initiativeMessage);
          }
        }
      }
      
      res.json(entry);
    } catch (e) {
      console.error("Failed to create initiative entry:", e);
      res.status(500).json({ error: "Failed to create initiative entry" });
    }
  });

  app.patch("/api/initiative/:id", requireAuth, async (req, res) => {
    try {
      const { value, isHidden } = req.body;
      
      // Get the initiative entry to find the scene
      const entries = await db.select().from(initiativeEntries).where(eq(initiativeEntries.id, req.params.id)).limit(1);
      const entry = entries[0];
      if (!entry) {
        return res.status(404).json({ error: "Initiative entry not found" });
      }
      
      const scene = await storage.getScene(entry.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can edit initiative values" });
      }
      
      const updated = await storage.updateInitiativeEntry(req.params.id, { value, isHidden });
      
      // Broadcast initiative update
      const room = campaignRooms.get(scene.campaignId);
      if (room) {
        const initiativeMessage = JSON.stringify({
          type: 'initiative_update',
          sceneId: entry.sceneId,
          campaignId: scene.campaignId
        });
        
        const clients = Array.from(room);
        for (const client of clients) {
          if (client.readyState === 1) {
            client.send(initiativeMessage);
          }
        }
      }
      
      res.json(updated);
    } catch (e) {
      console.error("Failed to update initiative:", e);
      res.status(500).json({ error: "Failed to update initiative" });
    }
  });

  app.delete("/api/initiative/:id", requireAuth, async (req, res) => {
    try {
      // Get the initiative entry to find the scene
      const entries = await db.select().from(initiativeEntries).where(eq(initiativeEntries.id, req.params.id)).limit(1);
      const entry = entries[0];
      if (!entry) {
        return res.status(404).json({ error: "Initiative entry not found" });
      }
      
      const scene = await storage.getScene(entry.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can remove initiative entries" });
      }
      
      await storage.deleteInitiativeEntry(req.params.id);
      
      // Broadcast initiative update
      const room = campaignRooms.get(scene.campaignId);
      if (room) {
        const initiativeMessage = JSON.stringify({
          type: 'initiative_update',
          sceneId: entry.sceneId,
          campaignId: scene.campaignId
        });
        
        const clients = Array.from(room);
        for (const client of clients) {
          if (client.readyState === 1) {
            client.send(initiativeMessage);
          }
        }
      }
      
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete initiative:", e);
      res.status(500).json({ error: "Failed to delete initiative" });
    }
  });

  // Start/stop combat
  app.post("/api/scenes/:sceneId/combat", requireAuth, async (req, res) => {
    try {
      const { inCombat, currentTurnCharacterId } = req.body;
      
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can start/stop combat" });
      }
      
      const updated = await storage.updateScene(req.params.sceneId, { 
        inCombat, 
        currentTurnCharacterId 
      });
      
      // Broadcast combat state update
      const room = campaignRooms.get(scene.campaignId);
      if (room) {
        const combatMessage = JSON.stringify({
          type: 'combat_update',
          sceneId: req.params.sceneId,
          campaignId: scene.campaignId,
          inCombat,
          currentTurnCharacterId
        });
        
        const clients = Array.from(room);
        for (const client of clients) {
          if (client.readyState === 1) {
            client.send(combatMessage);
          }
        }
      }
      
      res.json(updated);
    } catch (e) {
      console.error("Failed to update combat state:", e);
      res.status(500).json({ error: "Failed to update combat state" });
    }
  });

  // Clear all initiative entries for a scene
  app.delete("/api/scenes/:sceneId/initiative", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can clear initiative" });
      }
      
      await storage.clearSceneInitiative(req.params.sceneId);
      
      // Also reset combat state
      await storage.updateScene(req.params.sceneId, { 
        inCombat: false, 
        currentTurnCharacterId: null 
      });
      
      // Broadcast initiative clear
      const room = campaignRooms.get(scene.campaignId);
      if (room) {
        const clearMessage = JSON.stringify({
          type: 'initiative_update',
          sceneId: req.params.sceneId,
          campaignId: scene.campaignId
        });
        
        const clients = Array.from(room);
        for (const client of clients) {
          if (client.readyState === 1) {
            client.send(clearMessage);
          }
        }
      }
      
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to clear initiative:", e);
      res.status(500).json({ error: "Failed to clear initiative" });
    }
  });

  return httpServer;
}
