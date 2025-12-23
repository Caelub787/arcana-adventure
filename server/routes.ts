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
import { listFolders, listImages, getImageBase64, searchImages } from "./googleDrive";

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

  /**
   * broadcastToCampaign - Broadcast to ALL connected users in a campaign
   * 
   * This function broadcasts messages to all users in a campaign room without
   * any permission filtering. Used for combat updates, token changes, scene changes,
   * and other updates that all campaign members need to see.
   */
  function broadcastToCampaign(campaignId: string, message: any): void {
    const room = campaignRooms.get(campaignId);
    if (!room || room.size === 0) return;

    const messageString = JSON.stringify(message);
    
    room.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(messageString);
      }
    });
  }

  /**
   * calculateFeatHpBonus - Calculate total HP bonus from character's unlocked feats
   * 
   * This function fetches a character's unlocked feats and sums up all hp_bonus effects.
   * It matches the client-side calculation by iterating over ALL unlocked feats,
   * not just those from a specific tree.
   */
  async function calculateFeatHpBonus(characterId: string, characterLevel: number): Promise<number> {
    try {
      // Get character's unlocked feat records
      const characterFeatRecords = await storage.getCharacterFeats(characterId);
      if (characterFeatRecords.length === 0) return 0;
      
      // Sum up HP bonuses from all unlocked feats
      let totalHpBonus = 0;
      
      for (const charFeat of characterFeatRecords) {
        // Fetch each feat definition directly by ID (works for any tree)
        const feat = await storage.getFeat(charFeat.featId);
        if (!feat || !feat.effects || !Array.isArray(feat.effects)) continue;
        
        for (const effect of feat.effects as any[]) {
          if (effect.type === 'hp_bonus') {
            // Support per-level scaling: if subtype is 'per_level', multiply by character level
            if (effect.subtype === 'per_level') {
              totalHpBonus += (effect.value || 0) * characterLevel;
            } else {
              totalHpBonus += effect.value || 0;
            }
          }
        }
      }
      
      return totalHpBonus;
    } catch (err) {
      console.error('[calculateFeatHpBonus] Error:', err);
      return 0;
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
    // In production, we allow any HTTPS origin since the app is publicly deployed
    const isProduction = process.env.NODE_ENV === 'production';
    const isAllowed = !origin || isProduction || allowedOrigins.some(allowed => 
      origin === allowed || 
      origin.startsWith(allowed) || 
      (allowed.includes('.repl.co') && origin.includes('.repl.co')) ||
      origin.includes('.picard.replit.dev') ||
      origin.includes('.replit.dev') ||
      origin.includes('.replit.app') || // Published apps use .replit.app domain
      origin.startsWith('https://') // Allow any HTTPS origin (custom domains)
    );
    
    console.log(`[WebSocket] Connection attempt - origin: ${origin}, isProduction: ${isProduction}, isAllowed: ${isAllowed}`);
    
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
    console.log(`[WebSocket] Session parsed, userId: ${userId}, session exists: ${!!(req as any).session}`);
    
    // Reject unauthenticated connections
    if (!userId) {
      console.log(`[WebSocket] Rejecting - no userId in session. Cookie header: ${req.headers.cookie?.substring(0, 50)}...`);
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
          const { campaignId, dieType, modifier, purpose, characterId, advantage } = message;
          
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
            advantage: advantage || 'none',
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
          const advantageText = rollResult.advantage === 'advantage' ? ' [ADV]' : 
                               rollResult.advantage === 'disadvantage' ? ' [DIS]' : '';
          const rollsText = rollResult.rolls ? ` (${rollResult.rolls.join(', ')})` : '';
          const rollText = `${dieType.toUpperCase()}${advantageText}${purposeText}${characterText}: ${rollResult.result}${rollsText}${modifierText} = ${rollResult.total}`;
          
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
        
        // Handle combat damage - bypasses normal edit permissions
        // Anyone in the campaign can apply damage to tokens during combat
        if (message.type === "apply_combat_damage") {
          const { campaignId, characterId, damage, damageType, attackerName, isHealing } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You have not joined this campaign"
            }));
            return;
          }
          
          // Get the character to apply damage
          const character = await storage.getCharacter(characterId);
          if (!character) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character not found"
            }));
            return;
          }
          
          // Verify character belongs to this campaign
          if (character.campaignId !== campaignId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character does not belong to this campaign"
            }));
            return;
          }
          
          // Apply damage (or healing if isHealing is true)
          let newHp: number;
          if (isHealing) {
            newHp = Math.min(character.hp + damage, character.maxHp);
          } else {
            newHp = Math.max(0, character.hp - damage);
          }
          
          // Update character HP directly - bypassing normal permission checks
          await storage.updateCharacter(characterId, { hp: newHp });
          
          const actionText = isHealing ? 'healed' : 'damaged';
          
          // Broadcast to ALL campaign members - everyone needs to see HP changes
          broadcastToCampaign(campaignId, {
            type: "character_hp_update",
            characterId,
            hp: newHp,
            previousHp: character.hp,
            damage,
            isHealing,
            attackerName: attackerName || username
          });
          
          console.log(`[WebSocket] Combat damage: ${attackerName || username} ${actionText} ${character.name} for ${damage} (HP: ${character.hp} → ${newHp})`);
        }
        
        // Handle combat energy - bypasses normal edit permissions
        // For Energy damage type spells - adds or subtracts from target's energy
        if (message.type === "apply_combat_energy") {
          const { campaignId, characterId, amount, attackerName, isGain } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You have not joined this campaign"
            }));
            return;
          }
          
          // Get the character to apply energy change
          const character = await storage.getCharacter(characterId);
          if (!character) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character not found"
            }));
            return;
          }
          
          // Verify the character belongs to this campaign
          if (character.campaignId !== campaignId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Character does not belong to this campaign"
            }));
            return;
          }
          
          // Apply energy change (gain if isGain is true, otherwise drain)
          let newEnergy: number;
          if (isGain) {
            newEnergy = Math.min(character.energy + amount, character.maxEnergy);
          } else {
            newEnergy = Math.max(0, character.energy - amount);
          }
          
          // Update character energy directly - bypassing normal permission checks
          await storage.updateCharacter(characterId, { energy: newEnergy });
          
          // Create a chat message for the combat log
          const actionText = isGain ? 'restored' : 'drained';
          const chatText = `${attackerName || username} ${actionText} ${amount} energy ${isGain ? 'to' : 'from'} ${character.name} (Energy: ${character.energy} → ${newEnergy})`;
          
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId,
            sender: username,
            text: chatText,
            type: "roll"
          });
          
          // Broadcast to ALL campaign members - everyone needs to see energy changes
          broadcastToCampaign(campaignId, {
            type: "character_energy_update",
            characterId,
            energy: newEnergy,
            previousEnergy: character.energy,
            amount,
            isGain,
            attackerName: attackerName || username
          });
          
          broadcastToCampaign(campaignId, {
            type: "chat_message",
            message: chatMessage
          });
          
          console.log(`[WebSocket] Combat energy: ${attackerName || username} ${actionText} ${amount} energy ${isGain ? 'to' : 'from'} ${character.name} (Energy: ${character.energy} → ${newEnergy})`);
        }
        
        // Handle token updates - broadcast to all
        if (message.type === "token_created" || message.type === "token_deleted" || message.type === "token_updated") {
          const { campaignId } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) return;
          
          // Broadcast token change to all campaign members
          broadcastToCampaign(campaignId, message);
        }
        
        // Handle scene updates - broadcast to all
        if (message.type === "scene_updated" || message.type === "scene_changed") {
          const { campaignId } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) return;
          
          // Broadcast scene change to all campaign members
          broadcastToCampaign(campaignId, message);
        }
        
        // Handle AoE targeting - broadcast to all campaign members
        // so everyone can see each other's AoE placement in real-time
        if (message.type === "aoe_targeting") {
          const { campaignId, active, spellName, spellAoe, casterTokenId, casterName, center, locked } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            console.log('[AoE Server] User not in campaign:', campaignId);
            return;
          }
          
          // Broadcast AoE targeting to all OTHER campaign members (not the sender)
          const room = campaignRooms.get(campaignId);
          if (room) {
            const aoeMessage = JSON.stringify({
              type: "aoe_targeting",
              userId: authenticatedUserId,
              username,
              active,
              spellName,
              spellAoe,
              casterTokenId,
              casterName,
              center,
              locked
            });
            
            let sentCount = 0;
            room.forEach((client) => {
              // Send to all clients except the sender
              if (client !== ws && client.readyState === 1) {
                client.send(aoeMessage);
                sentCount++;
              }
            });
            console.log(`[AoE Server] Broadcast from ${username}: active=${active}, sent to ${sentCount} other clients`);
          }
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
    console.log(`[checkCharacterAccess] Checking access for character ${characterId} by user ${userId} (${requiredLevel})`);
    
    const character = await storage.getCharacter(characterId);
    if (!character) {
      console.log(`[checkCharacterAccess] Character not found`);
      return { allowed: false, isOwner: false, isGM: false };
    }
    
    const campaign = await storage.getCampaign(character.campaignId);
    if (!campaign) {
      console.log(`[checkCharacterAccess] Campaign not found`);
      return { allowed: false, isOwner: false, isGM: false };
    }
    
    const isOwner = character.userId === userId;
    const isGM = campaign.gmUserId === userId;
    console.log(`[checkCharacterAccess] Character userId: ${character.userId}, Request userId: ${userId}, isOwner: ${isOwner}, isGM: ${isGM}`);
    
    // Verify user is still a member of the campaign (skip for GM)
    if (!isGM) {
      const isMember = await storage.isCampaignMember(campaign.id, userId);
      console.log(`[checkCharacterAccess] isCampaignMember: ${isMember}`);
      if (!isMember) {
        return { allowed: false, isOwner: false, isGM: false, character, campaign };
      }
    }
    
    if (isOwner || isGM) {
      console.log(`[checkCharacterAccess] Allowed - isOwner: ${isOwner}, isGM: ${isGM}`);
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
      console.log(`[LOGIN] Attempt for email: ${email}`);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log(`[LOGIN] User not found for email: ${email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }
      console.log(`[LOGIN] User found: ${user.username}, checking password...`);

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.log(`[LOGIN] Password mismatch for user: ${user.username}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }
      console.log(`[LOGIN] Password valid for user: ${user.username}`);

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

      // Create default scene with Ancient ruins battlemap background
      const defaultScene = await storage.createScene({
        campaignId: campaign.id,
        name: "Default Scene",
        backgroundImage: "/attached_assets/default_battlemap.webp",
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

  // Clear chat messages for a campaign (GM only)
  app.delete("/api/campaigns/:id/chat", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = req.session.userId!;
      
      // Check if user is GM of this campaign
      const members = await storage.getCampaignMembers(campaignId);
      const member = members.find(m => m.userId === userId);
      
      if (!member || member.role !== 'gm') {
        return res.status(403).json({ error: "Only the GM can clear chat" });
      }
      
      await storage.clearChatMessages(campaignId);
      res.json({ success: true });
    } catch (err) {
      console.error('Error clearing chat messages:', err);
      res.status(500).json({ error: "Failed to clear chat messages" });
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
      console.log("[Character Create] Request body:", JSON.stringify(req.body, null, 2));
      const character = await storage.createCharacter({
        ...req.body,
        campaignId: req.params.campaignId,
        userId: req.session.userId!
      });
      console.log("[Character Create] Success:", character.id);
      
      broadcastToCampaign(req.params.campaignId, {
        type: "character_created",
        character
      });
      
      res.json(character);
    } catch (err: any) {
      console.error("[Character Create] Error:", err.message, err.stack);
      res.status(400).json({ error: "Failed to create character", details: err.message });
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

      // Only validate attribute and skill point totals when those fields are being updated
      const character = access.character;
      const updates = req.body;
      
      const attrs = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];
      const skills = ['skillAgility', 'skillArcana', 'skillCharisma', 'skillConcentration', 'skillCulture', 'skillDeception', 'skillHistory', 'skillIntimidation', 'skillInvestigation', 'skillMedicine', 'skillPerception', 'skillSleightOfHand', 'skillStealth', 'skillStrength', 'skillWisdom'];
      
      // Check if any stat-related fields are being updated
      const isUpdatingStats = attrs.some(a => a in updates) || skills.some(s => s in updates) || 'level' in updates;
      
      if (isUpdatingStats) {
        const level = updates.level ?? character.level ?? 1;
        const maxPositiveAttrPoints = 6 + Math.floor(level / 3);
        const maxNegativeAttrPoints = 4;
        const maxPositiveSkillPoints = 12 + ((level - 1) * 2);
        const maxNegativeSkillPoints = 6;

        const attrValues = attrs.map(a => updates[a] ?? character[a] ?? 0);
        const positiveAttr = attrValues.filter((v: number) => v > 0).reduce((s: number, v: number) => s + v, 0);
        const negativeAttr = Math.abs(attrValues.filter((v: number) => v < 0).reduce((s: number, v: number) => s + v, 0));

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
      }

      console.log('[Character Update] Saving updates for character', req.params.id, ':', req.body);
      const updatedCharacter = await storage.updateCharacter(req.params.id, req.body);
      console.log('[Character Update] Saved successfully:', updatedCharacter);
      
      // Broadcast character update to all campaign members
      if (updatedCharacter?.campaignId) {
        broadcastToCampaign(updatedCharacter.campaignId, {
          type: "character_updated",
          characterId: updatedCharacter.id,
          character: updatedCharacter
        });
      }
      
      res.json(updatedCharacter);
    } catch (err) {
      console.error('[Character Update] Error:', err);
      res.status(400).json({ error: "Failed to update character" });
    }
  });

  // Short Rest - Restores HP based on species hpPerLevel die roll, requires 2 rations
  app.post("/api/characters/:id/short-rest", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to rest this character" });
      }
      
      const character = access.character;
      const rationsRequired = 2;
      
      // Get all ration items for this character (items with rationServings > 0)
      const items = await storage.getItemsByCharacter(character.id);
      const rationItems = items.filter((item) => (item.rationServings || 0) > 0 && (item.quantity || 0) > 0);
      
      // Count total rations available (sum of rationServings * quantity for each item)
      let totalRations = rationItems.reduce((sum, item) => sum + ((item.rationServings || 0) * (item.quantity || 0)), 0);
      
      if (totalRations < rationsRequired) {
        return res.status(400).json({ 
          error: `Not enough rations. Need ${rationsRequired}, have ${totalRations}` 
        });
      }
      
      // Consume rations from inventory
      // Each item provides rationServings rations per quantity
      let rationsToConsume = rationsRequired;
      for (const item of rationItems) {
        if (rationsToConsume <= 0) break;
        
        const rationServingsPerItem = item.rationServings || 1;
        const itemQuantity = item.quantity || 0;
        
        // Calculate how many items we need to consume
        const itemsNeeded = Math.ceil(rationsToConsume / rationServingsPerItem);
        const itemsToConsume = Math.min(itemQuantity, itemsNeeded);
        const rationsFromThis = itemsToConsume * rationServingsPerItem;
        
        const newQuantity = itemQuantity - itemsToConsume;
        
        if (newQuantity <= 0) {
          // Delete the item
          await storage.deleteItem(item.id);
        } else {
          // Update quantity
          await storage.updateItem(item.id, { quantity: newQuantity });
        }
        
        rationsToConsume -= rationsFromThis;
      }
      
      // Get character's species hpPerLevel for the die roll
      let hpPerLevel = 5; // Default fallback
      if (character.race) {
        const species = await storage.getSpeciesByName(character.race);
        if (species) {
          hpPerLevel = species.hpPerLevel || 5;
        }
      }
      
      // Roll the HP die (1d{hpPerLevel})
      const hpRoll = Math.floor(Math.random() * hpPerLevel) + 1;
      
      // Calculate effective max HP including feat bonuses
      const featHpBonus = await calculateFeatHpBonus(character.id, character.level || 1);
      const effectiveMaxHp = (character.maxHp || 10) + featHpBonus;
      
      // Calculate new HP: current + roll (capped at effective max)
      const maxHpGain = effectiveMaxHp - (character.hp || 0);
      const hpRestored = Math.min(hpRoll, maxHpGain);
      const newHp = Math.min((character.hp || 0) + hpRoll, effectiveMaxHp);
      
      // Calculate new Energy: current + roll (capped at max)
      const maxEnergy = character.maxEnergy || 10;
      const currentEnergy = character.energy || 0;
      const maxEnergyGain = maxEnergy - currentEnergy;
      const energyRestored = Math.min(hpRoll, maxEnergyGain);
      const newEnergy = Math.min(currentEnergy + hpRoll, maxEnergy);
      
      // Update character HP and Energy
      const updatedCharacter = await storage.updateCharacter(character.id, { hp: newHp, energy: newEnergy });
      
      // Restore short rest trait uses
      await storage.restoreShortRestTraitUses(character.id);
      
      // Fetch updated traits for broadcast
      const updatedTraits = await storage.getCharacterTraits(character.id);
      
      // Broadcast to campaign room
      if (character.campaignId) {
        const room = campaignRooms.get(character.campaignId);
        if (room) {
          const charMessage = JSON.stringify({
            type: 'character_updated',
            character: updatedCharacter,
          });
          const traitsMessage = JSON.stringify({
            type: 'traits_reset',
            characterId: character.id,
            traits: updatedTraits,
          });
          room.forEach((ws) => {
            if (ws.readyState === 1) {
              ws.send(charMessage);
              ws.send(traitsMessage);
            }
          });
        }
      }
      
      res.json({ 
        success: true, 
        hpRestored,
        energyRestored,
        hpRoll,
        dieType: `d${hpPerLevel}`,
        newHp,
        newEnergy,
        rationsConsumed: rationsRequired,
        character: updatedCharacter,
        traits: updatedTraits
      });
    } catch (err) {
      console.error("Failed to perform short rest:", err);
      res.status(500).json({ error: "Failed to perform short rest" });
    }
  });

  // Long Rest - Restores ALL HP and Energy, recovers 1 exhaustion, requires 4 rations
  app.post("/api/characters/:id/long-rest", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to rest this character" });
      }
      
      const character = access.character;
      const rationsRequired = 4;
      
      // Get all ration items for this character (items with rationServings > 0)
      const items = await storage.getItemsByCharacter(character.id);
      const rationItems = items.filter((item) => (item.rationServings || 0) > 0 && (item.quantity || 0) > 0);
      
      // Count total rations available (sum of rationServings * quantity for each item)
      let totalRations = rationItems.reduce((sum, item) => sum + ((item.rationServings || 0) * (item.quantity || 0)), 0);
      
      if (totalRations < rationsRequired) {
        return res.status(400).json({ 
          error: `Not enough rations. Need ${rationsRequired}, have ${totalRations}` 
        });
      }
      
      // Consume rations from inventory
      // Each item provides rationServings rations per quantity
      let rationsToConsume = rationsRequired;
      for (const item of rationItems) {
        if (rationsToConsume <= 0) break;
        
        const rationServingsPerItem = item.rationServings || 1;
        const itemQuantity = item.quantity || 0;
        
        // Calculate how many items we need to consume
        const itemsNeeded = Math.ceil(rationsToConsume / rationServingsPerItem);
        const itemsToConsume = Math.min(itemQuantity, itemsNeeded);
        const rationsFromThis = itemsToConsume * rationServingsPerItem;
        
        const newQuantity = itemQuantity - itemsToConsume;
        
        if (newQuantity <= 0) {
          // Delete the item
          await storage.deleteItem(item.id);
        } else {
          // Update quantity
          await storage.updateItem(item.id, { quantity: newQuantity });
        }
        
        rationsToConsume -= rationsFromThis;
      }
      
      // Calculate effective max HP including feat bonuses
      const featHpBonus = await calculateFeatHpBonus(character.id, character.level || 1);
      const effectiveMaxHp = (character.maxHp || 10) + featHpBonus;
      
      // Calculate HP restored: full HP (using effective max)
      const hpRestored = effectiveMaxHp - (character.hp || 0);
      const newHp = effectiveMaxHp;
      
      // Calculate Energy restored: full energy
      const maxEnergy = character.maxEnergy || 10;
      const energyRestored = maxEnergy - (character.energy || 0);
      const newEnergy = maxEnergy;
      
      // Calculate exhaustion recovery: reduce by 1 (min 0)
      const currentExhaustion = character.exhaustion || 0;
      const newExhaustion = Math.max(0, currentExhaustion - 1);
      const exhaustionRecovered = currentExhaustion - newExhaustion;
      
      // Update character HP, Energy, and exhaustion
      const updatedCharacter = await storage.updateCharacter(character.id, { 
        hp: newHp,
        energy: newEnergy,
        exhaustion: newExhaustion
      });
      
      // Reset trait uses on long rest (restores both long rest and short rest uses)
      await storage.resetCharacterTraitUses(character.id);
      
      // Fetch updated traits for broadcast
      const updatedTraits = await storage.getCharacterTraits(character.id);
      
      // Broadcast to campaign room
      if (character.campaignId) {
        const room = campaignRooms.get(character.campaignId);
        if (room) {
          const charMessage = JSON.stringify({
            type: 'character_updated',
            character: updatedCharacter,
          });
          const traitsMessage = JSON.stringify({
            type: 'traits_reset',
            characterId: character.id,
            traits: updatedTraits,
          });
          room.forEach((ws) => {
            if (ws.readyState === 1) {
              ws.send(charMessage);
              ws.send(traitsMessage);
            }
          });
        }
      }
      
      res.json({ 
        success: true, 
        hpRestored,
        energyRestored,
        newHp,
        newEnergy,
        exhaustionRecovered,
        newExhaustion,
        rationsConsumed: rationsRequired,
        character: updatedCharacter,
        traits: updatedTraits
      });
    } catch (err) {
      console.error("Failed to perform long rest:", err);
      res.status(500).json({ error: "Failed to perform long rest" });
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
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "hotbar_updated",
          characterId: req.params.characterId
        });
      }
      
      res.json(hotbar);
    } catch (err) {
      res.status(400).json({ error: "Failed to upsert hotbar" });
    }
  });

  app.delete("/api/hotbars/:id", requireAuth, async (req, res) => {
    try {
      const hotbar = await storage.getHotbar(req.params.id);
      if (hotbar) {
        const character = await storage.getCharacter(hotbar.characterId);
        await storage.deleteHotbar(req.params.id);
        
        if (character?.campaignId) {
          broadcastToCampaign(character.campaignId, {
            type: "hotbar_updated",
            characterId: hotbar.characterId
          });
        }
      } else {
        await storage.deleteHotbar(req.params.id);
      }
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
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "spell_created",
          characterId: req.params.characterId,
          spell
        });
      }
      
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to create spell" });
    }
  });

  app.patch("/api/spells/:id", requireAuth, async (req, res) => {
    try {
      // First fetch the spell to get its character
      const currentSpell = await storage.getSpell(req.params.id);
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
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "spell_updated",
          characterId: currentSpell.characterId,
          spell
        });
      }
      
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to update spell" });
    }
  });

  app.delete("/api/spells/:id", requireAuth, async (req, res) => {
    try {
      // First fetch the spell to get its character
      const currentSpell = await storage.getSpell(req.params.id);
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
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "spell_deleted",
          characterId: currentSpell.characterId,
          spellId: req.params.id
        });
      }
      
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
      
      // Broadcast token creation to all campaign members
      broadcastToCampaign(req.params.campaignId, {
        type: "token_created",
        token
      });
      
      res.json(token);
    } catch (err) {
      res.status(400).json({ error: "Failed to create token" });
    }
  });

  app.get("/api/campaigns/:campaignId/tokens", requireAuth, async (req, res) => {
    try {
      const sceneId = req.query.sceneId as string | undefined;
      let tokensList;
      
      if (sceneId) {
        tokensList = await storage.getSceneTokens(sceneId);
      } else {
        tokensList = await storage.getCampaignTokens(req.params.campaignId);
      }
      
      res.json(tokensList);
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
      
      // Broadcast token update to all campaign members
      if (token.campaignId) {
        broadcastToCampaign(token.campaignId, {
          type: "token_updated",
          token
        });
      }
      
      res.json(token);
    } catch (err) {
      res.status(400).json({ error: "Failed to update token" });
    }
  });

  app.delete("/api/tokens/:id", requireAuth, async (req, res) => {
    try {
      // Get token before deleting to get campaignId
      const token = await storage.getToken(req.params.id);
      const campaignId = token?.campaignId;
      
      await storage.deleteToken(req.params.id);
      
      // Broadcast token deletion to all campaign members
      if (campaignId) {
        broadcastToCampaign(campaignId, {
          type: "token_deleted",
          tokenId: req.params.id
        });
      }
      
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

      broadcastToCampaign(req.params.campaignId, {
        type: "scene_created",
        scene
      });

      res.json(scene);
    } catch (err) {
      res.status(400).json({ error: "Failed to create scene" });
    }
  });

  app.get("/api/campaigns/:campaignId/scenes", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const scenes = await storage.getCampaignScenes(req.params.campaignId);
      
      // GMs can see all scenes, players only see active scene
      if (campaign.gmUserId !== req.session.userId) {
        const activeScenes = scenes.filter(s => s.id === campaign.activeSceneId);
        return res.json(activeScenes);
      }
      
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
      
      // Check if user is GM or if scene is the active scene
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Players can only view the active scene
      const isGM = campaign.gmUserId === req.session.userId;
      const isActiveScene = campaign.activeSceneId === scene.id;
      
      if (!isGM && !isActiveScene) {
        return res.status(403).json({ error: "Only the GM can view non-active scenes" });
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
      
      // Broadcast scene update to all campaign members
      broadcastToCampaign(scene.campaignId, {
        type: "scene_updated",
        scene: updatedScene
      });
      
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

      const campaignId = scene.campaignId;
      await storage.deleteScene(req.params.sceneId);
      
      // Broadcast scene deletion to all campaign members
      broadcastToCampaign(campaignId, {
        type: "scene_deleted",
        sceneId: req.params.sceneId
      });
      
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
      
      // Broadcast active scene change to all campaign members
      broadcastToCampaign(req.params.campaignId, {
        type: "active_scene_changed",
        sceneId,
        scene
      });
      
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to set active scene" });
    }
  });

  // Campaign Species routes (GM-managed species for the campaign)
  app.get("/api/campaigns/:campaignId/species", requireAuth, async (req, res) => {
    try {
      const species = await storage.getCampaignSpecies(req.params.campaignId);
      res.json(species);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch campaign species" });
    }
  });

  app.post("/api/campaigns/:campaignId/species", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can create campaign species
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can create campaign species" });
      }

      const species = await storage.createCampaignSpecies({
        ...req.body,
        campaignId: req.params.campaignId
      });
      res.json(species);
    } catch (err) {
      res.status(400).json({ error: "Failed to create campaign species" });
    }
  });

  app.patch("/api/campaigns/:campaignId/species/:speciesId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can update campaign species
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can update campaign species" });
      }

      // Verify species belongs to this campaign
      const species = await storage.getCampaignSpeciesById(req.params.speciesId);
      if (!species || species.campaignId !== req.params.campaignId) {
        return res.status(404).json({ error: "Species not found in this campaign" });
      }

      const updated = await storage.updateCampaignSpecies(req.params.speciesId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update campaign species" });
    }
  });

  app.delete("/api/campaigns/:campaignId/species/:speciesId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only GM can delete campaign species
      if (campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only the GM can delete campaign species" });
      }

      // Verify species belongs to this campaign
      const species = await storage.getCampaignSpeciesById(req.params.speciesId);
      if (!species || species.campaignId !== req.params.campaignId) {
        return res.status(404).json({ error: "Species not found in this campaign" });
      }

      await storage.deleteCampaignSpecies(req.params.speciesId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete campaign species" });
    }
  });

  // Character Folder routes (for organizing characters in campaigns)
  app.get("/api/campaigns/:campaignId/folders", requireAuth, async (req, res) => {
    try {
      const folders = await storage.getCampaignFolders(req.params.campaignId);
      res.json(folders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character folders" });
    }
  });

  app.post("/api/campaigns/:campaignId/folders", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // GMs can create folders
      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can create character folders" });
      }

      const { name, sortOrder } = req.body;
      const folder = await storage.createCharacterFolder({
        campaignId: req.params.campaignId,
        name: name || "New Folder",
        sortOrder: sortOrder || 0
      });
      res.json(folder);
    } catch (err) {
      res.status(400).json({ error: "Failed to create character folder" });
    }
  });

  app.patch("/api/campaigns/:campaignId/folders/:folderId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // GMs can update folders
      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can update character folders" });
      }

      // Verify folder belongs to this campaign
      const folder = await storage.getCharacterFolder(req.params.folderId);
      if (!folder || folder.campaignId !== req.params.campaignId) {
        return res.status(404).json({ error: "Folder not found in this campaign" });
      }

      const updated = await storage.updateCharacterFolder(req.params.folderId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character folder" });
    }
  });

  app.delete("/api/campaigns/:campaignId/folders/:folderId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // GMs can delete folders
      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can delete character folders" });
      }

      // Verify folder belongs to this campaign
      const folder = await storage.getCharacterFolder(req.params.folderId);
      if (!folder || folder.campaignId !== req.params.campaignId) {
        return res.status(404).json({ error: "Folder not found in this campaign" });
      }

      await storage.deleteCharacterFolder(req.params.folderId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete character folder" });
    }
  });

  // Move character to a folder
  app.patch("/api/characters/:characterId/folder", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      // GMs can move characters to folders
      const isGM = await storage.isGM(req.session.userId!, character.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can organize characters into folders" });
      }

      const { folderId } = req.body;
      
      // If folderId provided, verify it belongs to the same campaign
      if (folderId) {
        const folder = await storage.getCharacterFolder(folderId);
        if (!folder || folder.campaignId !== character.campaignId) {
          return res.status(404).json({ error: "Folder not found in this campaign" });
        }
      }

      const updated = await storage.updateCharacter(req.params.characterId, { folderId: folderId || null });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to move character to folder" });
    }
  });

  // Scene Folder routes
  app.get("/api/campaigns/:campaignId/scene-folders", requireAuth, async (req, res) => {
    try {
      const folders = await storage.getSceneFolders(req.params.campaignId);
      res.json(folders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch scene folders" });
    }
  });

  app.post("/api/campaigns/:campaignId/scene-folders", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // GMs can create scene folders
      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can create scene folders" });
      }

      const { name, sortOrder } = req.body;
      const folder = await storage.createSceneFolder({
        campaignId: req.params.campaignId,
        name: name || "New Folder",
        sortOrder: sortOrder || 0
      });
      res.json(folder);
    } catch (err) {
      res.status(400).json({ error: "Failed to create scene folder" });
    }
  });

  app.patch("/api/campaigns/:campaignId/scene-folders/:folderId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // GMs can update scene folders
      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can update scene folders" });
      }

      // Verify folder belongs to this campaign
      const folder = await storage.getSceneFolder(req.params.folderId);
      if (!folder || folder.campaignId !== req.params.campaignId) {
        return res.status(404).json({ error: "Scene folder not found in this campaign" });
      }

      const updated = await storage.updateSceneFolder(req.params.folderId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update scene folder" });
    }
  });

  app.delete("/api/campaigns/:campaignId/scene-folders/:folderId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // GMs can delete scene folders
      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can delete scene folders" });
      }

      // Verify folder belongs to this campaign
      const folder = await storage.getSceneFolder(req.params.folderId);
      if (!folder || folder.campaignId !== req.params.campaignId) {
        return res.status(404).json({ error: "Scene folder not found in this campaign" });
      }

      await storage.deleteSceneFolder(req.params.folderId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete scene folder" });
    }
  });

  // Move scene to a folder
  app.patch("/api/scenes/:sceneId/folder", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }

      // GMs can move scenes to folders
      const isGM = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can organize scenes into folders" });
      }

      const { folderId } = req.body;
      
      // If folderId provided, verify it belongs to the same campaign
      if (folderId) {
        const folder = await storage.getSceneFolder(folderId);
        if (!folder || folder.campaignId !== scene.campaignId) {
          return res.status(404).json({ error: "Scene folder not found in this campaign" });
        }
      }

      const updated = await storage.updateScene(req.params.sceneId, { folderId: folderId || null });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to move scene to folder" });
    }
  });

  // Set active scene for campaign (what players see)
  app.patch("/api/campaigns/:campaignId/active-scene", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isGM = await storage.isGM(req.session.userId!, req.params.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can set the active scene" });
      }

      const { sceneId } = req.body;
      
      // If sceneId provided, verify it belongs to this campaign
      if (sceneId) {
        const scene = await storage.getScene(sceneId);
        if (!scene || scene.campaignId !== req.params.campaignId) {
          return res.status(404).json({ error: "Scene not found in this campaign" });
        }
      }

      const updated = await storage.updateCampaign(req.params.campaignId, { activeSceneId: sceneId || null });
      
      // Broadcast to WebSocket clients that the active scene has changed
      broadcastToCampaign(req.params.campaignId, {
        type: 'activeSceneChanged',
        sceneId: sceneId || null
      });
      
      res.json(updated);
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

  // Public system species route (for character creation)
  app.get("/api/species", requireAuth, async (req, res) => {
    try {
      const systemName = req.query.system as string || "Arcana Adventure";
      const species = await storage.getSystemSpecies(systemName);
      res.json(species);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch species" });
    }
  });

  // ==================== FEAT TEMPLATE ROUTES ====================

  // Get all feat templates (admin)
  app.get("/api/admin/feat-templates", requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getFeatTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat templates" });
    }
  });

  // Get a single feat template
  app.get("/api/admin/feat-templates/:id", requireAdmin, async (req, res) => {
    try {
      const template = await storage.getFeatTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Feat template not found" });
      }
      res.json(template);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat template" });
    }
  });

  // Create a new feat template
  app.post("/api/admin/feat-templates", requireAdmin, async (req, res) => {
    try {
      const template = await storage.createFeatTemplate(req.body);
      res.json(template);
    } catch (err) {
      res.status(400).json({ error: "Failed to create feat template" });
    }
  });

  // Update a feat template
  app.patch("/api/admin/feat-templates/:id", requireAdmin, async (req, res) => {
    try {
      const template = await storage.getFeatTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Feat template not found" });
      }
      const updated = await storage.updateFeatTemplate(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update feat template" });
    }
  });

  // Delete a feat template
  app.delete("/api/admin/feat-templates/:id", requireAdmin, async (req, res) => {
    try {
      const template = await storage.getFeatTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Feat template not found" });
      }
      await storage.deleteFeatTemplate(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete feat template" });
    }
  });

  // ==================== FEAT TREE ROUTES ====================

  // Get all feat trees (admin)
  app.get("/api/admin/feat-trees", requireAdmin, async (req, res) => {
    try {
      const trees = await storage.getFeatTrees();
      res.json(trees);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat trees" });
    }
  });

  // Get a single feat tree with its feats and connections
  app.get("/api/admin/feat-trees/:id", requireAdmin, async (req, res) => {
    try {
      const tree = await storage.getFeatTree(req.params.id);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      const [featsData, connections] = await Promise.all([
        storage.getFeats(req.params.id),
        storage.getFeatConnections(req.params.id)
      ]);
      res.json({ tree, feats: featsData, connections });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat tree" });
    }
  });

  // Create a new feat tree
  app.post("/api/admin/feat-trees", requireAdmin, async (req, res) => {
    try {
      const tree = await storage.createFeatTree(req.body);
      res.json(tree);
    } catch (err) {
      res.status(400).json({ error: "Failed to create feat tree" });
    }
  });

  // Update a feat tree
  app.patch("/api/admin/feat-trees/:id", requireAdmin, async (req, res) => {
    try {
      const tree = await storage.getFeatTree(req.params.id);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      const updated = await storage.updateFeatTree(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update feat tree" });
    }
  });

  // Delete a feat tree
  app.delete("/api/admin/feat-trees/:id", requireAdmin, async (req, res) => {
    try {
      const tree = await storage.getFeatTree(req.params.id);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      await storage.deleteFeatTree(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete feat tree" });
    }
  });

  // Create a feat within a tree
  app.post("/api/admin/feat-trees/:treeId/feats", requireAdmin, async (req, res) => {
    try {
      const tree = await storage.getFeatTree(req.params.treeId);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      const feat = await storage.createFeat({ ...req.body, treeId: req.params.treeId });
      
      // Auto-save to library: create a template if one doesn't exist with this name
      try {
        const existingTemplates = await storage.getFeatTemplates();
        const existingTemplate = existingTemplates.find(t => t.name === feat.name);
        if (!existingTemplate && feat.name) {
          // Create template from feat (without grid/tree-specific data)
          await storage.createFeatTemplate({
            name: feat.name,
            description: feat.description || '',
            icon: feat.icon || '',
            tier: feat.tier || 1,
            cost: feat.cost || 1,
            effects: feat.effects || [],
          });
        }
      } catch (templateErr) {
        // Template creation failure shouldn't fail the feat creation
        console.log("Auto-template creation skipped:", templateErr);
      }
      
      res.json(feat);
    } catch (err) {
      res.status(400).json({ error: "Failed to create feat" });
    }
  });

  // Update a feat
  app.patch("/api/admin/feats/:id", requireAdmin, async (req, res) => {
    try {
      const feat = await storage.getFeat(req.params.id);
      if (!feat) {
        return res.status(404).json({ error: "Feat not found" });
      }
      const updated = await storage.updateFeat(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update feat" });
    }
  });

  // Delete a feat
  app.delete("/api/admin/feats/:id", requireAdmin, async (req, res) => {
    try {
      const feat = await storage.getFeat(req.params.id);
      if (!feat) {
        return res.status(404).json({ error: "Feat not found" });
      }
      // Delete connections first, then the feat
      await storage.deleteFeatConnectionsByFeat(req.params.id);
      await storage.deleteFeat(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete feat" });
    }
  });

  // Create a connection between feats
  app.post("/api/admin/feat-trees/:treeId/connections", requireAdmin, async (req, res) => {
    try {
      const tree = await storage.getFeatTree(req.params.treeId);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      const connection = await storage.createFeatConnection({ 
        ...req.body, 
        treeId: req.params.treeId 
      });
      res.json(connection);
    } catch (err) {
      res.status(400).json({ error: "Failed to create connection" });
    }
  });

  // Delete a connection
  app.delete("/api/admin/feat-connections/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteFeatConnection(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete connection" });
    }
  });

  // Public feat tree route (for character sheet)
  app.get("/api/feat-trees", requireAuth, async (req, res) => {
    try {
      const trees = await storage.getFeatTrees();
      res.json(trees);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat trees" });
    }
  });

  // Get feat tree by ID (public route for character sheet)
  app.get("/api/feat-trees/:id", requireAuth, async (req, res) => {
    try {
      const tree = await storage.getFeatTree(req.params.id);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      const [featsData, connections] = await Promise.all([
        storage.getFeats(req.params.id),
        storage.getFeatConnections(req.params.id)
      ]);
      res.json({ tree, feats: featsData, connections });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat tree" });
    }
  });

  // Get feat tree by name (for character sheet)
  app.get("/api/feat-trees/by-name/:name", requireAuth, async (req, res) => {
    try {
      const tree = await storage.getFeatTreeByName(req.params.name);
      if (!tree) {
        return res.status(404).json({ error: "Feat tree not found" });
      }
      const [featsData, connections] = await Promise.all([
        storage.getFeats(tree.id),
        storage.getFeatConnections(tree.id)
      ]);
      res.json({ tree, feats: featsData, connections });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feat tree" });
    }
  });

  // Character feat routes
  app.get("/api/characters/:id/feats", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      const charFeats = await storage.getCharacterFeats(req.params.id);
      res.json(charFeats);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character feats" });
    }
  });

  app.post("/api/characters/:id/feats/:featId", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // Check if user has permission to modify this character
      const isOwner = character.userId === req.session.userId;
      const campaign = await storage.getCampaign(character.campaignId);
      const isGM = campaign?.gmUserId === req.session.userId;
      
      if (!isOwner && !isGM) {
        return res.status(403).json({ error: "Not authorized to modify this character" });
      }
      
      const feat = await storage.getFeat(req.params.featId);
      if (!feat) {
        return res.status(404).json({ error: "Feat not found" });
      }
      
      // Check if already unlocked
      const existingFeats = await storage.getCharacterFeats(req.params.id);
      const alreadyUnlocked = existingFeats.some(cf => cf.featId === req.params.featId);
      if (alreadyUnlocked) {
        return res.status(400).json({ error: "Feat already unlocked" });
      }
      
      // Check prerequisites: at least one prerequisite must be unlocked (unless no prerequisites)
      const connections = await storage.getFeatConnections(feat.treeId);
      const prereqConnections = connections.filter(c => c.toFeatId === req.params.featId);
      if (prereqConnections.length > 0) {
        const unlockedIds = new Set(existingFeats.map(cf => cf.featId));
        const hasPrereq = prereqConnections.some(c => unlockedIds.has(c.fromFeatId));
        if (!hasPrereq) {
          return res.status(400).json({ error: "Prerequisites not met" });
        }
      }
      
      // Validate feat points: 2 base + level + (2 × floor(level/3)) = 3 points at level 1
      // Every level: +1 point. Every level divisible by 3: +2 additional points.
      const level = character.level || 1;
      const totalFeatPoints = 2 + level + (2 * Math.floor(level / 3));
      
      // Get feat details for each to sum up spent points
      let spentPoints = 0;
      for (const cf of existingFeats) {
        const f = await storage.getFeat(cf.featId);
        if (f) {
          spentPoints += f.cost ?? 0;
        }
      }
      
      const featCost = feat.cost ?? 0;
      const availablePoints = totalFeatPoints - spentPoints;
      
      if (availablePoints < featCost) {
        return res.status(400).json({ 
          error: `Not enough feat points. Need ${featCost}, have ${availablePoints}` 
        });
      }
      
      const charFeat = await storage.unlockCharacterFeat(req.params.id, req.params.featId);
      
      // Apply feat effects: add traits, spells, skills to character when feat is unlocked
      if (feat.effects && Array.isArray(feat.effects)) {
        for (const effect of feat.effects as any[]) {
          // trait_grant - add trait to character
          if (effect.type === 'trait_grant' && effect.target) {
            try {
              const systemTrait = await storage.getSystemTrait(effect.target);
              if (systemTrait) {
                await storage.addCharacterTrait({
                  characterId: req.params.id,
                  systemTraitId: systemTrait.id,
                  name: systemTrait.name,
                  description: systemTrait.description || undefined,
                  parentAttribute: systemTrait.parentAttribute,
                  usesPerLongRest: systemTrait.usesPerLongRest,
                  usesPerShortRest: systemTrait.usesPerShortRest,
                  currentUses: 0,
                });
                console.log(`[feat_grant] Added trait "${systemTrait.name}" to character ${req.params.id}`);
              }
            } catch (traitErr) {
              console.error('[trait_grant] Error adding trait from feat:', traitErr);
            }
          }
          
          // spell_grant - add spell to character
          if (effect.type === 'spell_grant' && effect.target) {
            try {
              const systemSpell = await storage.getSystemSpell(effect.target);
              if (systemSpell) {
                await storage.createSpell({
                  characterId: req.params.id,
                  name: systemSpell.name,
                  description: systemSpell.description || undefined,
                  image: systemSpell.icon || undefined,
                  damageDice: systemSpell.damageDice || undefined,
                  healingDice: systemSpell.healingDice || undefined,
                  damageType: systemSpell.damageType || undefined,
                  range: systemSpell.range || undefined,
                  rangeNum: systemSpell.rangeNum || 30,
                  aoe: systemSpell.aoe || undefined,
                  castingTime: systemSpell.castingTime || undefined,
                  duration: systemSpell.duration || undefined,
                  level: systemSpell.level || 0,
                  school: systemSpell.school || undefined,
                  mod: systemSpell.mod || 0,
                  attribute: systemSpell.attribute || undefined,
                  energyCost: systemSpell.energyCost || 1,
                  isAoe: systemSpell.isAoe || false,
                  aoeRange: systemSpell.aoeRange || undefined,
                  aoeShape: systemSpell.aoeShape || undefined,
                  isAttack: systemSpell.isAttack ?? true,
                  gainEnergy: systemSpell.gainEnergy || false,
                  isEquipped: false,
                });
                console.log(`[feat_grant] Added spell "${systemSpell.name}" to character ${req.params.id}`);
              }
            } catch (spellErr) {
              console.error('[spell_grant] Error adding spell from feat:', spellErr);
            }
          }
          
          // skill_grant - add custom skill to character
          if (effect.type === 'skill_grant' && effect.target) {
            try {
              const systemSkill = await storage.getSystemSkill(effect.target);
              if (systemSkill) {
                await storage.addCharacterCustomSkill({
                  characterId: req.params.id,
                  systemSkillId: systemSkill.id,
                  name: systemSkill.name,
                  parentAttribute: systemSkill.parentAttribute,
                  value: 0,
                });
                console.log(`[feat_grant] Added skill "${systemSkill.name}" to character ${req.params.id}`);
              }
            } catch (skillErr) {
              console.error('[skill_grant] Error adding skill from feat:', skillErr);
            }
          }
        }
      }
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "feat_unlocked",
          characterId: req.params.id,
          featId: req.params.featId
        });
      }
      
      res.json(charFeat);
    } catch (err) {
      res.status(400).json({ error: "Failed to unlock feat" });
    }
  });

  app.delete("/api/characters/:id/feats/:featId", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // Check if user has permission to modify this character
      const isOwner = character.userId === req.session.userId;
      const campaign = await storage.getCampaign(character.campaignId);
      const isGM = campaign?.gmUserId === req.session.userId;
      
      if (!isOwner && !isGM) {
        return res.status(403).json({ error: "Not authorized to modify this character" });
      }
      
      await storage.removeCharacterFeat(req.params.id, req.params.featId);
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "feat_removed",
          characterId: req.params.id,
          featId: req.params.featId
        });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to remove feat" });
    }
  });

  // System Spell routes (admin)
  app.get("/api/admin/spells", requireAdmin, async (req, res) => {
    try {
      const spellList = await storage.getSystemSpells();
      res.json(spellList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spells" });
    }
  });

  app.get("/api/admin/spells/:id", requireAdmin, async (req, res) => {
    try {
      const spell = await storage.getSystemSpell(req.params.id);
      if (!spell) {
        return res.status(404).json({ error: "Spell not found" });
      }
      res.json(spell);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spell" });
    }
  });

  app.post("/api/admin/spells", requireAdmin, async (req, res) => {
    try {
      const spell = await storage.createSystemSpell(req.body);
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to create spell" });
    }
  });

  app.patch("/api/admin/spells/:id", requireAdmin, async (req, res) => {
    try {
      const spell = await storage.updateSystemSpell(req.params.id, req.body);
      if (!spell) {
        return res.status(404).json({ error: "Spell not found" });
      }
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to update spell" });
    }
  });

  app.delete("/api/admin/spells/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSystemSpell(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete spell" });
    }
  });

  // System Skills routes (admin)
  app.get("/api/admin/skills", requireAdmin, async (req, res) => {
    try {
      const skills = await storage.getSystemSkills();
      res.json(skills);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system skills" });
    }
  });

  app.get("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    try {
      const skill = await storage.getSystemSkill(req.params.id);
      if (!skill) {
        return res.status(404).json({ error: "Skill not found" });
      }
      res.json(skill);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch skill" });
    }
  });

  app.post("/api/admin/skills", requireAdmin, async (req, res) => {
    try {
      const skill = await storage.createSystemSkill(req.body);
      res.json(skill);
    } catch (err) {
      res.status(400).json({ error: "Failed to create skill" });
    }
  });

  app.patch("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    try {
      const skill = await storage.updateSystemSkill(req.params.id, req.body);
      if (!skill) {
        return res.status(404).json({ error: "Skill not found" });
      }
      res.json(skill);
    } catch (err) {
      res.status(400).json({ error: "Failed to update skill" });
    }
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSystemSkill(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete skill" });
    }
  });

  // Character Template routes (admin)
  app.get("/api/admin/character-templates", requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getCharacterTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character templates" });
    }
  });

  app.get("/api/admin/character-templates/:id", requireAdmin, async (req, res) => {
    try {
      const template = await storage.getCharacterTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Character template not found" });
      }
      res.json(template);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character template" });
    }
  });

  app.post("/api/admin/character-templates", requireAdmin, async (req, res) => {
    try {
      const template = await storage.createCharacterTemplate(req.body);
      res.json(template);
    } catch (err) {
      res.status(400).json({ error: "Failed to create character template" });
    }
  });

  app.patch("/api/admin/character-templates/:id", requireAdmin, async (req, res) => {
    try {
      const template = await storage.updateCharacterTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ error: "Character template not found" });
      }
      res.json(template);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character template" });
    }
  });

  app.delete("/api/admin/character-templates/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteCharacterTemplate(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete character template" });
    }
  });

  // Public character templates route (for adding to campaigns)
  app.get("/api/character-templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getCharacterTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character templates" });
    }
  });

  // Copy character template to campaign
  app.post("/api/campaigns/:campaignId/characters/from-template/:templateId", requireAuth, async (req, res) => {
    try {
      const { campaignId, templateId } = req.params;
      const userId = req.session.userId!;
      
      // Verify user is GM of the campaign
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const isGm = await storage.isGM(userId, campaignId);
      if (!isGm) {
        return res.status(403).json({ error: "Only GMs can add characters from templates" });
      }
      
      const character = await storage.copyTemplateToCompany(templateId, campaignId, userId);
      
      // Broadcast to campaign
      broadcastToCampaign(campaignId, {
        type: "character_added",
        character
      });
      
      res.json(character);
    } catch (err) {
      console.error('Error copying template to campaign:', err);
      res.status(400).json({ error: "Failed to add character from template" });
    }
  });

  // Public system skills route (for character sheet)
  app.get("/api/skills", requireAuth, async (req, res) => {
    try {
      const skills = await storage.getSystemSkills();
      res.json(skills);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch skills" });
    }
  });

  // Character custom skills routes
  app.get("/api/characters/:characterId/custom-skills", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      const customSkills = await storage.getCharacterCustomSkills(req.params.characterId);
      res.json(customSkills);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character custom skills" });
    }
  });

  app.post("/api/characters/:characterId/custom-skills", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      const skill = await storage.addCharacterCustomSkill({
        ...req.body,
        characterId: req.params.characterId
      });
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "custom_skill_added",
          characterId: req.params.characterId,
          skill
        });
      }
      
      res.json(skill);
    } catch (err) {
      res.status(400).json({ error: "Failed to add custom skill" });
    }
  });

  app.patch("/api/characters/:characterId/custom-skills/:skillId", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      const skill = await storage.updateCharacterCustomSkill(req.params.skillId, req.body);
      if (!skill) {
        return res.status(404).json({ error: "Skill not found" });
      }
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "custom_skill_updated",
          characterId: req.params.characterId,
          skillId: req.params.skillId,
          skill
        });
      }
      
      res.json(skill);
    } catch (err) {
      res.status(400).json({ error: "Failed to update custom skill" });
    }
  });

  app.delete("/api/characters/:characterId/custom-skills/:skillId", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      await storage.removeCharacterCustomSkill(req.params.skillId);
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "custom_skill_removed",
          characterId: req.params.characterId,
          skillId: req.params.skillId
        });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to remove custom skill" });
    }
  });

  // System Traits routes (admin)
  app.get("/api/admin/traits", requireAdmin, async (req, res) => {
    try {
      const traits = await storage.getSystemTraits();
      res.json(traits);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system traits" });
    }
  });

  app.get("/api/admin/traits/:id", requireAdmin, async (req, res) => {
    try {
      const trait = await storage.getSystemTrait(req.params.id);
      if (!trait) {
        return res.status(404).json({ error: "Trait not found" });
      }
      res.json(trait);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch trait" });
    }
  });

  app.post("/api/admin/traits", requireAdmin, async (req, res) => {
    try {
      const trait = await storage.createSystemTrait(req.body);
      res.json(trait);
    } catch (err) {
      res.status(400).json({ error: "Failed to create trait" });
    }
  });

  app.put("/api/admin/traits/:id", requireAdmin, async (req, res) => {
    try {
      const trait = await storage.updateSystemTrait(req.params.id, req.body);
      if (!trait) {
        return res.status(404).json({ error: "Trait not found" });
      }
      res.json(trait);
    } catch (err) {
      res.status(400).json({ error: "Failed to update trait" });
    }
  });

  app.delete("/api/admin/traits/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSystemTrait(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete trait" });
    }
  });

  // Public system traits route (for character sheet)
  app.get("/api/traits", requireAuth, async (req, res) => {
    try {
      const traits = await storage.getSystemTraits();
      res.json(traits);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch traits" });
    }
  });

  // Character traits routes
  app.get("/api/characters/:characterId/traits", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      const traits = await storage.getCharacterTraits(req.params.characterId);
      res.json(traits);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character traits" });
    }
  });

  app.post("/api/characters/:characterId/traits", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      const trait = await storage.addCharacterTrait({
        ...req.body,
        characterId: req.params.characterId
      });
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "trait_added",
          characterId: req.params.characterId,
          trait
        });
      }
      
      res.json(trait);
    } catch (err) {
      res.status(400).json({ error: "Failed to add trait" });
    }
  });

  app.patch("/api/characters/:characterId/traits/:traitId", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      const trait = await storage.updateCharacterTrait(req.params.traitId, req.body);
      if (!trait) {
        return res.status(404).json({ error: "Trait not found" });
      }
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "trait_updated",
          characterId: req.params.characterId,
          traitId: req.params.traitId,
          trait
        });
      }
      
      res.json(trait);
    } catch (err) {
      res.status(400).json({ error: "Failed to update trait" });
    }
  });

  app.delete("/api/characters/:characterId/traits/:traitId", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      await storage.removeCharacterTrait(req.params.traitId);
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "trait_removed",
          characterId: req.params.characterId,
          traitId: req.params.traitId
        });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to remove trait" });
    }
  });

  // Use trait route (decrements remaining uses)
  app.post("/api/characters/:characterId/traits/:traitId/use", requireAuth, async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.characterId);
      const trait = await storage.getCharacterTrait(req.params.traitId);
      if (!trait) {
        return res.status(404).json({ error: "Trait not found" });
      }
      if (trait.characterId !== req.params.characterId) {
        return res.status(400).json({ error: "Trait does not belong to this character" });
      }
      if (trait.currentUses >= trait.usesPerLongRest) {
        return res.status(400).json({ error: "No uses remaining" });
      }
      const updated = await storage.updateCharacterTrait(req.params.traitId, {
        currentUses: trait.currentUses + 1
      });
      
      if (character?.campaignId) {
        broadcastToCampaign(character.campaignId, {
          type: "trait_used",
          characterId: req.params.characterId,
          traitId: req.params.traitId,
          trait: updated
        });
      }
      
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to use trait" });
    }
  });

  // Public spell routes (for character sheet and feat effects)
  app.get("/api/spells", requireAuth, async (req, res) => {
    try {
      const spellList = await storage.getSystemSpells();
      res.json(spellList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spells" });
    }
  });

  // Public system items route (for feat effects item picker)
  app.get("/api/system-items", requireAuth, async (req, res) => {
    try {
      const itemList = await storage.getSystemItems();
      res.json(itemList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system items" });
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
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "item_created",
          characterId: req.params.characterId,
          item
        });
      }
      
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

      if (!currentItem.characterId) {
        return res.status(400).json({ error: "Item has no associated character" });
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

      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "item_updated",
          characterId: currentItem.characterId,
          item: updatedItem
        });
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

      if (!item.characterId) {
        return res.status(400).json({ error: "Item has no associated character" });
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

      if (!item.characterId) {
        return res.status(400).json({ error: "Item has no associated character" });
      }
      
      const access = await checkCharacterAccess(item.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      if (!access.allowed) {
        return res.status(403).json({ error: "You don't have permission to delete this character's items" });
      }

      await storage.deleteItem(req.params.id);
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "item_deleted",
          characterId: item.characterId,
          itemId: req.params.id
        });
      }
      
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

  // ======== GOOGLE DRIVE IMAGE LIBRARY ROUTES ========
  
  // List folders in Google Drive
  app.get("/api/drive/folders", requireAuth, async (req, res) => {
    try {
      const parentId = req.query.parentId as string | undefined;
      const folders = await listFolders(parentId);
      res.json(folders);
    } catch (e) {
      console.error("Failed to list Drive folders:", e);
      res.status(500).json({ error: "Failed to list folders from Google Drive" });
    }
  });
  
  // List images in a Google Drive folder
  app.get("/api/drive/images", requireAuth, async (req, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const images = await listImages(folderId);
      res.json(images);
    } catch (e) {
      console.error("Failed to list Drive images:", e);
      res.status(500).json({ error: "Failed to list images from Google Drive" });
    }
  });
  
  // Get a specific image as base64
  app.get("/api/drive/image/:fileId", requireAuth, async (req, res) => {
    try {
      const base64Data = await getImageBase64(req.params.fileId);
      res.json({ data: base64Data });
    } catch (e) {
      console.error("Failed to get Drive image:", e);
      res.status(500).json({ error: "Failed to get image from Google Drive" });
    }
  });
  
  // Search images in Google Drive
  app.get("/api/drive/search", requireAuth, async (req, res) => {
    try {
      const searchTerm = req.query.q as string;
      const folderId = req.query.folderId as string | undefined;
      
      if (!searchTerm) {
        return res.status(400).json({ error: "Search term required" });
      }
      
      const results = await searchImages(searchTerm, folderId);
      res.json(results);
    } catch (e) {
      console.error("Failed to search Drive images:", e);
      res.status(500).json({ error: "Failed to search images in Google Drive" });
    }
  });

  // ======== PROFILE & FRIENDS ROUTES ========

  // Helper to sanitize user data (never return password or email)
  const sanitizeUser = (user: any) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
  });

  // Get current user's profile
  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (e) {
      console.error("Failed to get profile:", e);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // Update profile (name, bio)
  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const { name, bio } = req.body;
      const updated = await storage.updateUserProfile(req.session.userId!, { name, bio });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(updated));
    } catch (e) {
      console.error("Failed to update profile:", e);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Update avatar (accepts base64 image in body)
  app.put("/api/profile/avatar", requireAuth, async (req, res) => {
    try {
      const { avatarUrl } = req.body;
      if (!avatarUrl) {
        return res.status(400).json({ error: "avatarUrl is required" });
      }
      const updated = await storage.updateUserProfile(req.session.userId!, { avatarUrl });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(updated));
    } catch (e) {
      console.error("Failed to update avatar:", e);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  // Send friend request
  app.post("/api/friends/requests", requireAuth, async (req, res) => {
    try {
      const { recipientUsername, message } = req.body;
      if (!recipientUsername) {
        return res.status(400).json({ error: "recipientUsername is required" });
      }

      const recipient = await storage.getUserByUsername(recipientUsername);
      if (!recipient) {
        return res.status(404).json({ error: "User not found" });
      }

      if (recipient.id === req.session.userId) {
        return res.status(400).json({ error: "Cannot send friend request to yourself" });
      }

      // Check if already friends
      const alreadyFriends = await storage.areFriends(req.session.userId!, recipient.id);
      if (alreadyFriends) {
        return res.status(400).json({ error: "You are already friends with this user" });
      }

      // Check for existing pending request in either direction
      const existingIncoming = await storage.getPendingFriendRequests(req.session.userId!);
      const existingOutgoing = await storage.getSentFriendRequests(req.session.userId!);
      
      if (existingOutgoing.some(r => r.recipientId === recipient.id)) {
        return res.status(400).json({ error: "Friend request already sent to this user" });
      }
      if (existingIncoming.some(r => r.senderId === recipient.id)) {
        return res.status(400).json({ error: "This user has already sent you a friend request" });
      }

      const request = await storage.createFriendRequest(req.session.userId!, recipient.id, message);
      res.status(201).json(request);
    } catch (e) {
      console.error("Failed to send friend request:", e);
      res.status(500).json({ error: "Failed to send friend request" });
    }
  });

  // Get incoming pending requests
  app.get("/api/friends/requests/incoming", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getPendingFriendRequests(req.session.userId!);
      // Enrich with sender info
      const enrichedRequests = await Promise.all(requests.map(async (request) => {
        const sender = await storage.getUser(request.senderId);
        return {
          ...request,
          sender: sender ? sanitizeUser(sender) : null,
        };
      }));
      res.json(enrichedRequests);
    } catch (e) {
      console.error("Failed to get incoming friend requests:", e);
      res.status(500).json({ error: "Failed to get incoming friend requests" });
    }
  });

  // Get outgoing pending requests
  app.get("/api/friends/requests/outgoing", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getSentFriendRequests(req.session.userId!);
      // Enrich with recipient info
      const enrichedRequests = await Promise.all(requests.map(async (request) => {
        const recipient = await storage.getUser(request.recipientId);
        return {
          ...request,
          recipient: recipient ? sanitizeUser(recipient) : null,
        };
      }));
      res.json(enrichedRequests);
    } catch (e) {
      console.error("Failed to get outgoing friend requests:", e);
      res.status(500).json({ error: "Failed to get outgoing friend requests" });
    }
  });

  // Accept a friend request
  app.post("/api/friends/requests/:id/accept", requireAuth, async (req, res) => {
    try {
      const request = await storage.getFriendRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.recipientId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to accept this request" });
      }

      await storage.respondToFriendRequest(req.params.id, true);
      res.json({ success: true });
    } catch (e: any) {
      console.error("Failed to accept friend request:", e);
      res.status(500).json({ error: e.message || "Failed to accept friend request" });
    }
  });

  // Decline a friend request
  app.post("/api/friends/requests/:id/decline", requireAuth, async (req, res) => {
    try {
      const request = await storage.getFriendRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.recipientId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to decline this request" });
      }

      await storage.respondToFriendRequest(req.params.id, false);
      res.json({ success: true });
    } catch (e: any) {
      console.error("Failed to decline friend request:", e);
      res.status(500).json({ error: e.message || "Failed to decline friend request" });
    }
  });

  // Cancel a sent request
  app.delete("/api/friends/requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await storage.getFriendRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (request.senderId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to cancel this request" });
      }

      await storage.deleteFriendRequest(req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to cancel friend request:", e);
      res.status(500).json({ error: "Failed to cancel friend request" });
    }
  });

  // Get all friends
  app.get("/api/friends", requireAuth, async (req, res) => {
    try {
      const friends = await storage.getFriends(req.session.userId!);
      res.json(friends.map(sanitizeUser));
    } catch (e) {
      console.error("Failed to get friends:", e);
      res.status(500).json({ error: "Failed to get friends" });
    }
  });

  // Remove a friend
  app.delete("/api/friends/:friendId", requireAuth, async (req, res) => {
    try {
      // Verify they are actually friends
      const areFriends = await storage.areFriends(req.session.userId!, req.params.friendId);
      if (!areFriends) {
        return res.status(404).json({ error: "Friendship not found" });
      }

      await storage.removeFriend(req.session.userId!, req.params.friendId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to remove friend:", e);
      res.status(500).json({ error: "Failed to remove friend" });
    }
  });

  // Search for user by exact username
  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const username = req.query.username as string;
      if (!username) {
        return res.status(400).json({ error: "username query parameter is required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(sanitizeUser(user));
    } catch (e) {
      console.error("Failed to search for user:", e);
      res.status(500).json({ error: "Failed to search for user" });
    }
  });

  // ============================================
  // ENTITY SEARCH (for note references)
  // ============================================

  app.get("/api/search/entities", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string || '';
      const type = req.query.type as string | undefined;
      
      const results = await storage.searchEntities(query, type, req.session.userId!);
      res.json(results);
    } catch (e) {
      console.error("Failed to search entities:", e);
      res.status(500).json({ error: "Failed to search entities" });
    }
  });

  // ============================================
  // NOTES SYSTEM ROUTES
  // ============================================

  // Note Folder endpoints
  app.get("/api/notes/folders", requireAuth, async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const folders = await storage.getUserNoteFolders(req.session.userId!, campaignId);
      res.json(folders);
    } catch (e) {
      console.error("Failed to get note folders:", e);
      res.status(500).json({ error: "Failed to get note folders" });
    }
  });

  app.post("/api/notes/folders", requireAuth, async (req, res) => {
    try {
      const folder = await storage.createNoteFolder({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(folder);
    } catch (e) {
      console.error("Failed to create note folder:", e);
      res.status(500).json({ error: "Failed to create note folder" });
    }
  });

  app.put("/api/notes/folders/:id", requireAuth, async (req, res) => {
    try {
      const folder = await storage.getNoteFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this folder" });
      }
      const updated = await storage.updateNoteFolder(req.params.id, req.body);
      res.json(updated);
    } catch (e) {
      console.error("Failed to update note folder:", e);
      res.status(500).json({ error: "Failed to update note folder" });
    }
  });

  app.delete("/api/notes/folders/:id", requireAuth, async (req, res) => {
    try {
      const folder = await storage.getNoteFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this folder" });
      }
      await storage.deleteNoteFolder(req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete note folder:", e);
      res.status(500).json({ error: "Failed to delete note folder" });
    }
  });

  // Note endpoints
  app.get("/api/notes", requireAuth, async (req, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const campaignId = req.query.campaignId as string | undefined;
      const notes = await storage.getUserNotes(req.session.userId!, folderId, campaignId);
      res.json(notes);
    } catch (e) {
      console.error("Failed to get notes:", e);
      res.status(500).json({ error: "Failed to get notes" });
    }
  });

  app.get("/api/notes/shared", requireAuth, async (req, res) => {
    try {
      const notes = await storage.getSharedNotes(req.session.userId!);
      res.json(notes);
    } catch (e) {
      console.error("Failed to get shared notes:", e);
      res.status(500).json({ error: "Failed to get shared notes" });
    }
  });

  app.get("/api/notes/search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }
      const notes = await storage.searchNotes(req.session.userId!, query);
      res.json(notes);
    } catch (e) {
      console.error("Failed to search notes:", e);
      res.status(500).json({ error: "Failed to search notes" });
    }
  });

  app.post("/api/notes", requireAuth, async (req, res) => {
    try {
      const note = await storage.createNote({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(note);
    } catch (e) {
      console.error("Failed to create note:", e);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.get("/api/notes/:id", requireAuth, async (req, res) => {
    try {
      const access = await storage.canAccessNote(req.session.userId!, req.params.id);
      if (!access.canAccess) {
        return res.status(403).json({ error: "Not authorized to view this note" });
      }
      const note = await storage.getNote(req.params.id);
      res.json(note);
    } catch (e) {
      console.error("Failed to get note:", e);
      res.status(500).json({ error: "Failed to get note" });
    }
  });

  app.put("/api/notes/:id", requireAuth, async (req, res) => {
    try {
      const access = await storage.canAccessNote(req.session.userId!, req.params.id);
      if (!access.canAccess) {
        return res.status(403).json({ error: "Not authorized to update this note" });
      }
      if (access.permission !== 'owner' && access.permission !== 'edit') {
        return res.status(403).json({ error: "Edit permission required" });
      }
      const updated = await storage.updateNote(req.params.id, req.body);
      res.json(updated);
    } catch (e) {
      console.error("Failed to update note:", e);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  app.delete("/api/notes/:id", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ error: "Only the owner can delete this note" });
      }
      await storage.deleteNote(req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete note:", e);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Note Reference endpoints
  app.get("/api/notes/:id/references", requireAuth, async (req, res) => {
    try {
      const access = await storage.canAccessNote(req.session.userId!, req.params.id);
      if (!access.canAccess) {
        return res.status(403).json({ error: "Not authorized to view this note" });
      }
      const references = await storage.getNoteReferences(req.params.id);
      res.json(references);
    } catch (e) {
      console.error("Failed to get note references:", e);
      res.status(500).json({ error: "Failed to get note references" });
    }
  });

  app.post("/api/notes/:id/references", requireAuth, async (req, res) => {
    try {
      const access = await storage.canAccessNote(req.session.userId!, req.params.id);
      if (!access.canAccess || (access.permission !== 'owner' && access.permission !== 'edit')) {
        return res.status(403).json({ error: "Edit permission required" });
      }
      const reference = await storage.createNoteReference({
        ...req.body,
        noteId: req.params.id,
      });
      res.status(201).json(reference);
    } catch (e) {
      console.error("Failed to create note reference:", e);
      res.status(500).json({ error: "Failed to create note reference" });
    }
  });

  app.delete("/api/notes/:id/references/:refId", requireAuth, async (req, res) => {
    try {
      const access = await storage.canAccessNote(req.session.userId!, req.params.id);
      if (!access.canAccess || (access.permission !== 'owner' && access.permission !== 'edit')) {
        return res.status(403).json({ error: "Edit permission required" });
      }
      await storage.deleteNoteReference(req.params.refId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete note reference:", e);
      res.status(500).json({ error: "Failed to delete note reference" });
    }
  });

  app.get("/api/backlinks", requireAuth, async (req, res) => {
    try {
      const entityType = req.query.entityType as string;
      const entityId = req.query.entityId as string;
      if (!entityType || !entityId) {
        return res.status(400).json({ error: "entityType and entityId are required" });
      }
      const backlinks = await storage.getBacklinks(entityType, entityId);
      res.json(backlinks);
    } catch (e) {
      console.error("Failed to get backlinks:", e);
      res.status(500).json({ error: "Failed to get backlinks" });
    }
  });

  // Note Share endpoints
  app.get("/api/notes/:id/shares", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ error: "Only the owner can view shares" });
      }
      const shares = await storage.getNoteShares(req.params.id);
      res.json(shares);
    } catch (e) {
      console.error("Failed to get note shares:", e);
      res.status(500).json({ error: "Failed to get note shares" });
    }
  });

  app.post("/api/notes/:id/shares", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ error: "Only the owner can share this note" });
      }
      const { friendId, permission } = req.body;
      if (!friendId) {
        return res.status(400).json({ error: "friendId is required" });
      }
      const areFriends = await storage.areFriends(req.session.userId!, friendId);
      if (!areFriends) {
        return res.status(400).json({ error: "Can only share with friends" });
      }
      const share = await storage.createNoteShare({
        noteId: req.params.id,
        ownerId: req.session.userId!,
        sharedWithId: friendId,
        permission: permission || 'view',
      });
      res.status(201).json(share);
    } catch (e) {
      console.error("Failed to share note:", e);
      res.status(500).json({ error: "Failed to share note" });
    }
  });

  app.put("/api/notes/:id/shares/:shareId", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ error: "Only the owner can update shares" });
      }
      const { permission } = req.body;
      if (!permission) {
        return res.status(400).json({ error: "permission is required" });
      }
      const updated = await storage.updateNoteShare(req.params.shareId, permission);
      res.json(updated);
    } catch (e) {
      console.error("Failed to update note share:", e);
      res.status(500).json({ error: "Failed to update note share" });
    }
  });

  app.delete("/api/notes/:id/shares/:shareId", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ error: "Only the owner can remove shares" });
      }
      await storage.deleteNoteShare(req.params.shareId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete note share:", e);
      res.status(500).json({ error: "Failed to delete note share" });
    }
  });

  return httpServer;
}
