import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertCampaignSchema, insertCharacterSchema, insertTokenSchema, insertChatMessageSchema, insertSceneSchema, insertHotbarSchema, insertItemSchema, insertSpellSchema, initiativeEntries, insertTokenEffectSchema, insertTokenActiveEffectSchema, rollEntries, insertRollEntrySchema, items, sceneVisionZones, insertEntitySchema, insertEntityLinkSchema, insertWorldMapSchema, insertWorldMapPinSchema, insertWorldCalendarSchema, insertWorldTimelineEventSchema, insertWorldTimelineSchema, insertWorldSchema, insertWorldCalendarSyncSchema, insertCampaignMapPinSchema, insertShopItemSchema, campaigns, characters } from "@shared/schema";
import bcrypt from "bcryptjs";
import { WebSocketServer } from "ws";
import { sendPasswordResetEmail } from "./email";
import crypto from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { createRollResult, createWebSocketDiceRollMessage, type RollRequest } from "./dice/serverRollHandler";
import { listFolders, listImages, getImageBase64, searchImages, getGoogleDriveStatus } from "./googleDrive";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.resolve(import.meta.dirname, '..', 'uploads', 'scene-backgrounds');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

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
  
  // Set to track ALL connected WebSocket clients (for global broadcasts like site updates)
  const allConnectedClients = new Set<any>();
  
  // Map to track note rooms for live collaborative editing
  // Each note room tracks: { clients: Set<WebSocket>, presence: Map<userId, { username, cursorPosition, lastActive }> }
  const noteRooms = new Map<string, { clients: Set<any>; presence: Map<string, { username: string; cursorPosition?: any; lastActive: number }> }>();
  
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
   * - User has explicit 'name', 'view', or 'edit' permission
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

      // Check explicit permission - name, view, or edit all grant at least basic access
      const accessLevel = permissionMap.get(userId);
      if (accessLevel === 'name' || accessLevel === 'view' || accessLevel === 'edit') {
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
   * broadcastToAllClients - Broadcast to ALL connected WebSocket clients
   * 
   * This function broadcasts messages to every connected client.
   * Used for admin notifications that should reach all users.
   */
  function broadcastToAllClients(message: any): void {
    const messageString = JSON.stringify(message);
    
    allConnectedClients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(messageString);
      }
    });
  }

  function sendToUser(userId: string, message: any): void {
    const messageString = JSON.stringify(message);
    allConnectedClients.forEach((client) => {
      if (client.readyState === 1 && (client as any).userId === userId) {
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
    
    // Add to global connected clients set for site-wide broadcasts
    allConnectedClients.add(ws);
    
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
          const incognitoMode = message.incognito === true;
          console.log(`[WebSocket] Processing join_campaign request from ${username} for campaign ${campaignId}${incognitoMode ? ' (INCOGNITO)' : ''}`);
          
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
          
          // Check if user is admin (for incognito access)
          const wsUser = await storage.getUser(authenticatedUserId);
          const isUserAdmin = wsUser ? (wsUser.isAdmin || ADMIN_EMAILS.includes(wsUser.email.toLowerCase())) : false;
          
          // Check if user is GM (owner)
          const isGM = campaign.gmUserId === authenticatedUserId;
          console.log(`[WebSocket] User ${username} isGM: ${isGM}, isAdmin: ${isUserAdmin}, gmUserId: ${campaign.gmUserId}, userId: ${authenticatedUserId}`);
          
          // Check if user is a member
          const membership = await storage.getCampaignMembership(authenticatedUserId, campaignId);
          console.log(`[WebSocket] User ${username} membership:`, membership);
          
          // Admin incognito mode: allow access without membership
          if (incognitoMode && isUserAdmin) {
            console.log(`[WebSocket] Admin ${username} accessing campaign ${campaignId} in INCOGNITO mode`);
            
            // Store campaign with GM role but mark as incognito
            (ws as any).campaigns.set(campaignId, { role: 'gm', incognito: true });
            
            // DO NOT add to room - incognito users should not be visible to others
            // and should not receive broadcasts from other users
            
            // Send confirmation with GM role and incognito flag
            const confirmationMsg = JSON.stringify({
              type: "joined_campaign",
              campaignId,
              role: 'gm',
              incognito: true
            });
            console.log(`[WebSocket] Sending incognito joined_campaign confirmation to ${username}:`, confirmationMsg);
            ws.send(confirmationMsg);
            
            console.log(`[WebSocket] Admin ${username} joined campaign ${campaignId} in INCOGNITO mode with GM access`);
            return;
          }
          
          if (!isGM && !membership) {
            console.log(`[WebSocket] User ${username} not authorized for campaign ${campaignId}`);
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authorized - You are not a member of this campaign"
            }));
            return;
          }
          
          // Store campaign with role in Map
          // Both owner (gmUserId) and assistant_gm get "gm" role for privileges
          const role = isGM ? "gm" : (membership?.role === 'assistant_gm' ? 'gm' : membership?.role || "player");
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
          
          // BROADCAST IMMEDIATELY for real-time responsiveness
          // Do this BEFORE any database operations to ensure instant feedback
          const room = campaignRooms.get(campaignId);
          if (room) {
            const broadcastMessage = JSON.stringify({
              type: "token_move",
              tokenId,
              x,
              y,
              snapToGrid,
              userId: authenticatedUserId
            });
            
            room.forEach((client) => {
              if (client.readyState === 1) { // OPEN
                client.send(broadcastMessage);
              }
            });
          }
          
          // Now do validation and database update asynchronously
          // Use IIFE to run validation/save without blocking
          (async () => {
            const userRole = userCampaign.role;
            
            // Fetch the token from database to verify ownership
            const token = await storage.getToken(tokenId);
            
            if (!token || token.campaignId !== campaignId) {
              // Send rollback to revert the move
              if (room) {
                const rollbackMessage = JSON.stringify({
                  type: "token_move_rollback",
                  tokenId,
                  message: "Invalid token for this campaign"
                });
                room.forEach((client) => {
                  if (client.readyState === 1) client.send(rollbackMessage);
                });
              }
              return;
            }
            
            // Store original position for potential rollback
            const originalX = token.x;
            const originalY = token.y;
            
            // Authorization: GM can move any token, players can move tokens they own or have edit access to
            if (userRole !== "gm") {
              // If token has a characterId, verify user owns it OR has edit permission
              if (token.characterId) {
                const character = await storage.getCharacter(token.characterId);
                if (!character) {
                  // Rollback
                  if (room) {
                    const rollbackMessage = JSON.stringify({
                      type: "token_move_rollback",
                      tokenId,
                      x: originalX,
                      y: originalY,
                      message: "Character not found"
                    });
                    room.forEach((client) => {
                      if (client.readyState === 1) client.send(rollbackMessage);
                    });
                  }
                  return;
                }
                
                // Check combat turn restriction - players can only move their character's token during their turn
                // Only enforce turn restriction if combat is active AND a turn has been established
                const tokenScene = token.sceneId ? await storage.getScene(token.sceneId) : null;
                if (tokenScene?.inCombat && tokenScene.currentTurnCharacterId) {
                  // In combat mode with active turn - check if it's this character's turn
                  if (tokenScene.currentTurnCharacterId !== token.characterId) {
                    // Rollback
                    if (room) {
                      const rollbackMessage = JSON.stringify({
                        type: "token_move_rollback",
                        tokenId,
                        x: originalX,
                        y: originalY,
                        message: "It's not your turn to move"
                      });
                      room.forEach((client) => {
                        if (client.readyState === 1) client.send(rollbackMessage);
                      });
                    }
                    ws.send(JSON.stringify({
                      type: "error",
                      message: "It's not your turn to move"
                    }));
                    return;
                  }
                }
                
                // Check if user owns the character OR has edit permission
                const isOwner = character.userId === authenticatedUserId;
                if (!isOwner) {
                  const permission = await storage.getCharacterPermission(token.characterId, authenticatedUserId);
                  const hasEditAccess = permission?.accessLevel === 'edit';
                  
                  if (!hasEditAccess) {
                    // Rollback
                    if (room) {
                      const rollbackMessage = JSON.stringify({
                        type: "token_move_rollback",
                        tokenId,
                        x: originalX,
                        y: originalY,
                        message: "Not authorized to move this token"
                      });
                      room.forEach((client) => {
                        if (client.readyState === 1) client.send(rollbackMessage);
                      });
                    }
                    ws.send(JSON.stringify({
                      type: "error",
                      message: "Not authorized to move this token"
                    }));
                    return;
                  }
                }
              } else {
                // Non-character tokens (enemies, NPCs) can only be moved by GM
                // Rollback
                if (room) {
                  const rollbackMessage = JSON.stringify({
                    type: "token_move_rollback",
                    tokenId,
                    x: originalX,
                    y: originalY,
                    message: "Only GMs can move non-player tokens"
                  });
                  room.forEach((client) => {
                    if (client.readyState === 1) client.send(rollbackMessage);
                  });
                }
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Only GMs can move non-player tokens"
                }));
                return;
              }
            }
            
            // Collision detection - check if the target position would overlap with other tokens
            const allTokens = token.sceneId ? await storage.getSceneTokens(token.sceneId) : [];
            const allCharacters = await storage.getCampaignCharacters(campaignId);
            const campaignForSpecies = await storage.getCampaign(campaignId);
            const speciesSlug = (campaignForSpecies as any)?.system || 'arcana-adventure';
            const speciesDisplayName = speciesSlug === 'aa-v2' ? 'A.A. V2' : 'Arcana Adventure';
            const allSpecies = await storage.getSystemSpecies(speciesDisplayName);
            const campaignSpecies = await storage.getCampaignSpecies(campaignId);
            const speciesList = [...allSpecies, ...campaignSpecies];
            
            // Get grid size from scene
            const scene = token.sceneId ? await storage.getScene(token.sceneId) : null;
            const gridSize = scene?.gridSize || 50;
            
            // Helper to get grid span based on species size
            const getTokenGridSpan = (size?: string) => {
              switch (size?.toLowerCase()) {
                case 'huge': return 2;
                case 'gargantuan': return 3;
                default: return 1;
              }
            };
            
            // Helper to get token size - checks token's enriched speciesSize first, then character's species
            const getTokenSize = (tok: any, chars: any[], species: any[]) => {
              if (tok.speciesSize) return tok.speciesSize;
              if (tok.characterId) {
                const char = chars.find(c => c.id === tok.characterId);
                if (char?.race) {
                  const spec = species.find(s => s.name === char.race);
                  if (spec?.size) return spec.size;
                }
              }
              return 'Medium';
            };
            
            // Get the moving token's species and size
            const movingTokenSize = getTokenSize(token, allCharacters, speciesList);
            const movingGridSpan = getTokenGridSpan(movingTokenSize);
            
            // Calculate grid cells for the moving token at new position
            const movingMinGridX = Math.round(x / gridSize);
            const movingMinGridY = Math.round(y / gridSize);
            const movingMaxGridX = movingMinGridX + movingGridSpan - 1;
            const movingMaxGridY = movingMinGridY + movingGridSpan - 1;
            
            // Check collision with other tokens
            let hasCollision = false;
            for (const otherToken of allTokens) {
              if (otherToken.id === tokenId) continue;
              
              const otherTokenSize = getTokenSize(otherToken, allCharacters, speciesList);
              const otherGridSpan = getTokenGridSpan(otherTokenSize);
              
              const otherMinGridX = Math.round(otherToken.x / gridSize);
              const otherMinGridY = Math.round(otherToken.y / gridSize);
              const otherMaxGridX = otherMinGridX + otherGridSpan - 1;
              const otherMaxGridY = otherMinGridY + otherGridSpan - 1;
              
              const overlapX = movingMinGridX <= otherMaxGridX && movingMaxGridX >= otherMinGridX;
              const overlapY = movingMinGridY <= otherMaxGridY && movingMaxGridY >= otherMinGridY;
              
              if (overlapX && overlapY) {
                hasCollision = true;
                break;
              }
            }
            
            if (hasCollision) {
              // Rollback on collision
              if (room) {
                const rollbackMessage = JSON.stringify({
                  type: "token_move_rollback",
                  tokenId,
                  x: originalX,
                  y: originalY,
                  message: "Cannot move to an occupied space"
                });
                room.forEach((client) => {
                  if (client.readyState === 1) client.send(rollbackMessage);
                });
              }
              ws.send(JSON.stringify({
                type: "error",
                message: "Cannot move to an occupied space"
              }));
              return;
            }
            
            // Update token position in database (async, doesn't block the UI)
            await storage.updateToken(tokenId, { x, y });
          })().catch(err => {
            console.error('[WebSocket] Token move validation/save error:', err);
          });
        }

        if (message.type === "chat_message") {
          const { campaignId, text, messageType, recipientId, recipientName } = message;
          
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
          const validMessageTypes = ["chat", "roll", "emote", "system", "whisper"];
          const sanitizedMessageType = validMessageTypes.includes(messageType) ? messageType : "chat";
          
          // Save to database with server-side authenticated userId
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId,
            sender: username,
            text,
            type: sanitizedMessageType,
            recipientId: sanitizedMessageType === 'whisper' ? (recipientId || null) : null,
            recipientName: sanitizedMessageType === 'whisper' ? (recipientName || null) : null,
          });

          // Broadcast to appropriate clients
          const room = campaignRooms.get(campaignId);
          if (room) {
            const broadcastMessage = JSON.stringify({ 
              type: "chat_message", 
              message: chatMessage 
            });
            
            if (sanitizedMessageType === 'whisper' && recipientId) {
              // Whisper: only send to sender and recipient
              room.forEach((client) => {
                const clientUserId = (client as any).userId;
                if (client.readyState === 1 && (clientUserId === authenticatedUserId || clientUserId === recipientId)) {
                  client.send(broadcastMessage);
                }
              });
            } else {
              // Normal broadcast to all clients
              room.forEach((client) => {
                if (client.readyState === 1) {
                  client.send(broadcastMessage);
                }
              });
            }
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
          
          // Get character name if characterId is provided
          let characterName = "";
          if (characterId) {
            const character = await storage.getCharacter(characterId);
            if (character) {
              characterName = character.name;
            }
          }
          
          // Add characterName to the websocket message for notifications
          const wsMessage = {
            ...createWebSocketDiceRollMessage(rollResult),
            roll: {
              ...rollResult,
              characterName: characterName || undefined,
            }
          };
          
          // Format dice roll result for chat - show "Character Name (Player Name)" format
          const modifierText = rollResult.modifier !== 0 
            ? (rollResult.modifier > 0 ? ` + ${rollResult.modifier}` : ` - ${Math.abs(rollResult.modifier)}`)
            : "";
          const purposeText = purpose ? ` - ${purpose}` : "";
          const senderDisplay = characterName ? `${characterName} (${username})` : username;
          const advantageText = rollResult.advantage === 'advantage' ? ' [ADV]' : 
                               rollResult.advantage === 'disadvantage' ? ' [DIS]' : '';
          const rollsText = rollResult.rolls ? ` (${rollResult.rolls.join(', ')})` : '';
          const rollText = `${dieType.toUpperCase()}${advantageText}${purposeText}: ${rollResult.result}${rollsText}${modifierText} = ${rollResult.total}`;
          
          // Save dice roll to chat as a "roll" type message
          // Use "Character Name (Player Name)" format for sender if character exists
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId,
            sender: senderDisplay,
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
          
          // Check authorization - GM, owner, or users with edit permission can roll
          const campaign = await storage.getCampaign(scene.campaignId);
          const isGM = campaign?.gmUserId === authenticatedUserId || await storage.isGM(authenticatedUserId, scene.campaignId);
          const isOwner = character.userId === authenticatedUserId;
          const editPermission = await storage.getCharacterPermission(characterId, authenticatedUserId);
          const hasEditAccess = editPermission?.accessLevel === 'edit';
          
          if (!isGM && !isOwner && !hasEditAccess) {
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
            campaignId,
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
        
        if (message.type === "apply_combat_mana") {
          const { campaignId, characterId, amount, attackerName, isGain } = message;
          
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            ws.send(JSON.stringify({ type: "error", message: "Not authorized - You have not joined this campaign" }));
            return;
          }
          
          const character = await storage.getCharacter(characterId);
          if (!character) {
            ws.send(JSON.stringify({ type: "error", message: "Character not found" }));
            return;
          }
          
          if (character.campaignId !== campaignId) {
            ws.send(JSON.stringify({ type: "error", message: "Character does not belong to this campaign" }));
            return;
          }
          
          let newMana: number;
          if (isGain) {
            newMana = Math.min(character.mana + amount, character.maxMana);
          } else {
            newMana = Math.max(0, character.mana - amount);
          }
          
          await storage.updateCharacter(characterId, { mana: newMana });
          
          const actionText = isGain ? 'restored' : 'drained';
          const chatText = `${attackerName || username} ${actionText} ${amount} mana ${isGain ? 'to' : 'from'} ${character.name} (Mana: ${character.mana} → ${newMana})`;
          
          const chatMessage = await storage.createChatMessage({
            campaignId,
            userId: authenticatedUserId,
            sender: username,
            text: chatText,
            type: "roll"
          });
          
          broadcastToCampaign(campaignId, {
            type: "character_mana_update",
            characterId,
            mana: newMana,
            previousMana: character.mana,
            amount,
            isGain,
            attackerName: attackerName || username
          });
          
          broadcastToCampaign(campaignId, {
            type: "chat_message",
            message: chatMessage
          });
          
          console.log(`[WebSocket] Combat mana: ${attackerName || username} ${actionText} ${amount} mana ${isGain ? 'to' : 'from'} ${character.name} (Mana: ${character.mana} → ${newMana})`);
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
        
        if (message.type === "dc_save_prompt") {
          const { campaignId, targetUserId, targetCharacterId, saveRequestId, spellName, saveAttribute, saveDc, damage, damageType, saveSuccessEffect, casterName, isHealing } = message;
          const room = campaignRooms.get(campaignId);
          if (room) {
            const promptMessage = JSON.stringify({
              type: "dc_save_prompt",
              targetUserId,
              targetCharacterId,
              saveRequestId,
              spellName,
              saveAttribute,
              saveDc,
              damage,
              damageType,
              saveSuccessEffect,
              casterName,
              isHealing,
            });
            room.forEach((client) => {
              const clientUserId = (client as any).userId;
              if (clientUserId === targetUserId && client.readyState === 1) {
                client.send(promptMessage);
              }
            });
          }
        }
        
        if (message.type === "save_roll_result") {
          const { campaignId, targetCharacterId, saveRequestId, saved, roll, total } = message;
          const room = campaignRooms.get(campaignId);
          if (room) {
            const resultMessage = JSON.stringify({
              type: "save_roll_result",
              targetCharacterId,
              saveRequestId,
              saved,
              roll,
              total,
            });
            room.forEach((client) => {
              if (client !== ws && client.readyState === 1) {
                client.send(resultMessage);
              }
            });
          }
        }

        if (message.type === "dc_save_result") {
          const { campaignId } = message;
          broadcastToCampaign(campaignId, {
            ...message,
            userId: authenticatedUserId,
            username,
          });
        }

        // Handle token targeting - broadcast to all campaign members
        // so GMs can see who is targeting which token
        if (message.type === "token_targeting") {
          const { campaignId, targetTokenId, characterId, characterName } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            console.log('[Target Server] User not in campaign:', campaignId);
            return;
          }
          
          // Broadcast token targeting to all OTHER campaign members (not the sender)
          const room = campaignRooms.get(campaignId);
          if (room) {
            const targetMessage = JSON.stringify({
              type: "token_targeting",
              userId: authenticatedUserId,
              username,
              targetTokenId,
              characterId,
              characterName
            });
            
            let sentCount = 0;
            room.forEach((client) => {
              // Send to all clients except the sender
              if (client !== ws && client.readyState === 1) {
                client.send(targetMessage);
                sentCount++;
              }
            });
            console.log(`[Target Server] Broadcast from ${username}: target=${targetTokenId}, sent to ${sentCount} other clients`);
          }
        }
        
        // Handle viewport update - broadcast to all campaign members
        // so GMs can see where each player is looking on the battle map
        if (message.type === "viewport_update") {
          const { campaignId, viewportX, viewportY, viewportWidth, viewportHeight, zoom } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            return;
          }
          
          // Broadcast viewport update to all OTHER campaign members (not the sender)
          const room = campaignRooms.get(campaignId);
          if (room) {
            const viewportMessage = JSON.stringify({
              type: "viewport_update",
              userId: authenticatedUserId,
              username,
              viewportX,
              viewportY,
              viewportWidth,
              viewportHeight,
              zoom
            });
            
            room.forEach((client) => {
              // Send to all clients except the sender
              if (client !== ws && client.readyState === 1) {
                client.send(viewportMessage);
              }
            });
          }
        }
        
        // Handle grid highlight - broadcast to all campaign members
        if (message.type === "grid_highlight") {
          const { campaignId, cellKey, highlighted } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) {
            console.log('[Highlight Server] User not in campaign:', campaignId);
            return;
          }
          
          // Broadcast grid highlight to all OTHER campaign members (not the sender)
          const room = campaignRooms.get(campaignId);
          if (room) {
            const highlightMessage = JSON.stringify({
              type: "grid_highlight",
              userId: authenticatedUserId,
              username,
              cellKey,
              highlighted
            });
            
            let sentCount = 0;
            room.forEach((client) => {
              // Send to all clients except the sender
              if (client !== ws && client.readyState === 1) {
                client.send(highlightMessage);
                sentCount++;
              }
            });
            console.log(`[Highlight Server] Broadcast from ${username}: cell=${cellKey}, highlighted=${highlighted}, sent to ${sentCount} other clients`);
          }
        }
        
        // Handle roll notification - broadcast to all campaign members except sender
        // so everyone can see each other's attack/damage/spell rolls
        if (message.type === "roll_notification") {
          const { campaignId, notification } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) return;
          
          // Broadcast roll notification to all OTHER campaign members
          const room = campaignRooms.get(campaignId);
          if (room) {
            const rollMessage = JSON.stringify({
              type: "roll_notification",
              notification: {
                ...notification,
                userId: authenticatedUserId,
                username
              }
            });
            
            room.forEach((client) => {
              // Send to all clients except the sender (sender already sees it locally)
              if (client !== ws && client.readyState === 1) {
                client.send(rollMessage);
              }
            });
          }
        }
        
        // Handle beacon - broadcast temporary attention marker to all campaign members
        // Creates a pulsating ring animation at the specified grid location
        if (message.type === "beacon") {
          const { campaignId, gridX, gridY } = message;
          
          // Verify user has joined this campaign
          const userCampaign = (ws as any).campaigns.get(campaignId);
          if (!userCampaign) return;
          
          // Get the user's beacon color from their membership
          const membership = await storage.getCampaignMembership(authenticatedUserId, campaignId);
          const beaconColor = membership?.beaconColor || '#FBB524'; // Default amber color
          
          // Broadcast beacon to ALL campaign members (including sender for consistency)
          const room = campaignRooms.get(campaignId);
          if (room) {
            const beaconMessage = JSON.stringify({
              type: "beacon",
              id: `${authenticatedUserId}-${Date.now()}`,
              userId: authenticatedUserId,
              username,
              gridX,
              gridY,
              beaconColor
            });
            
            room.forEach((client) => {
              if (client.readyState === 1) {
                client.send(beaconMessage);
              }
            });
          }
        }
        
        // ============================================
        // NOTE COLLABORATION EVENTS
        // ============================================
        
        // Handle join_note - user opens a note for viewing/editing
        if (message.type === "join_note") {
          const { noteId } = message;
          if (!noteId) return;
          
          // Verify user has access to this note
          const note = await storage.getNote(noteId);
          if (!note) {
            ws.send(JSON.stringify({ type: "error", message: "Note not found" }));
            return;
          }
          
          // Check access permissions
          const { canAccess } = await storage.canAccessNote(authenticatedUserId, noteId);
          const isOwner = note.userId === authenticatedUserId;
          
          if (!canAccess && !isOwner) {
            ws.send(JSON.stringify({ type: "error", message: "Not authorized to view this note" }));
            return;
          }
          
          // Initialize note room if doesn't exist
          if (!noteRooms.has(noteId)) {
            noteRooms.set(noteId, { clients: new Set(), presence: new Map() });
          }
          
          const noteRoom = noteRooms.get(noteId)!;
          noteRoom.clients.add(ws);
          noteRoom.presence.set(authenticatedUserId, {
            username,
            cursorPosition: null,
            lastActive: Date.now()
          });
          
          // Track which notes this WebSocket has joined
          if (!(ws as any).joinedNotes) {
            (ws as any).joinedNotes = new Set<string>();
          }
          (ws as any).joinedNotes.add(noteId);
          
          // Send current presence to the new joiner
          const presenceList = Array.from(noteRoom.presence.entries()).map(([userId, data]) => ({
            userId,
            ...data
          }));
          
          ws.send(JSON.stringify({
            type: "note_joined",
            noteId,
            presence: presenceList
          }));
          
          // Broadcast user joined to others in the note room
          const joinMessage = JSON.stringify({
            type: "note_presence_update",
            noteId,
            userId: authenticatedUserId,
            username,
            action: "joined"
          });
          
          noteRoom.clients.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(joinMessage);
            }
          });
          
          console.log(`[WebSocket] User ${username} joined note ${noteId}`);
        }
        
        // Handle leave_note - user closes a note
        if (message.type === "leave_note") {
          const { noteId } = message;
          if (!noteId) return;
          
          const noteRoom = noteRooms.get(noteId);
          if (noteRoom) {
            noteRoom.clients.delete(ws);
            noteRoom.presence.delete(authenticatedUserId);
            
            // Remove from tracked notes
            if ((ws as any).joinedNotes) {
              (ws as any).joinedNotes.delete(noteId);
            }
            
            // Broadcast user left to others
            const leaveMessage = JSON.stringify({
              type: "note_presence_update",
              noteId,
              userId: authenticatedUserId,
              username,
              action: "left"
            });
            
            noteRoom.clients.forEach((client) => {
              if (client.readyState === 1) {
                client.send(leaveMessage);
              }
            });
            
            // Clean up empty rooms
            if (noteRoom.clients.size === 0) {
              noteRooms.delete(noteId);
            }
          }
          
          console.log(`[WebSocket] User ${username} left note ${noteId}`);
        }
        
        // Handle note_update - broadcast content changes to other viewers
        if (message.type === "note_update") {
          const { noteId, title, content, canvasData } = message;
          if (!noteId) return;
          
          const noteRoom = noteRooms.get(noteId);
          if (!noteRoom || !noteRoom.clients.has(ws)) return;
          
          // Update presence activity
          const presence = noteRoom.presence.get(authenticatedUserId);
          if (presence) {
            presence.lastActive = Date.now();
          }
          
          // Broadcast update to all OTHER clients viewing this note
          const updateMessage = JSON.stringify({
            type: "note_update",
            noteId,
            userId: authenticatedUserId,
            username,
            title,
            content,
            canvasData,
            timestamp: Date.now()
          });
          
          noteRoom.clients.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(updateMessage);
            }
          });
        }
        
        // Handle cursor_update - for live cursor/selection presence
        if (message.type === "cursor_update") {
          const { noteId, cursorPosition, selection } = message;
          if (!noteId) return;
          
          const noteRoom = noteRooms.get(noteId);
          if (!noteRoom || !noteRoom.clients.has(ws)) return;
          
          // Update presence
          const presence = noteRoom.presence.get(authenticatedUserId);
          if (presence) {
            presence.cursorPosition = cursorPosition;
            presence.lastActive = Date.now();
          }
          
          // Broadcast cursor position to others
          const cursorMessage = JSON.stringify({
            type: "cursor_update",
            noteId,
            userId: authenticatedUserId,
            username,
            cursorPosition,
            selection
          });
          
          noteRoom.clients.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(cursorMessage);
            }
          });
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
      // Remove from global connected clients set
      allConnectedClients.delete(ws);
      
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
      
      // Remove from all note rooms and broadcast presence update
      const joinedNotes = (ws as any).joinedNotes || new Set<string>();
      const disconnectedUserId = (ws as any).userId;
      const disconnectedUsername = (ws as any).username;
      
      joinedNotes.forEach((noteId: string) => {
        const noteRoom = noteRooms.get(noteId);
        if (noteRoom) {
          noteRoom.clients.delete(ws);
          noteRoom.presence.delete(disconnectedUserId);
          
          // Broadcast user left to others
          const leaveMessage = JSON.stringify({
            type: "note_presence_update",
            noteId,
            userId: disconnectedUserId,
            username: disconnectedUsername,
            action: "left"
          });
          
          noteRoom.clients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(leaveMessage);
            }
          });
          
          // Clean up empty rooms
          if (noteRoom.clients.size === 0) {
            noteRooms.delete(noteId);
          }
        }
      });
      
      console.log(`[WebSocket] User ${(ws as any).username} disconnected`);
    });
  });

  // Authentication middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Ban check: verify user is not banned
    const user = await storage.getUser(req.session.userId);
    if (user && user.bannedAt) {
      // Check if ban has expired
      if (user.banExpiresAt && new Date(user.banExpiresAt) < new Date()) {
        // Auto-unban: ban has expired
        await storage.unbanUser(user.id);
      } else {
        // Still banned - return 403 with ban details
        return res.status(403).json({
          error: "Your account has been banned",
          bannedAt: user.bannedAt,
          banExpiresAt: user.banExpiresAt,
          banReason: user.banReason,
        });
      }
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
   * Users with edit access (owner, GM, or explicit 'edit' permission) can modify:
   * - Cosmetic fields: name, portrait, biography, nickname
   * - Current resources: hp, energy
   * - Max resources: maxHp, maxEnergy
   * - Attributes: might, finesse, wit, presence, will, craft
   * - Skills: all skill fields (skillAgility, skillPerception, etc.)
   * - Level-up tracking fields
   * 
   * Only GMs can edit:
   * - Race stats (size, speed, naturalArmor, etc.)
   * - GM Notes (players cannot see this field)
   * - Species/race assignment
   */
  function validateCharacterUpdate(updates: Partial<any>, isGM: boolean, canEditSheet: boolean): void {
    // GM-only fields that regular editors cannot change
    const serverOnlyFields = ['classSkillPoints'];
    for (const f of serverOnlyFields) {
      delete updates[f];
    }
    const gmOnlyFields = [
      'gmNotes', 'speciesId', 'race', 'size', 'speed', 'naturalArmor', 
      'isTemplate', 'campaignId', 'userId', 'folderId'
    ];
    
    if (!isGM) {
      const attemptedFields = Object.keys(updates);
      const restrictedFields = attemptedFields.filter(f => gmOnlyFields.includes(f));
      
      if (restrictedFields.length > 0) {
        throw new Error(
          `Forbidden: Only GMs can edit ${restrictedFields.join(', ')}`
        );
      }
    }
    
    // If user doesn't have edit access at all, they can't edit anything
    if (!canEditSheet && !isGM) {
      throw new Error('You do not have permission to edit this character');
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

  // Admin emails for system-wide access (defined early for use in checkCharacterAccess)
  const ADMIN_EMAILS = ['notclaudenot@gmail.com', 'reedmcaleb@gmail.com'];

  // Helper to check if user is admin (defined early for use in checkCharacterAccess)
  const isAdminUser = async (userId: string | undefined): Promise<boolean> => {
    if (!userId) return false;
    const user = await storage.getUser(userId);
    return user ? (user.isAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())) : false;
  };

  const hasGmAccess = async (userId: string, campaignId: string, gmUserId: string): Promise<boolean> => {
    if (gmUserId === userId) return true;
    if (await isAdminUser(userId)) return true;
    const membership = await storage.getCampaignMembership(userId, campaignId);
    return membership?.role === 'assistant_gm';
  };

  /**
   * checkCharacterAccess - Helper function to check character permissions
   * 
   * Returns whether the user has access to a character based on:
   * - Character ownership
   * - GM status in the campaign
   * - Campaign membership verification
   * - Explicit permissions granted by the GM
   * - Admin access for character templates
   */
  async function checkCharacterAccess(
    characterId: string,
    userId: string,
    requiredLevel: 'name' | 'view' | 'edit'
  ): Promise<{ allowed: boolean; isOwner: boolean; isGM: boolean; character?: any; campaign?: any; permission?: any }> {
    console.log(`[checkCharacterAccess] Checking access for character ${characterId} by user ${userId} (${requiredLevel})`);
    
    const character = await storage.getCharacter(characterId);
    if (!character) {
      console.log(`[checkCharacterAccess] Character not found`);
      return { allowed: false, isOwner: false, isGM: false };
    }
    
    // Handle character templates (admin-created, no campaign)
    if (character.isTemplate && !character.campaignId) {
      const userIsAdmin = await isAdminUser(userId);
      console.log(`[checkCharacterAccess] Character is template, user isAdmin: ${userIsAdmin}`);
      if (userIsAdmin) {
        return { allowed: true, isOwner: true, isGM: true, character };
      }
      // Non-admins cannot access character templates directly
      return { allowed: false, isOwner: false, isGM: false, character };
    }
    
    const campaign = await storage.getCampaign(character.campaignId);
    if (!campaign) {
      console.log(`[checkCharacterAccess] Campaign not found`);
      return { allowed: false, isOwner: false, isGM: false };
    }
    
    const isOwner = character.userId === userId;
    const isGM = await hasGmAccess(userId, campaign.id, campaign.gmUserId);
    console.log(`[checkCharacterAccess] Character userId: ${character.userId}, Request userId: ${userId}, isOwner: ${isOwner}, isGM: ${isGM}`);
    
    // Verify user is still a member of the campaign (skip for GM/admin)
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
    
    // Permission hierarchy: edit > view > name > none
    // 'name' level: grants name-only access on token
    // 'view' level: grants full stats viewing
    // 'edit' level: grants editing/control
    const levelHierarchy: Record<string, number> = {
      'none': 0,
      'name': 1,
      'view': 2,
      'edit': 3
    };
    
    const userLevel = levelHierarchy[permission.accessLevel] || 0;
    const requiredLevelNum = levelHierarchy[requiredLevel] || 0;
    
    return { 
      allowed: userLevel >= requiredLevelNum, 
      isOwner, 
      isGM, 
      character, 
      campaign,
      permission
    };
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
          name: user.name,
          isAdmin: user.isAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())
        } 
      });
    } catch (err) {
      res.status(400).json({ error: "Invalid input" });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password, rememberMe } = req.body;
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

      if (rememberMe) {
        req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
      } else {
        req.session.cookie.maxAge = undefined as any;
        req.session.cookie.expires = undefined as any;
      }

      req.session.userId = user.id;
      // Only send safe user fields (never send password hash to client)
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          username: user.username, 
          name: user.name,
          isAdmin: user.isAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())
        } 
      });
    } catch (err) {
      res.status(400).json({ error: "Invalid input" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
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
        name: user.name,
        isAdmin: user.isAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())
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
      const { name, system, gridSize, currentMap } = req.body;
      
      const inviteCode = "ARCANA-" + Math.floor(1000 + Math.random() * 9000);
      
      const campaign = await storage.createCampaign({
        name,
        inviteCode,
        gmUserId: req.session.userId!,
        gridSize: gridSize || 50,
        currentMap,
        system: system || "arcana-adventure"
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
    
    // Determine user's role in this campaign
    const userId = req.session.userId!;
    const isOwner = campaign.gmUserId === userId;
    
    // Check for admin incognito mode
    const incognitoMode = req.query.incognito === 'true';
    const user = await storage.getUser(userId);
    const userIsAdmin = user ? (user.isAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())) : false;
    
    let userRole: 'gm' | 'player' = 'player';
    let isIncognito = false;
    
    // Admin incognito mode: grant GM access without membership
    if (incognitoMode && userIsAdmin) {
      userRole = 'gm';
      isIncognito = true;
    } else if (isOwner) {
      userRole = 'gm';
    } else {
      // Check membership for assistant_gm role
      const membership = await storage.getCampaignMembership(userId, req.params.id);
      if (membership?.role === 'assistant_gm') {
        userRole = 'gm';
      }
    }
    
    res.json({ ...campaign, userRole, isIncognito });
  });
  
  // Get chat messages for a campaign
  app.get("/api/campaigns/:id/chat", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const messages = await storage.getCampaignMessages(req.params.id, 100);
      // Filter whisper messages: only show to sender or recipient
      const filtered = messages.filter((msg: any) => {
        if (msg.type === 'whisper') {
          return msg.userId === userId || msg.recipientId === userId;
        }
        return true;
      });
      // Return in chronological order (oldest first)
      res.json(filtered.reverse());
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
      
      if (!member || (member.role !== 'gm' && member.role !== 'assistant_gm')) {
        return res.status(403).json({ error: "Only the GM can clear chat" });
      }
      
      await storage.clearChatMessages(campaignId);
      broadcastToCampaign(campaignId, { type: 'chat_cleared' });
      res.json({ success: true });
    } catch (err) {
      console.error('Error clearing chat messages:', err);
      res.status(500).json({ error: "Failed to clear chat messages" });
    }
  });

  app.patch("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id || (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const members = await storage.getCampaignMembers(req.params.id);
      const member = members.find(m => m.userId === userId);
      if (!member || (member.role !== 'gm' && member.role !== 'assistant_gm')) {
        return res.status(403).json({ error: "Only the GM can update campaign settings" });
      }

      const allowedFields = ['name', 'defaultPanel', 'hotbarSlots', 'activeSceneId'];
      const sanitized: Record<string, any> = {};
      for (const key of allowedFields) {
        if (key in req.body) sanitized[key] = req.body[key];
      }
      if (sanitized.name !== undefined) {
        const name = String(sanitized.name).trim();
        if (!name || name.length > 100) {
          return res.status(400).json({ error: "Campaign name must be 1-100 characters" });
        }
        sanitized.name = name;
      }

      const campaign = await storage.updateCampaign(req.params.id, sanitized);
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

      // Broadcast member joined to all campaign members
      const updatedMembers = await storage.getCampaignMembers(campaign.id);
      broadcastToCampaign(campaign.id, {
        type: "members_updated",
        members: updatedMembers
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
      const campaignId = req.params.id;
      await storage.removeCampaignMember(campaignId, req.session.userId!);
      
      // Broadcast member left to all remaining campaign members
      const updatedMembers = await storage.getCampaignMembers(campaignId);
      broadcastToCampaign(campaignId, {
        type: "members_updated",
        members: updatedMembers
      });
      
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

  // Duplicate campaign (owner/GM only)
  app.post("/api/campaigns/:id/duplicate", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = req.session.userId!;

      // Verify user is the campaign owner or GM
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isOwner = campaign.gmUserId === userId;
      const membership = await storage.getCampaignMembership(userId, campaignId);
      const isAssistantGM = membership?.role === 'assistant_gm';

      if (!isOwner && !isAssistantGM) {
        return res.status(403).json({ error: "Only the campaign owner or GM can duplicate this campaign" });
      }

      // Duplicate the campaign with the current user as the new owner
      const newCampaign = await storage.duplicateCampaign(campaignId, userId);
      res.json(newCampaign);
    } catch (err: any) {
      console.error("Failed to duplicate campaign:", err);
      res.status(400).json({ error: err.message || "Failed to duplicate campaign" });
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
      const campaign = await storage.getCampaign(req.params.campaignId);
      const charData: any = {
        ...req.body,
        campaignId: req.params.campaignId,
        userId: req.session.userId!
      };
      if (campaign?.system === 'aa-v2') {
        const level = charData.level || 1;
        let expectedTotal = 0;
        for (let lvl = 1; lvl <= level; lvl++) {
          expectedTotal += (lvl % 3 === 0) ? 5 : 3;
        }
        charData.classSkillPoints = expectedTotal;
      }
      const character = await storage.createCharacter(charData);
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
      
      const isGM = await hasGmAccess(req.session.userId, req.params.campaignId, campaign.gmUserId);
      const allCharacters = await storage.getCampaignCharacters(req.params.campaignId);
      
      // If GM (or admin), return all characters
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
        
        // Check permission from map - name, view, or edit all grant access to see the character
        const accessLevel = permissionMap.get(char.id);
        return accessLevel === 'name' || accessLevel === 'view' || accessLevel === 'edit';
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
      // First check if this is a character template - admins can edit those directly
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // If it's a template, only admins can edit it
      if (character.isTemplate) {
        const user = await storage.getUser(req.session.userId!);
        const userIsAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
        if (!userIsAdmin) {
          return res.status(403).json({ error: "Only admins can edit character templates" });
        }
        // Admin editing a template - proceed directly without campaign checks
        console.log('[Character Update] Admin editing template', req.params.id, ':', req.body);
        const updatedCharacter = await storage.updateCharacter(req.params.id, req.body);
        return res.json(updatedCharacter);
      }
      
      // Check if user is an admin (admins can edit any campaign character as if they were a GM)
      const user = await storage.getUser(req.session.userId!);
      const isAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      
      // Regular character - use normal permission checks (admins bypass access check but still validate)
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      
      if (!access.campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Admin override: if user is admin, they have access even if checkCharacterAccess said no
      if (!access.allowed && !isAdmin) {
        return res.status(403).json({ error: "You don't have permission to edit this character" });
      }

      // Validate update based on GM status (admins count as GMs for validation purposes)
      // canEditSheet is true if user is owner, GM, admin, or has 'edit' permission level
      const effectiveIsGM = access.isGM || isAdmin;
      const canEditSheet = access.isOwner || effectiveIsGM || access.allowed;
      try {
        validateCharacterUpdate(req.body, effectiveIsGM, canEditSheet);
      } catch (validationErr: any) {
        return res.status(403).json({ error: validationErr.message });
      }

      // Only validate attribute and skill point totals when those fields are being updated
      const charData = access.character;
      const updates = req.body;
      
      const attrs = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];
      const skills = ['skillAgility', 'skillArcana', 'skillCharisma', 'skillConcentration', 'skillCulture', 'skillDeception', 'skillHistory', 'skillIntimidation', 'skillInvestigation', 'skillMedicine', 'skillPerception', 'skillSleightOfHand', 'skillStealth', 'skillStrength', 'skillWisdom'];
      
      // Check if any stat-related fields are being updated
      const isUpdatingStats = attrs.some(a => a in updates) || skills.some(s => s in updates) || 'level' in updates;
      
      if (isUpdatingStats) {
        const level = updates.level ?? charData.level ?? 1;
        const maxPositiveAttrPoints = 6 + Math.floor(level / 3);
        const maxNegativeAttrPoints = 4;
        const maxPositiveSkillPoints = 12 + ((level - 1) * 2);
        const maxNegativeSkillPoints = 6;

        const attrValues = attrs.map(a => updates[a] ?? charData[a] ?? 0);
        const positiveAttr = attrValues.filter((v: number) => v > 0).reduce((s: number, v: number) => s + v, 0);
        const negativeAttr = Math.abs(attrValues.filter((v: number) => v < 0).reduce((s: number, v: number) => s + v, 0));

        const skillValues = skills.map(s => updates[s] ?? charData[s] ?? 0);
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

      if ('level' in updates && access.campaign?.system === 'aa-v2') {
        const oldLevel = charData.level || 1;
        const newLevel = updates.level;
        if (newLevel > oldLevel) {
          let pointsToAdd = 0;
          for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
            pointsToAdd += (lvl % 3 === 0) ? 5 : 3;
          }
          if (pointsToAdd > 0) {
            updates.classSkillPoints = (charData.classSkillPoints || 0) + pointsToAdd;
          }
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
        // Get campaign system to filter species by correct system
        // Species table uses display names ("Arcana Adventure", "A.A. V2") not slugs
        let speciesSystemName: string | undefined;
        if (character.campaignId) {
          const camp = await storage.getCampaign(character.campaignId);
          const slug = (camp as any)?.system || 'arcana-adventure';
          speciesSystemName = slug === 'aa-v2' ? 'A.A. V2' : 'Arcana Adventure';
        }
        // First check campaign species, then system species filtered by system
        let species: any = null;
        if (character.campaignId) {
          const campSpecies = await storage.getCampaignSpecies(character.campaignId);
          species = campSpecies.find(s => s.name === character.race);
        }
        if (!species) {
          species = await storage.getSpeciesByName(character.race, speciesSystemName);
        }
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

      // Stack items when adding stackable items (consumables, ammunition) to hotbar
      // If a matching item already exists in a hotbar slot, merge quantities instead of adding a new slot
      if (hotbarData.itemId && (hotbarData.hotbarType === 'consumables' || hotbarData.hotbarType === 'weapons' || hotbarData.hotbarType === 'utility')) {
        const newItem = await storage.getItem(hotbarData.itemId);
        
        if (newItem && (newItem.itemType === 'consumable' || newItem.itemType === 'ammunition' || (newItem.quantity || 1) > 1)) {
          // Get existing hotbars of the same type for this character
          const existingHotbars = await storage.getHotbarsByCharacter(req.params.characterId);
          const sameTypeHotbars = existingHotbars.filter(h => h.hotbarType === hotbarData.hotbarType && h.itemId);
          
          // Find a matching item in existing hotbar slots (same name, type, and ammunition type if applicable)
          for (const existingHotbar of sameTypeHotbars) {
            if (!existingHotbar.itemId || existingHotbar.itemId === hotbarData.itemId) continue;
            
            const existingItem = await storage.getItem(existingHotbar.itemId);
            if (!existingItem) continue;
            
            // Match by name and itemType (and ammunitionType for ammunition)
            const nameMatch = existingItem.name === newItem.name;
            const typeMatch = existingItem.itemType === newItem.itemType;
            const ammoMatch = newItem.itemType !== 'ammunition' || existingItem.ammunitionType === newItem.ammunitionType;
            
            if (nameMatch && typeMatch && ammoMatch) {
              // Found a matching item - merge quantities
              const newQuantity = (existingItem.quantity || 1) + (newItem.quantity || 1);
              await storage.updateItem(existingItem.id, { quantity: newQuantity });
              
              // Delete the item being added (it's been merged)
              await storage.deleteItem(newItem.id);
              
              // Return the existing hotbar entry (no need to create a new slot)
              // Also broadcast that items have changed
              if (access.character?.campaignId) {
                broadcastToCampaign(access.character.campaignId, {
                  type: "hotbar_updated",
                  characterId: req.params.characterId
                });
                broadcastToCampaign(access.character.campaignId, {
                  type: "items_updated",
                  characterId: req.params.characterId
                });
              }
              
              return res.json(existingHotbar);
            }
          }
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
      
      // Check if user is admin (admins can add spells to any character)
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      
      // Adding spells requires owner, GM, or admin access (edit access alone is not sufficient)
      if (!access.isOwner && !access.isGM && !userIsAdmin) {
        return res.status(403).json({ error: "Only the character owner or GM can add spells" });
      }

      const sourceTemplateId = req.body.sourceTemplateId;

      const spellData = insertSpellSchema.parse({
        ...req.body,
        characterId: req.params.characterId
      });

      const spell = await storage.createSpell(spellData);

      if (sourceTemplateId) {
        try {
          const templateRolls = await storage.getRollEntries('spell', sourceTemplateId);
          for (const roll of templateRolls) {
            await storage.createRollEntry({
              ownerType: 'spell',
              ownerId: spell.id,
              name: roll.name,
              rollType: roll.rollType,
              diceFormula: roll.diceFormula,
              mod: roll.mod,
              damageType: roll.damageType,
              attribute: roll.attribute,
              applyToStat: roll.applyToStat,
              sortOrder: roll.sortOrder,
              range: roll.range,
              aoeShape: roll.aoeShape,
              aoeRange: roll.aoeRange,
              requiresSave: roll.requiresSave,
              saveAttribute: roll.saveAttribute,
              saveDc: roll.saveDc,
              saveSuccessEffect: roll.saveSuccessEffect,
              saveDcType: roll.saveDcType,
              saveDcAttribute: roll.saveDcAttribute,
              statDirection: roll.statDirection,
              gainEnergy: roll.gainEnergy,
              isAttack: roll.isAttack,
              isAoe: roll.isAoe,
              passesThroughWalls: roll.passesThroughWalls,
              primaryColor: roll.primaryColor,
              requiresEnergy: roll.requiresEnergy,
              energyCost: roll.energyCost,
              noRoll: roll.noRoll,
              enableChatMessage: roll.enableChatMessage,
              chatMessage: roll.chatMessage,
              applyTokenEffects: roll.applyTokenEffects,
              tokenEffectIds: roll.tokenEffectIds,
              effectTriggerCondition: roll.effectTriggerCondition,
              isHidden: roll.isHidden,
              requiredSkillId: roll.requiredSkillId,
              requiredSkillValue: roll.requiredSkillValue,
            } as any);
          }
        } catch (rollErr) {
          console.error('Failed to copy roll entries from template spell:', rollErr);
        }
      }
      
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

  // Roll Entry routes
  app.get("/api/items/:id/rolls", requireAuth, async (req, res) => {
    try {
      const rolls = await storage.getRollEntries("item", req.params.id);
      res.json(rolls);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch item roll entries" });
    }
  });

  app.get("/api/spells/:id/rolls", requireAuth, async (req, res) => {
    try {
      const rolls = await storage.getRollEntries("spell", req.params.id);
      res.json(rolls);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spell roll entries" });
    }
  });

  app.post("/api/roll-entries", requireAuth, async (req, res) => {
    try {
      const entry = await storage.createRollEntry(req.body);
      res.json(entry);
    } catch (err) {
      res.status(400).json({ error: "Failed to create roll entry" });
    }
  });

  app.patch("/api/roll-entries/:id", requireAuth, async (req, res) => {
    try {
      const entry = await storage.updateRollEntry(req.params.id, req.body);
      if (!entry) {
        return res.status(404).json({ error: "Roll entry not found" });
      }
      res.json(entry);
    } catch (err) {
      res.status(400).json({ error: "Failed to update roll entry" });
    }
  });

  app.delete("/api/roll-entries/:id", requireAuth, async (req, res) => {
    try {
      const entry = await db.select().from(rollEntries).where(eq(rollEntries.id, req.params.id)).then(r => r[0]);
      if (entry && entry.name === 'Detonate') {
        const ownerItems = await db.select().from(items).where(eq(items.id, entry.ownerId)).then(r => r[0]);
        if (ownerItems && ownerItems.isDetonatable) {
          return res.status(400).json({ error: "Cannot delete Detonate roll while item is detonatable. Uncheck 'Is Detonatable' first." });
        }
      }
      await storage.deleteRollEntry(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete roll entry" });
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
      
      // Enrich tokens with species size for proper rendering
      // This ensures all players see correct token sizes regardless of character permissions
      // Pre-fetch species data once (not per-token) for performance
      // Filter by campaign system to get correct species
      const tokenCampaign = await storage.getCampaign(req.params.campaignId);
      const tokenSystemSlug = (tokenCampaign as any)?.system || 'arcana-adventure';
      const tokenSpeciesName = tokenSystemSlug === 'aa-v2' ? 'A.A. V2' : 'Arcana Adventure';
      const [systemSpecies, campaignSpecies] = await Promise.all([
        storage.getSystemSpecies(tokenSpeciesName),
        storage.getCampaignSpecies(req.params.campaignId)
      ]);
      const allSpecies = [...systemSpecies, ...campaignSpecies];
      
      // Batch fetch characters for tokens that have characterId
      const characterIds = tokensList.filter(t => t.characterId).map(t => t.characterId!);
      const characters = await storage.getCharactersByIds(characterIds);
      const characterMap = new Map(characters.map(c => [c.id, c]));
      
      const enrichedTokens = tokensList.map((token) => {
        if (!token.characterId) return token;
        
        const character = characterMap.get(token.characterId);
        if (!character?.race) return token;
        
        const species = allSpecies.find(s => s.name === character.race);
        
        return {
          ...token,
          speciesSize: species?.size || 'Medium',
          tokenImage: character.portrait || token.image,
        };
      });
      
      res.json(enrichedTokens);
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

  // GM Hotbar routes - get/update GM's character hotbar
  app.get("/api/campaigns/:id/gm-hotbar", requireAuth, async (req, res) => {
    try {
      const hotbar = await storage.getGmHotbar(req.params.id, req.session.userId!);
      res.json(hotbar);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch GM hotbar" });
    }
  });

  app.put("/api/campaigns/:id/gm-hotbar", requireAuth, async (req, res) => {
    try {
      const { hotbar } = req.body;
      if (!Array.isArray(hotbar)) {
        return res.status(400).json({ error: "Hotbar must be an array" });
      }
      await storage.updateGmHotbar(req.params.id, req.session.userId!, hotbar);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update GM hotbar" });
    }
  });

  // Set member role (Owner only - can promote/demote to assistant_gm)
  app.patch("/api/campaigns/:campaignId/members/:memberId/role", requireAuth, async (req, res) => {
    try {
      const { campaignId, memberId } = req.params;
      const { role } = req.body;
      
      // Validate role
      if (role !== 'player' && role !== 'assistant_gm') {
        return res.status(400).json({ error: "Invalid role. Must be 'player' or 'assistant_gm'" });
      }
      
      // Only the campaign owner can change roles
      const isOwner = await storage.isOwner(req.session.userId!, campaignId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the campaign owner can change member roles" });
      }
      
      // Get the member to ensure they exist and aren't the owner
      const members = await storage.getCampaignMembers(campaignId);
      const targetMember = members.find(m => m.id === memberId);
      if (!targetMember) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      // Can't change the owner's role
      const campaign = await storage.getCampaign(campaignId);
      if (targetMember.userId === campaign?.gmUserId) {
        return res.status(400).json({ error: "Cannot change the campaign owner's role" });
      }
      
      const updatedMember = await storage.setMemberRole(campaignId, memberId, role);
      
      // Broadcast role change to all campaign members
      const updatedMembers = await storage.getCampaignMembers(campaignId);
      broadcastToCampaign(campaignId, {
        type: "members_updated",
        members: updatedMembers
      });
      
      res.json(updatedMember);
    } catch (err) {
      console.error('Error setting member role:', err);
      res.status(500).json({ error: "Failed to update member role" });
    }
  });

  // Update member beacon color (player can update their own color)
  app.patch("/api/campaigns/:campaignId/beacon-color", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { beaconColor } = req.body;
      const userId = req.session.userId!;
      
      // Validate color format (hex color)
      if (!beaconColor || !/^#[0-9A-Fa-f]{6}$/.test(beaconColor)) {
        return res.status(400).json({ error: "Invalid color format. Must be a hex color like #FF5500" });
      }
      
      // Check if user is a member of this campaign
      const membership = await storage.getCampaignMembership(userId, campaignId);
      const campaign = await storage.getCampaign(campaignId);
      
      if (!membership && campaign?.gmUserId !== userId) {
        return res.status(403).json({ error: "Not a member of this campaign" });
      }
      
      const updatedMember = await storage.updateMemberBeaconColor(campaignId, userId, beaconColor);
      
      // Broadcast member update to all campaign members
      const updatedMembers = await storage.getCampaignMembers(campaignId);
      broadcastToCampaign(campaignId, {
        type: "members_updated",
        members: updatedMembers
      });
      
      res.json(updatedMember);
    } catch (err) {
      console.error('Error updating beacon color:', err);
      res.status(500).json({ error: "Failed to update beacon color" });
    }
  });

  // Kick a player (GM/Assistant GM - but cannot kick owner)
  app.post("/api/campaigns/:campaignId/kick/:userId", requireAuth, async (req, res) => {
    try {
      const { campaignId, userId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Allow owner or assistant GMs to kick
      const canKick = await storage.isGM(req.session.userId!, campaignId);
      if (!canKick) {
        return res.status(403).json({ error: "Only GMs can kick players" });
      }

      // Cannot kick the campaign owner
      if (userId === campaign.gmUserId) {
        return res.status(400).json({ error: "Cannot kick the campaign owner" });
      }

      await storage.kickMember(campaignId, userId);
      
      // Broadcast member list update to all remaining campaign members
      const updatedMembers = await storage.getCampaignMembers(campaignId);
      broadcastToCampaign(campaignId, {
        type: "members_updated",
        members: updatedMembers
      });
      
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to kick player" });
    }
  });

  // Ban a player (GM/Assistant GM - but cannot ban owner)
  app.post("/api/campaigns/:campaignId/ban/:userId", requireAuth, async (req, res) => {
    try {
      const { campaignId, userId } = req.params;
      const { reason } = req.body;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Allow owner or assistant GMs to ban
      const canBan = await storage.isGM(req.session.userId!, campaignId);
      if (!canBan) {
        return res.status(403).json({ error: "Only GMs can ban players" });
      }

      // Cannot ban the campaign owner
      if (userId === campaign.gmUserId) {
        return res.status(400).json({ error: "Cannot ban the campaign owner" });
      }

      const ban = await storage.banMember(campaignId, userId, reason);
      
      // Broadcast member list update to all remaining campaign members
      const updatedMembers = await storage.getCampaignMembers(campaignId);
      broadcastToCampaign(campaignId, {
        type: "members_updated",
        members: updatedMembers
      });
      
      res.json(ban);
    } catch (err) {
      res.status(400).json({ error: "Failed to ban player" });
    }
  });

  // Unban a player (GM/Assistant GM)
  app.delete("/api/campaigns/:campaignId/bans/:userId", requireAuth, async (req, res) => {
    try {
      const { campaignId, userId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Allow owner or assistant GMs to unban
      const canUnban = await storage.isGM(req.session.userId!, campaignId);
      if (!canUnban) {
        return res.status(403).json({ error: "Only GMs can unban players" });
      }

      await storage.unbanMember(campaignId, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to unban player" });
    }
  });

  // Get banned players list (GM/Assistant GM)
  app.get("/api/campaigns/:campaignId/bans", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Allow owner or assistant GMs to view bans
      const canView = await storage.isGM(req.session.userId!, campaignId);
      if (!canView) {
        return res.status(403).json({ error: "Only GMs can view banned players" });
      }

      const bans = await storage.getCampaignBans(campaignId);
      res.json(bans);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch banned players" });
    }
  });

  // GM level-up all characters route (GM/Assistant GM)
  // Only levels up characters where at least one player has edit access
  app.post("/api/campaigns/:campaignId/level-up-all", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Allow owner or assistant GMs
      const canLevelUp = await storage.isGM(req.session.userId, req.params.campaignId);
      if (!canLevelUp) {
        return res.status(403).json({ error: "Only GMs can level up all characters" });
      }
      
      const { mode, targetLevel } = req.body;
      const characters = await storage.getCampaignCharacters(req.params.campaignId);
      
      // Get all campaign members (players) to check for edit access
      const members = await storage.getCampaignMembers(req.params.campaignId);
      const playerUserIds = members.filter(m => m.role === 'player').map(m => m.userId);
      
      const updates = [];
      for (const char of characters) {
        // Check if any player has edit access to this character
        let hasPlayerEditAccess = false;
        
        // Check ownership first - if a player owns this character, they have edit access
        if (char.userId && playerUserIds.includes(char.userId)) {
          hasPlayerEditAccess = true;
        }
        
        // If not owned by a player, check character permissions
        if (!hasPlayerEditAccess) {
          const permissions = await storage.getCharacterPermissions(char.id);
          for (const perm of permissions) {
            if (playerUserIds.includes(perm.userId) && perm.accessLevel === 'edit') {
              hasPlayerEditAccess = true;
              break;
            }
          }
        }
        
        // Only level up if a player has edit access
        if (!hasPlayerEditAccess) {
          continue;
        }
        
        let newLevel = char.level;
        if (mode === 'set' && targetLevel) {
          newLevel = Math.min(20, Math.max(1, targetLevel));
        } else if (mode === 'add') {
          newLevel = Math.min(20, (char.level || 1) + 1);
        }
        
        if (newLevel !== char.level) {
          const updateData: any = { level: newLevel };
          if (campaign.system === 'aa-v2') {
            const oldLevel = char.level || 1;
            let pointsToAdd = 0;
            if (mode === 'add') {
              pointsToAdd = (newLevel % 3 === 0) ? 5 : 3;
            } else if (mode === 'set' && newLevel > oldLevel) {
              for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
                pointsToAdd += (lvl % 3 === 0) ? 5 : 3;
              }
            }
            if (pointsToAdd > 0) {
              updateData.classSkillPoints = (char.classSkillPoints || 0) + pointsToAdd;
            }
          }
          await storage.updateCharacter(char.id, updateData);
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
      
      // GMs (and admins) can see all scenes, players only see active scene
      const isGmForScenes = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGmForScenes) {
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
      
      // Players can view the active scene or scenes linked by map pins
      const isGM = await hasGmAccess(req.session.userId!, scene.campaignId, campaign.gmUserId);
      const isActiveScene = campaign.activeSceneId === scene.id;
      
      if (!isGM && !isActiveScene) {
        // Check if this scene is linked by a map pin on the active scene
        let hasMapPinAccess = false;
        if (campaign.activeSceneId) {
          hasMapPinAccess = false;
        }
        if (!hasMapPinAccess) {
          return res.status(403).json({ error: "Only the GM can view non-active scenes" });
        }
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

      const { _sceneId, ...sceneUpdateData } = req.body;
      if (sceneUpdateData.backgroundImage) {
        console.log(`[Scene Update] Scene ${req.params.sceneId} backgroundImage being set to: ${sceneUpdateData.backgroundImage}`);
      }
      const updatedScene = await storage.updateScene(req.params.sceneId, sceneUpdateData);
      if (sceneUpdateData.backgroundImage) {
        console.log(`[Scene Update] After DB update, scene backgroundImage is: ${updatedScene?.backgroundImage}`);
      }
      
      // Broadcast scene update to all campaign members
      broadcastToCampaign(scene.campaignId, {
        type: "scene_updated",
        scene: updatedScene
      });
      
      res.json(updatedScene);
    } catch (err) {
      console.error("[Scene Update] Error:", err);
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
      broadcastToCampaign(req.params.campaignId, { type: 'campaign_data_changed', entity: 'species', campaignId: req.params.campaignId });
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
      broadcastToCampaign(req.params.campaignId, { type: 'campaign_data_changed', entity: 'species', campaignId: req.params.campaignId });
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
      broadcastToCampaign(req.params.campaignId, { type: 'campaign_data_changed', entity: 'species', campaignId: req.params.campaignId });
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
      broadcastToCampaign(character.campaignId, { type: 'character_updated', characterId: req.params.characterId });
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
      broadcastToCampaign(req.params.campaignId, { type: 'scene_folder_changed' });
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
      broadcastToCampaign(req.params.campaignId, { type: 'scene_folder_changed' });
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
      broadcastToCampaign(req.params.campaignId, { type: 'scene_folder_changed' });
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
      broadcastToCampaign(scene.campaignId, { type: 'scene_folder_changed' });
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
      
      // Fetch scene data to include in broadcast
      let scene = null;
      if (sceneId) {
        scene = await storage.getScene(sceneId);
      }
      
      // Broadcast to WebSocket clients that the active scene has changed
      broadcastToCampaign(req.params.campaignId, {
        type: 'active_scene_changed',
        sceneId: sceneId || null,
        scene
      });
      
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to set active scene" });
    }
  });

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

  // Helper to sanitize user object (exclude password)
  const sanitizeUserForAdmin = (user: any) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    isAdmin: user.isAdmin,
    bannedAt: user.bannedAt,
    banExpiresAt: user.banExpiresAt,
    banReason: user.banReason,
  });

  // Admin broadcast site update to all connected clients
  app.post("/api/admin/broadcast-update", requireAdmin, async (req, res) => {
    try {
      broadcastToAllClients({
        type: "site_update",
        message: "App updated, please refresh to continue using. Failure to do so may cause issues with syncing or other."
      });
      res.json({ success: true, message: "Site update broadcast sent to all connected clients" });
    } catch (err) {
      console.error('[Admin] Error broadcasting site update:', err);
      res.status(500).json({ error: "Failed to broadcast site update" });
    }
  });

  // Admin User Management Routes
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map(sanitizeUserForAdmin));
    } catch (err) {
      console.error('[Admin] Error fetching users:', err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:userId/ban", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason, expiresAt } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const parsedExpiresAt = expiresAt ? new Date(expiresAt) : undefined;
      const updatedUser = await storage.banUser(userId, reason, parsedExpiresAt);
      res.json(sanitizeUserForAdmin(updatedUser));
    } catch (err) {
      console.error('[Admin] Error banning user:', err);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });

  app.post("/api/admin/users/:userId/unban", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const updatedUser = await storage.unbanUser(userId);
      res.json(sanitizeUserForAdmin(updatedUser));
    } catch (err) {
      console.error('[Admin] Error unbanning user:', err);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });

  app.put("/api/admin/users/:userId/ban", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason, expiresAt } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const parsedExpiresAt = expiresAt !== undefined 
        ? (expiresAt ? new Date(expiresAt) : undefined)
        : undefined;
      const updatedUser = await storage.updateBan(userId, reason, parsedExpiresAt);
      res.json(sanitizeUserForAdmin(updatedUser));
    } catch (err) {
      console.error('[Admin] Error updating ban:', err);
      res.status(500).json({ error: "Failed to update ban" });
    }
  });

  app.get("/api/admin/users/:userId/activity", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const activity = await storage.getUserActivity(userId);
      res.json(activity);
    } catch (err) {
      console.error('[Admin] Error fetching user activity:', err);
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  });

  // Admin: Delete user account
  app.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Prevent self-deletion
      if (userId === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.deleteUser(userId);
      console.log(`[Admin] User ${user.email} deleted by admin ${req.session.userId}`);
      res.json({ success: true, message: "User account deleted successfully" });
    } catch (err) {
      console.error('[Admin] Error deleting user:', err);
      res.status(500).json({ error: "Failed to delete user account" });
    }
  });

  // Admin: Send password reset email to user
  app.post("/api/admin/users/:userId/send-password-reset", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Delete any existing reset tokens for this user
      await storage.deleteUserPasswordResetTokens(userId);
      
      // Create new reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt
      });
      
      // Send the email
      const baseUrl = req.protocol + '://' + req.get('host');
      await sendPasswordResetEmail(user.email, resetToken, baseUrl);
      
      console.log(`[Admin] Password reset email sent to ${user.email} by admin ${req.session.userId}`);
      res.json({ success: true, message: "Password reset email sent successfully" });
    } catch (err) {
      console.error('[Admin] Error sending password reset email:', err);
      res.status(500).json({ error: "Failed to send password reset email" });
    }
  });

  app.post("/api/admin/set-admin/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin } = req.body;
      
      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: "isAdmin must be a boolean" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const updatedUser = await storage.setUserAdmin(userId, isAdmin);
      res.json(sanitizeUserForAdmin(updatedUser));
    } catch (err) {
      console.error('[Admin] Error setting admin status:', err);
      res.status(500).json({ error: "Failed to set admin status" });
    }
  });

  // Lightweight summary endpoint for fast item picker loading (must be before :id route)
  app.get("/api/system-items/summary", requireAuth, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const summaries = await storage.getSystemItemSummaries(system);
      console.log('[Summary] System items:', summaries.length);
      res.json(summaries);
    } catch (err) {
      console.error('[Summary] Error fetching system items:', err);
      res.status(500).json({ error: "Failed to fetch item summaries" });
    }
  });

  // Public system item route (read-only for entity references in notes)
  app.get("/api/system-items/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item || !item.isTemplate || item.characterId || item.campaignId) {
        return res.status(404).json({ error: "System item not found" });
      }
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system item" });
    }
  });

  // Lightweight image-only endpoint for lazy loading in item picker
  app.get("/api/items/:id/image", requireAuth, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json({ image: item.image });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch item image" });
    }
  });

  // System item routes (admin only)
  app.get("/api/admin/system-items", requireAdmin, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const items = await storage.getSystemItems(system);
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
      
      if (item.isDetonatable) {
        const existingRolls = await storage.getRollEntries('item', item.id);
        const hasDetonateRoll = existingRolls.some(r => r.name === 'Detonate');
        if (!hasDetonateRoll) {
          await storage.createRollEntry({
            ownerType: 'item', ownerId: item.id, name: 'Detonate',
            rollType: 'damage', isAoe: true, aoeShape: 'sphere', aoeRange: 15,
            diceFormula: '1d6', sortOrder: 0,
          } as any);
        }
      }
      
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
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
      
      if (updatedItem) {
        const existingRolls = await storage.getRollEntries('item', updatedItem.id);
        const detonateRoll = existingRolls.find(r => r.name === 'Detonate');
        if (updatedItem.isDetonatable && !detonateRoll) {
          await storage.createRollEntry({
            ownerType: 'item', ownerId: updatedItem.id, name: 'Detonate',
            rollType: 'damage', isAoe: true, aoeShape: 'sphere', aoeRange: 15,
            diceFormula: '1d6', sortOrder: 0,
          } as any);
        } else if (!updatedItem.isDetonatable && detonateRoll) {
          await storage.deleteRollEntry(detonateRoll.id);
        }
      }
      
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete system item" });
    }
  });

  app.post("/api/admin/system-items/:id/archive", requireAdmin, async (req, res) => {
    try {
      const item = await storage.updateItem(req.params.id, { isArchived: true });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: "Failed to archive item" });
    }
  });

  app.post("/api/admin/system-items/:id/restore", requireAdmin, async (req, res) => {
    try {
      const item = await storage.updateItem(req.params.id, { isArchived: false });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: "Failed to restore item" });
    }
  });

  app.post("/api/admin/system-items/archive-all", requireAdmin, async (req, res) => {
    try {
      const system = req.body.system as string | undefined;
      await storage.archiveAllSystemItems(system);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to archive all items" });
    }
  });

  app.post("/api/admin/system-items/:id/copy-to-system", requireAdmin, async (req, res) => {
    try {
      const { targetSystem } = req.body;
      if (!targetSystem || !['arcana-adventure', 'aa-v2'].includes(targetSystem)) return res.status(400).json({ error: "Invalid targetSystem" });
      const item = await storage.getItem(req.params.id);
      if (!item || !item.isTemplate || item.characterId || item.campaignId) return res.status(404).json({ error: "System item not found" });
      const { id, createdAt, ...itemData } = item as any;
      const newItem = await storage.createItem({ ...itemData, system: targetSystem });
      const sourceRolls = await storage.getRollEntries('item', req.params.id);
      if (sourceRolls.length > 0) {
        await db.insert(rollEntries).values(sourceRolls.map(re => {
          const { id: _id, createdAt: _c, ...reData } = re as any;
          return { ...reData, ownerId: newItem.id };
        }));
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json(newItem);
    } catch (err) {
      res.status(400).json({ error: "Failed to copy item" });
    }
  });

  app.post("/api/admin/system-items/:id/duplicate", requireAdmin, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item || !item.isTemplate) return res.status(404).json({ error: "System item not found" });
      const { id, createdAt, ...itemData } = item as any;
      const newItem = await storage.createItem({ ...itemData, name: `${item.name} (Copy)` });
      const sourceRolls = await storage.getRollEntries('item', req.params.id);
      if (sourceRolls.length > 0) {
        await db.insert(rollEntries).values(sourceRolls.map(re => {
          const { id: _id, createdAt: _c, ...reData } = re as any;
          return { ...reData, ownerId: newItem.id };
        }));
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json(newItem);
    } catch (err) {
      res.status(400).json({ error: "Failed to duplicate item" });
    }
  });

  app.get("/api/admin/archived-items", requireAdmin, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const archivedItems = await storage.getArchivedSystemItems(system);
      res.json(archivedItems);
    } catch (err: any) {
      console.error("Failed to fetch archived items:", err?.message || err);
      res.status(500).json({ error: "Failed to fetch archived items" });
    }
  });

  app.post("/api/admin/system-spells/:id/archive", requireAdmin, async (req, res) => {
    try {
      const spell = await storage.updateSystemSpell(req.params.id, { isArchived: true });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to archive spell" });
    }
  });

  app.post("/api/admin/system-spells/:id/restore", requireAdmin, async (req, res) => {
    try {
      const spell = await storage.updateSystemSpell(req.params.id, { isArchived: false });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to restore spell" });
    }
  });

  app.post("/api/admin/system-spells/archive-all", requireAdmin, async (req, res) => {
    try {
      const system = req.body.system as string | undefined;
      await storage.archiveAllSystemSpells(system);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to archive all spells" });
    }
  });

  app.get("/api/admin/archived-spells", requireAdmin, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const archivedSpells = await storage.getArchivedSystemSpells(system);
      res.json(archivedSpells);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch archived spells" });
    }
  });

  // Bulk item operations
  app.post("/api/admin/system-items/bulk-archive", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No item IDs provided" });
      for (const id of ids) {
        await storage.updateItem(id, { isArchived: true });
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: "Failed to bulk archive items" });
    }
  });

  app.post("/api/admin/system-items/bulk-restore", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No item IDs provided" });
      for (const id of ids) {
        await storage.updateItem(id, { isArchived: false });
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: "Failed to bulk restore items" });
    }
  });

  app.post("/api/admin/system-items/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No item IDs provided" });
      for (const id of ids) {
        await storage.deleteItem(id);
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-items' });
      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: "Failed to bulk delete items" });
    }
  });

  app.post("/api/admin/system-spells/bulk-archive", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No spell IDs provided" });
      for (const id of ids) {
        await storage.updateSystemSpell(id, { isArchived: true });
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: "Failed to bulk archive spells" });
    }
  });

  app.post("/api/admin/system-spells/bulk-restore", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No spell IDs provided" });
      for (const id of ids) {
        await storage.updateSystemSpell(id, { isArchived: false });
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: "Failed to bulk restore spells" });
    }
  });

  app.post("/api/admin/system-spells/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No spell IDs provided" });
      for (const id of ids) {
        await storage.deleteSystemSpell(id);
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json({ success: true, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: "Failed to bulk delete spells" });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-species' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-species' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-species' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-templates' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-templates' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-templates' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete feat template" });
    }
  });

  // ==================== CLASS ROUTES (AA V2) ====================

  app.get("/api/admin/classes", requireAdmin, async (req, res) => {
    try {
      const system = (req.query.system as string) || 'aa-v2';
      const result = await storage.getClasses(system);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.post("/api/admin/classes", requireAdmin, async (req, res) => {
    try {
      const newClass = await storage.createClass(req.body);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json(newClass);
    } catch (err) {
      res.status(400).json({ error: "Failed to create class" });
    }
  });

  app.patch("/api/admin/classes/:id", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateClass(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Class not found" });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update class" });
    }
  });

  app.delete("/api/admin/classes/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteClass(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete class" });
    }
  });

  app.get("/api/admin/classes/:id/nodes", requireAdmin, async (req, res) => {
    try {
      const nodes = await storage.getClassSkillNodes(req.params.id);
      res.json(nodes);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch class skill nodes" });
    }
  });

  app.post("/api/admin/classes/:id/nodes", requireAdmin, async (req, res) => {
    try {
      const node = await storage.createClassSkillNode({ ...req.body, classId: req.params.id });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json(node);
    } catch (err) {
      res.status(400).json({ error: "Failed to create class skill node" });
    }
  });

  app.patch("/api/admin/classes/:id/nodes/:nodeId", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateClassSkillNode(req.params.nodeId, req.body);
      if (!updated) return res.status(404).json({ error: "Node not found" });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to update class skill node" });
    }
  });

  app.delete("/api/admin/classes/:id/nodes/:nodeId", requireAdmin, async (req, res) => {
    try {
      await storage.deleteClassSkillNode(req.params.nodeId);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete class skill node" });
    }
  });

  app.get("/api/admin/classes/:id/connections", requireAdmin, async (req, res) => {
    try {
      const connections = await storage.getClassSkillConnections(req.params.id);
      res.json(connections);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch class skill connections" });
    }
  });

  app.post("/api/admin/classes/:id/connections", requireAdmin, async (req, res) => {
    try {
      const connection = await storage.createClassSkillConnection({ ...req.body, classId: req.params.id });
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json(connection);
    } catch (err) {
      res.status(400).json({ error: "Failed to create class skill connection" });
    }
  });

  app.delete("/api/admin/classes/:id/connections/:connectionId", requireAdmin, async (req, res) => {
    try {
      await storage.deleteClassSkillConnection(req.params.connectionId);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'classes' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete class skill connection" });
    }
  });

  app.get("/api/classes", requireAuth, async (req, res) => {
    try {
      const system = (req.query.system as string) || 'aa-v2';
      const result = await storage.getClasses(system);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.get("/api/classes/:classId/nodes", requireAuth, async (req, res) => {
    try {
      const nodes = await storage.getClassSkillNodes(req.params.classId);
      res.json(nodes);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch class nodes" });
    }
  });

  app.get("/api/classes/:classId/connections", requireAuth, async (req, res) => {
    try {
      const connections = await storage.getClassSkillConnections(req.params.classId);
      res.json(connections);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch class connections" });
    }
  });

  app.get("/api/characters/:id/classes", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'view');
      if (!access.allowed) return res.status(403).json({ error: "No access" });

      const charClasses = await storage.getCharacterClasses(req.params.id);
      const enriched = await Promise.all(charClasses.map(async (cc) => {
        const skills = await storage.getCharacterClassSkills(req.params.id, cc.classId);
        const nodes = await storage.getClassSkillNodes(cc.classId);
        const spentPoints = skills.reduce((sum, s) => {
          const node = nodes.find(n => n.id === s.nodeId);
          return sum + (node?.cost || 0);
        }, 0);
        return {
          ...cc,
          unlockedNodes: skills.map(s => s.nodeId),
          spentPoints,
        };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character classes" });
    }
  });

  app.post("/api/characters/:id/classes", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      const isAdmin = await isAdminUser(req.session.userId);
      if (!access.isGM && !isAdmin) return res.status(403).json({ error: "Only GMs can add classes" });

      if (access.character?.campaignId) {
        const campaign = await storage.getCampaign(access.character.campaignId);
        if (campaign && campaign.system !== 'aa-v2') {
          return res.status(400).json({ error: "Classes are only available for A.A. V2 campaigns" });
        }
      }

      const charClass = await storage.createCharacterClass({
        characterId: req.params.id,
        classId: req.body.classId,
        classLevel: 1,
        classPoints: 0,
      });

      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "character_class_updated",
          characterId: req.params.id,
        });
      }
      res.json(charClass);
    } catch (err) {
      res.status(400).json({ error: "Failed to add class to character" });
    }
  });

  app.delete("/api/characters/:id/classes/:charClassId", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      const isAdmin = await isAdminUser(req.session.userId);
      if (!access.isGM && !isAdmin) return res.status(403).json({ error: "Only GMs can remove classes" });

      const charClasses = await storage.getCharacterClasses(req.params.id);
      const charClass = charClasses.find(cc => cc.id === req.params.charClassId);
      if (!charClass) return res.status(404).json({ error: "Character class not found" });

      await storage.deleteCharacterClass(req.params.charClassId);

      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "character_class_updated",
          characterId: req.params.id,
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to remove class from character" });
    }
  });

  app.post("/api/characters/:id/classes/:charClassId/level-up", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      const isAdmin = await isAdminUser(req.session.userId);
      if (!access.isGM && !isAdmin) return res.status(403).json({ error: "Only GMs can level up classes" });

      const charClasses = await storage.getCharacterClasses(req.params.id);
      const charClass = charClasses.find(cc => cc.id === req.params.charClassId);
      if (!charClass) return res.status(404).json({ error: "Character class not found" });

      const newLevel = charClass.classLevel + 1;
      const totalPoints = 3 * newLevel + 2 * Math.floor(newLevel / 3);
      const spentNodes = await storage.getCharacterClassSkills(req.params.id, charClass.classId);
      const nodes = await storage.getClassSkillNodes(charClass.classId);
      const spentPoints = spentNodes.reduce((sum, s) => {
        const node = nodes.find(n => n.id === s.nodeId);
        return sum + (node?.cost || 0);
      }, 0);
      const availablePoints = totalPoints - spentPoints;

      const updated = await storage.updateCharacterClass(charClass.id, {
        classLevel: newLevel,
        classPoints: availablePoints,
      });

      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "character_class_updated",
          characterId: req.params.id,
        });
      }
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: "Failed to level up class" });
    }
  });

  app.post("/api/characters/:id/classes/:classId/nodes/:nodeId/unlock", requireAuth, async (req, res) => {
    try {
      const access = await checkCharacterAccess(req.params.id, req.session.userId!, 'edit');
      if (!access.allowed) return res.status(403).json({ error: "No edit access" });

      const node = await storage.getClassSkillNode(req.params.nodeId);
      if (!node) return res.status(404).json({ error: "Node not found" });
      if (node.classId !== req.params.classId) return res.status(400).json({ error: "Node does not belong to this class" });

      const charClasses = await storage.getCharacterClasses(req.params.id);
      let charClass = charClasses.find(cc => cc.classId === req.params.classId);
      if (!charClass) {
        charClass = await storage.createCharacterClass({
          characterId: req.params.id,
          classId: req.params.classId,
          classLevel: 1,
          classPoints: 0,
        });
      }

      const existingSkills = await storage.getCharacterClassSkills(req.params.id, req.params.classId);
      if (existingSkills.some(s => s.nodeId === req.params.nodeId)) {
        return res.status(400).json({ error: "Node already unlocked" });
      }

      const connections = await storage.getClassSkillConnections(req.params.classId);
      const prereqConnections = connections.filter(c => c.toNodeId === req.params.nodeId);
      for (const conn of prereqConnections) {
        if (!existingSkills.some(s => s.nodeId === conn.fromNodeId)) {
          return res.status(400).json({ error: "Prerequisites not met" });
        }
      }

      const character = await storage.getCharacter(req.params.id);
      if (!character) return res.status(404).json({ error: "Character not found" });

      const globalPoints = character.classSkillPoints || 0;
      if (node.cost > globalPoints) {
        return res.status(400).json({ error: "Not enough class points" });
      }

      await storage.createCharacterClassSkill({
        characterId: req.params.id,
        classId: req.params.classId,
        nodeId: req.params.nodeId,
      });

      await storage.updateCharacter(req.params.id, {
        classSkillPoints: globalPoints - node.cost,
      });

      const allNodes = await storage.getClassSkillNodes(req.params.classId);
      const existingSkillsAfter = await storage.getCharacterClassSkills(req.params.id, req.params.classId);
      const spentInClass = existingSkillsAfter.reduce((sum, s) => {
        const n = allNodes.find(an => an.id === s.nodeId);
        return sum + (n?.cost || 0);
      }, 0);
      const perClassTotal = 3 * charClass.classLevel + 2 * Math.floor(charClass.classLevel / 3);
      await storage.updateCharacterClass(charClass.id, { classPoints: perClassTotal - spentInClass });

      const effects = (node.effects as any[]) || [];
      const charUpdates: Record<string, any> = {};
      if (effects.length > 0) {
        const char = await storage.getCharacter(req.params.id);
        if (char) {
          for (const effect of effects) {
            if (effect.type === 'hp_bonus' && effect.value) {
              charUpdates.maxHp = (charUpdates.maxHp ?? (char.maxHp || 0)) + Number(effect.value);
              charUpdates.hp = (charUpdates.hp ?? (char.hp || 0)) + Number(effect.value);
            } else if (effect.type === 'energy_increase' && effect.value) {
              charUpdates.maxEnergy = (charUpdates.maxEnergy ?? (char.maxEnergy || 0)) + Number(effect.value);
              charUpdates.energy = (charUpdates.energy ?? (char.energy || 0)) + Number(effect.value);
            } else if (effect.type === 'mana_increase' && effect.value) {
              charUpdates.maxMana = (charUpdates.maxMana ?? (char.maxMana || 0)) + Number(effect.value);
              charUpdates.mana = (charUpdates.mana ?? (char.mana || 0)) + Number(effect.value);
            } else if (effect.type === 'attribute_bonus' && effect.attribute && effect.value) {
              const attrMap: Record<string, string> = { might: 'might', finesse: 'finesse', wit: 'wit', presence: 'presence', will: 'will', craft: 'craft' };
              const field = attrMap[effect.attribute];
              if (field) {
                charUpdates[field] = (charUpdates[field] ?? ((char as any)[field] || 0)) + Number(effect.value);
              }
            } else if (effect.type === 'skill_bonus' && effect.target && effect.value) {
              const skillFields = ['skillAgility','skillArcana','skillCharisma','skillConcentration','skillDeception','skillHistory','skillIntimidation','skillInvestigation','skillMedicine','skillPerception','skillSleightOfHand','skillStealth','skillStrength','skillWisdom','skillCulture'];
              const field = skillFields.find(f => f.toLowerCase() === `skill${effect.target}`.toLowerCase());
              if (field) {
                charUpdates[field] = (charUpdates[field] ?? ((char as any)[field] || 0)) + Number(effect.value);
              }
            }
          }
        }
      }
      if (Object.keys(charUpdates).length > 0) {
        await storage.updateCharacter(req.params.id, charUpdates);
      }

      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
          type: "character_class_updated",
          characterId: req.params.id,
        });
        if (Object.keys(charUpdates).length > 0) {
          const updatedChar = await storage.getCharacter(req.params.id);
          broadcastToCampaign(access.character.campaignId, {
            type: "character_updated",
            characterId: req.params.id,
            character: updatedChar,
          });
        }
      }

      res.json({ success: true, pointsRemaining: globalPoints - node.cost });
    } catch (err) {
      console.error("Unlock node error:", err);
      res.status(400).json({ error: "Failed to unlock node" });
    }
  });

  // ==================== FEAT TREE ROUTES ====================

  app.get("/api/admin/feat-trees", requireAdmin, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const trees = await storage.getFeatTrees(system);
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-trees' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-trees' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-trees' });
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
      
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feats' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feats' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feats' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-connections' });
      res.json(connection);
    } catch (err) {
      res.status(400).json({ error: "Failed to create connection" });
    }
  });

  // Delete a connection
  app.delete("/api/admin/feat-connections/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteFeatConnection(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'feat-connections' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete connection" });
    }
  });

  // Public feat tree route (for character sheet)
  app.get("/api/feat-trees", requireAuth, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const trees = await storage.getFeatTrees(system);
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
      
      // Check for assistant_gm role
      const membership = await storage.getCampaignMembership(req.session.userId!, character.campaignId);
      const isAssistantGM = membership?.role === 'assistant_gm';
      
      // Check for edit permission on this character
      const permission = await storage.getCharacterPermission(req.params.id, req.session.userId!);
      const hasEditAccess = permission?.accessLevel === 'edit';
      
      if (!isOwner && !isGM && !isAssistantGM && !hasEditAccess) {
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
      
      const level = character.level || 1;
      let isAAV2System = false;
      if (character.campaignId) {
        const campaign = await storage.getCampaign(character.campaignId);
        if (campaign?.system === 'aa-v2') isAAV2System = true;
      }
      const totalFeatPoints = isAAV2System ? level : (2 + level + (2 * Math.floor(level / 3)));
      
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
      const system = req.query.system as string | undefined;
      const spellList = await storage.getSystemSpells(system);
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json(spell);
    } catch (err) {
      res.status(400).json({ error: "Failed to update spell" });
    }
  });

  app.delete("/api/admin/spells/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSystemSpell(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete spell" });
    }
  });

  app.post("/api/admin/spells/:id/copy-to-system", requireAdmin, async (req, res) => {
    try {
      const { targetSystem } = req.body;
      if (!targetSystem || !['arcana-adventure', 'aa-v2'].includes(targetSystem)) return res.status(400).json({ error: "Invalid targetSystem" });
      const spell = await storage.getSystemSpell(req.params.id);
      if (!spell) return res.status(404).json({ error: "Spell not found" });
      const { id, createdAt, ...spellData } = spell as any;
      const newSpell = await storage.createSystemSpell({ ...spellData, system: targetSystem });
      const sourceRolls = await storage.getRollEntries('spell', req.params.id);
      if (sourceRolls.length > 0) {
        await db.insert(rollEntries).values(sourceRolls.map(re => {
          const { id: _id, createdAt: _c, ...reData } = re as any;
          return { ...reData, ownerId: newSpell.id };
        }));
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json(newSpell);
    } catch (err) {
      res.status(400).json({ error: "Failed to copy spell" });
    }
  });

  app.post("/api/admin/spells/:id/duplicate", requireAdmin, async (req, res) => {
    try {
      const spell = await storage.getSystemSpell(req.params.id);
      if (!spell) return res.status(404).json({ error: "Spell not found" });
      const { id, createdAt, ...spellData } = spell as any;
      const newSpell = await storage.createSystemSpell({ ...spellData, name: `${spell.name} (Copy)` });
      const sourceRolls = await storage.getRollEntries('spell', req.params.id);
      if (sourceRolls.length > 0) {
        await db.insert(rollEntries).values(sourceRolls.map(re => {
          const { id: _id, createdAt: _c, ...reData } = re as any;
          return { ...reData, ownerId: newSpell.id };
        }));
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-spells' });
      res.json(newSpell);
    } catch (err) {
      res.status(400).json({ error: "Failed to duplicate spell" });
    }
  });

  // System Skills routes (admin)
  app.get("/api/admin/skills", requireAdmin, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const skills = await storage.getSystemSkills(system);
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'skills' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'skills' });
      res.json(skill);
    } catch (err) {
      res.status(400).json({ error: "Failed to update skill" });
    }
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSystemSkill(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'skills' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-templates' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-templates' });
      res.json(template);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character template" });
    }
  });

  app.delete("/api/admin/character-templates/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteCharacterTemplate(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-templates' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete character template" });
    }
  });

  // Save a campaign character to the admin template library (admin only)
  app.post("/api/admin/character-templates/from-character/:characterId", requireAdmin, async (req, res) => {
    try {
      const { folderId } = req.body;
      const template = await storage.copyCharacterToAdminLibrary(req.params.characterId, folderId || null);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-templates' });
      res.json(template);
    } catch (err: any) {
      console.error('[Admin] Failed to copy character to library:', err);
      res.status(400).json({ error: err.message || "Failed to save character to admin library" });
    }
  });

  // Character Template Folder routes (admin)
  app.get("/api/admin/character-template-folders", requireAdmin, async (req, res) => {
    try {
      const folders = await storage.getCharacterTemplateFolders();
      res.json(folders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch character template folders" });
    }
  });

  app.post("/api/admin/character-template-folders", requireAdmin, async (req, res) => {
    try {
      const folder = await storage.createCharacterTemplateFolder(req.body);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-template-folders' });
      res.json(folder);
    } catch (err) {
      res.status(400).json({ error: "Failed to create character template folder" });
    }
  });

  app.patch("/api/admin/character-template-folders/:id", requireAdmin, async (req, res) => {
    try {
      const folder = await storage.updateCharacterTemplateFolder(req.params.id, req.body);
      if (!folder) {
        return res.status(404).json({ error: "Character template folder not found" });
      }
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-template-folders' });
      res.json(folder);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character template folder" });
    }
  });

  app.delete("/api/admin/character-template-folders/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteCharacterTemplateFolder(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'character-template-folders' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete character template folder" });
    }
  });

  // Admin notification routes
  app.get("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const notifications = await storage.getRecentNotifications(limit);
      res.json(notifications);
    } catch (err) {
      console.error('Error fetching admin notifications:', err);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const { title, message, patchNotes } = req.body;
      
      if (!title || !message) {
        return res.status(400).json({ error: "Title and message are required" });
      }
      
      const notification = await storage.createAdminNotification({
        title,
        message,
        patchNotes: patchNotes || null,
        createdBy: req.session.userId!,
      });
      
      // Create individual notifications for all users
      const allUsers = await storage.getAllUsers();
      const fullMessage = patchNotes ? `${message}\n\nPatch Notes:\n${patchNotes}` : message;
      for (const user of allUsers) {
        await storage.createUserNotification({
          userId: user.id,
          type: 'system',
          title,
          message: fullMessage,
          referenceId: notification.id,
          isRead: false,
        });
      }
      
      // Broadcast to all connected clients for real-time update
      broadcastToAllClients({
        type: 'admin_notification',
        title: notification.title,
        message: notification.message,
        patchNotes: notification.patchNotes,
      });
      
      res.json(notification);
    } catch (err) {
      console.error('Error creating admin notification:', err);
      res.status(500).json({ error: "Failed to create notification" });
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

  // Get importable characters from other campaigns where user is GM
  app.get("/api/campaigns/:campaignId/importable-characters", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session.userId!;
      
      // Verify user is GM of the target campaign
      const targetCampaign = await storage.getCampaign(campaignId);
      if (!targetCampaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const isGm = await storage.isGM(userId, campaignId);
      if (!isGm) {
        return res.status(403).json({ error: "Only GMs can import characters" });
      }
      
      // Get all campaigns where user is owner or assistant_gm
      const { created, joined } = await storage.getUserCampaigns(userId);
      const gmCampaigns: typeof created = [];
      
      // Add campaigns user created (owner)
      for (const campaign of created) {
        if (campaign.id !== campaignId) {
          gmCampaigns.push(campaign);
        }
      }
      
      // Add campaigns where user is assistant_gm
      for (const campaign of joined) {
        if (campaign.id !== campaignId) {
          const membership = await storage.getCampaignMembership(userId, campaign.id);
          if (membership?.role === 'assistant_gm' || campaign.gmUserId === userId) {
            gmCampaigns.push(campaign);
          }
        }
      }
      
      // Get characters from each campaign
      const result: { campaign: typeof targetCampaign, characters: any[] }[] = [];
      for (const campaign of gmCampaigns) {
        const characters = await storage.getCampaignCharacters(campaign.id);
        if (characters.length > 0) {
          result.push({ campaign, characters });
        }
      }
      
      res.json(result);
    } catch (err) {
      console.error('Error fetching importable characters:', err);
      res.status(500).json({ error: "Failed to fetch importable characters" });
    }
  });

  // Import character from another campaign
  app.post("/api/campaigns/:campaignId/import-character", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { sourceCharacterId } = req.body;
      const userId = req.session.userId!;
      
      if (!sourceCharacterId) {
        return res.status(400).json({ error: "sourceCharacterId is required" });
      }
      
      // Verify user is GM of the target campaign
      const targetCampaign = await storage.getCampaign(campaignId);
      if (!targetCampaign) {
        return res.status(404).json({ error: "Target campaign not found" });
      }
      
      const isTargetGm = await storage.isGM(userId, campaignId);
      if (!isTargetGm) {
        return res.status(403).json({ error: "Only GMs can import characters to this campaign" });
      }
      
      // Get the source character and verify GM access to source campaign
      const sourceCharacter = await storage.getCharacter(sourceCharacterId);
      if (!sourceCharacter) {
        return res.status(404).json({ error: "Source character not found" });
      }
      
      if (!sourceCharacter.campaignId) {
        return res.status(400).json({ error: "Source character is not in a campaign" });
      }
      
      const isSourceGm = await storage.isGM(userId, sourceCharacter.campaignId);
      if (!isSourceGm) {
        return res.status(403).json({ error: "You must be a GM in the source campaign to import characters" });
      }
      
      // Perform the import (userId null for GM to assign later)
      const importedCharacter = await storage.importCharacterToCampaign(
        sourceCharacterId,
        campaignId,
        null
      );
      
      // Broadcast to target campaign
      broadcastToCampaign(campaignId, {
        type: "character_added",
        character: importedCharacter
      });
      
      res.json(importedCharacter);
    } catch (err) {
      console.error('Error importing character:', err);
      res.status(400).json({ error: "Failed to import character" });
    }
  });

  // Public system skills route (for character sheet)
  app.get("/api/skills", requireAuth, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const skills = await storage.getSystemSkills(system);
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // Check if user is admin (admins can add custom skills to any character)
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      
      if (!access.isGM && !userIsAdmin) {
        return res.status(403).json({ error: "Only the GM can add custom skills" });
      }
      
      const skill = await storage.addCharacterCustomSkill({
        ...req.body,
        characterId: req.params.characterId
      });
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      if (!access.character) return res.status(404).json({ error: "Character not found" });
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      const character = access.character;
      const isPlayerValueOnly = !access.isGM && !userIsAdmin;
      if (isPlayerValueOnly) {
        const allowedKeys = Object.keys(req.body);
        const onlyValue = allowedKeys.length === 1 && allowedKeys[0] === 'value';
        if (!onlyValue) return res.status(403).json({ error: "Only the GM can edit custom skill properties" });
      }
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      if (!access.character) return res.status(404).json({ error: "Character not found" });
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      if (!access.isGM && !userIsAdmin) return res.status(403).json({ error: "Only the GM can remove custom skills" });
      const character = access.character;
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
      const system = req.query.system as string | undefined;
      const traits = await storage.getSystemTraits(system);
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-traits' });
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
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-traits' });
      res.json(trait);
    } catch (err) {
      res.status(400).json({ error: "Failed to update trait" });
    }
  });

  app.delete("/api/admin/traits/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteSystemTrait(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'system-traits' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Failed to delete trait" });
    }
  });

  // Public system traits route (for character sheet)
  app.get("/api/traits", requireAuth, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const traits = await storage.getSystemTraits(system);
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      
      if (!access.character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // Check if user is admin (admins can add traits to any character)
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      
      if (!access.isGM && !userIsAdmin) {
        return res.status(403).json({ error: "Only the GM can add traits" });
      }
      
      const trait = await storage.addCharacterTrait({
        ...req.body,
        characterId: req.params.characterId
      });
      
      if (access.character?.campaignId) {
        broadcastToCampaign(access.character.campaignId, {
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      if (!access.character) return res.status(404).json({ error: "Character not found" });
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      if (!access.isGM && !userIsAdmin) return res.status(403).json({ error: "Only the GM can edit traits" });
      const character = access.character;
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
      const access = await checkCharacterAccess(req.params.characterId, req.session.userId!, 'edit');
      if (!access.character) return res.status(404).json({ error: "Character not found" });
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      if (!access.isGM && !userIsAdmin) return res.status(403).json({ error: "Only the GM can remove traits" });
      const character = access.character;
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
      const system = req.query.system as string | undefined;
      const spellList = await storage.getSystemSpells(system);
      res.json(spellList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch spells" });
    }
  });

  // Public system items route (for feat effects item picker)
  app.get("/api/system-items", requireAuth, async (req, res) => {
    try {
      const system = req.query.system as string | undefined;
      const itemList = await storage.getSystemItems(system);
      res.json(itemList);
    } catch (err) {
      console.error('[system-items] Error fetching system items:', err);
      res.status(500).json({ error: "Failed to fetch system items" });
    }
  });

  // Get all characters the user has access to (for notes graph)
  app.get("/api/my-characters", requireAuth, async (req, res) => {
    try {
      const characters = await storage.getUserAccessibleCharacters(req.session.userId!);
      res.json(characters);
    } catch (err) {
      console.error('[my-characters] Error fetching user characters:', err);
      res.status(500).json({ error: "Failed to fetch characters" });
    }
  });

  // Lightweight template summary endpoint for campaign item picker
  app.get("/api/campaigns/:campaignId/template-items/summary", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Get lightweight summaries for both campaign and system items
      // Pass userId to include GM's library items across all their campaigns
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      const [campaignItems, systemItems] = await Promise.all([
        storage.getCampaignItemSummaries(req.params.campaignId, isGM ? req.session.userId : undefined),
        storage.getSystemItemSummaries(campaign.system)
      ]);
      
      console.log('[Summary] Campaign items:', campaignItems.length, ', System items:', systemItems.length);
      res.json({ campaignItems, systemItems });
    } catch (err) {
      console.error('[Summary] Error fetching template items:', err);
      res.status(500).json({ error: "Failed to fetch template item summaries" });
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
      // Pass userId to include GM's library items across all their campaigns
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      const [campaignItems, systemItems] = await Promise.all([
        storage.getCampaignTemplateItems(req.params.campaignId, isGM ? req.session.userId : undefined),
        storage.getSystemItems(campaign.system)
      ]);
      
      res.json({ campaignItems, systemItems });
    } catch (err) {
      console.error("Failed to fetch template items:", err);
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
        campaignId: req.params.campaignId,
        createdByUserId: req.session.userId, // Track which GM created this item
      });
      const item = await storage.createItem(itemData);
      
      if (item.isDetonatable) {
        const existingRolls = await storage.getRollEntries('item', item.id);
        const hasDetonateRoll = existingRolls.some(r => r.name === 'Detonate');
        if (!hasDetonateRoll) {
          await storage.createRollEntry({
            ownerType: 'item', ownerId: item.id, name: 'Detonate',
            rollType: 'damage', isAoe: true, aoeShape: 'sphere', aoeRange: 15,
            diceFormula: '1d6', sortOrder: 0,
          } as any);
        }
      }
      
      broadcastToCampaign(req.params.campaignId, { type: 'campaign_data_changed', entity: 'template-items', campaignId: req.params.campaignId });
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
      
      if (updatedItem) {
        const existingRolls = await storage.getRollEntries('item', updatedItem.id);
        const detonateRoll = existingRolls.find(r => r.name === 'Detonate');
        if (updatedItem.isDetonatable && !detonateRoll) {
          await storage.createRollEntry({
            ownerType: 'item', ownerId: updatedItem.id, name: 'Detonate',
            rollType: 'damage', isAoe: true, aoeShape: 'sphere', aoeRange: 15,
            diceFormula: '1d6', sortOrder: 0,
          } as any);
        } else if (!updatedItem.isDetonatable && detonateRoll) {
          await storage.deleteRollEntry(detonateRoll.id);
        }
      }
      
      broadcastToCampaign(req.params.campaignId, { type: 'campaign_data_changed', entity: 'template-items', campaignId: req.params.campaignId });
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
      broadcastToCampaign(req.params.campaignId, { type: 'campaign_data_changed', entity: 'template-items', campaignId: req.params.campaignId });
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
      
      // Check if user is admin (admins can add items to any character)
      const user = await storage.getUser(req.session.userId!);
      const userIsAdmin = user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
      
      // Adding items requires owner, GM, or admin access (edit access alone is not sufficient)
      if (!access.isOwner && !access.isGM && !userIsAdmin) {
        return res.status(403).json({ error: "Only the character owner or GM can add items" });
      }

      const sourceTemplateId = req.body.sourceTemplateId;

      const itemData = insertItemSchema.parse({
        ...req.body,
        characterId: req.params.characterId
      });

      const item = await storage.createItem(itemData);

      if (sourceTemplateId) {
        try {
          const templateRolls = await storage.getRollEntries('item', sourceTemplateId);
          for (const roll of templateRolls) {
            await storage.createRollEntry({
              ownerType: 'item',
              ownerId: item.id,
              name: roll.name,
              rollType: roll.rollType,
              diceFormula: roll.diceFormula,
              mod: roll.mod,
              damageType: roll.damageType,
              attribute: roll.attribute,
              applyToStat: roll.applyToStat,
              sortOrder: roll.sortOrder,
              range: roll.range,
              aoeShape: roll.aoeShape,
              aoeRange: roll.aoeRange,
              requiresSave: roll.requiresSave,
              saveAttribute: roll.saveAttribute,
              saveDc: roll.saveDc,
              saveSuccessEffect: roll.saveSuccessEffect,
              saveDcType: roll.saveDcType,
              saveDcAttribute: roll.saveDcAttribute,
              statDirection: roll.statDirection,
              gainEnergy: roll.gainEnergy,
              isAttack: roll.isAttack,
              isAoe: roll.isAoe,
              passesThroughWalls: roll.passesThroughWalls,
              primaryColor: roll.primaryColor,
              requiresEnergy: roll.requiresEnergy,
              energyCost: roll.energyCost,
              noRoll: roll.noRoll,
              enableChatMessage: roll.enableChatMessage,
              chatMessage: roll.chatMessage,
              applyTokenEffects: roll.applyTokenEffects,
              tokenEffectIds: roll.tokenEffectIds,
              effectTriggerCondition: roll.effectTriggerCondition,
              isHidden: roll.isHidden,
              requiredSkillId: roll.requiredSkillId,
              requiredSkillValue: roll.requiredSkillValue,
            } as any);
          }
        } catch (rollErr) {
          console.error('Failed to copy roll entries from template item:', rollErr);
        }
      }
      
      if (item.isDetonatable) {
        const existingRolls = await storage.getRollEntries('item', item.id);
        const hasDetonateRoll = existingRolls.some(r => r.name === 'Detonate');
        if (!hasDetonateRoll) {
          await storage.createRollEntry({
            ownerType: 'item', ownerId: item.id, name: 'Detonate',
            rollType: 'damage', isAoe: true, aoeShape: 'sphere', aoeRange: 15,
            diceFormula: '1d6', sortOrder: 0,
          } as any);
        }
      }
      
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

      const existingRolls = await storage.getRollEntries('item', updatedItem.id);
      const detonateRoll = existingRolls.find(r => r.name === 'Detonate');
      if (updatedItem.isDetonatable && !detonateRoll) {
        await storage.createRollEntry({
          ownerType: 'item', ownerId: updatedItem.id, name: 'Detonate',
          rollType: 'damage', isAoe: true, aoeShape: 'sphere', aoeRange: 15,
          diceFormula: '1d6', sortOrder: 0,
        } as any);
      } else if (!updatedItem.isDetonatable && detonateRoll) {
        await storage.deleteRollEntry(detonateRoll.id);
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
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      
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
      if (!["none", "name", "view", "edit"].includes(accessLevel)) {
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
      
      // Broadcast permission update to ALL campaign members via WebSocket
      // All clients need to refresh their view since character visibility may have changed
      const campaignId = character.campaignId;
      console.log(`[Permission Update] Broadcasting to campaign: ${campaignId}, character: ${character.name}, target: ${req.params.userId}, level: ${accessLevel}`);
      
      broadcastToCampaign(campaignId, {
        type: 'permission_update',
        campaignId,
        characterId: req.params.id,
        characterName: character.name,
        targetUserId: req.params.userId,
        accessLevel,
      });
      
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to set permission" });
    }
  });

  // Bulk set permissions for all players in a campaign
  app.put("/api/characters/:id/permissions/all", requireAuth, async (req, res) => {
    try {
      const { accessLevel } = req.body;
      console.log(`[Bulk Permission Update] Request for character ${req.params.id}, accessLevel: ${accessLevel}`);
      
      if (!["none", "name", "view", "edit"].includes(accessLevel)) {
        return res.status(400).json({ error: "Invalid access level" });
      }
      
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        console.log(`[Bulk Permission Update] Character not found: ${req.params.id}`);
        return res.status(404).json({ error: "Character not found" });
      }
      
      const campaign = await storage.getCampaign(character.campaignId);
      const requestingUser = await storage.getUser(req.session.userId!);
      const isAdmin = requestingUser?.isAdmin === true;
      
      if (!campaign || (campaign.gmUserId !== req.session.userId && !isAdmin)) {
        console.log(`[Bulk Permission Update] Access denied - userId: ${req.session.userId}, gmUserId: ${campaign?.gmUserId}, isAdmin: ${isAdmin}`);
        return res.status(403).json({ error: "Only GMs can set character permissions" });
      }
      
      // Get all campaign members (excluding the GM)
      const members = await storage.getCampaignMembers(character.campaignId);
      const nonGmMembers = members.filter(m => m.userId !== campaign.gmUserId);
      
      // Set permission for each player
      let updated = 0;
      for (const member of nonGmMembers) {
        // Skip the character owner (they always have full access)
        if (member.userId === character.userId) continue;
        
        await storage.setCharacterPermission(req.params.id, member.userId, accessLevel);
        updated++;
        
        // Broadcast permission update to each player
        broadcastToCampaign(character.campaignId, {
          type: 'permission_update',
          campaignId: character.campaignId,
          characterId: req.params.id,
          characterName: character.name,
          targetUserId: member.userId,
          accessLevel,
        });
      }
      
      console.log(`[Bulk Permission Update] Set ${accessLevel} for ${updated} players on character: ${character.name}`);
      
      res.json({ updated });
    } catch (e) {
      console.error("Failed to set bulk permissions:", e);
      res.status(500).json({ error: "Failed to set permissions for all players" });
    }
  });

  // Initiative Tracking routes
  app.get("/api/campaigns/:campaignId/initiative", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      const entries = await storage.getCampaignInitiative(req.params.campaignId);
      
      // If not GM, filter out hidden entries
      const visibleEntries = isGM ? entries : entries.filter(e => !e.isHidden);
      
      res.json({
        entries: visibleEntries,
        inCombat: campaign.inCombat,
        currentTurnCharacterId: campaign.currentTurnCharacterId
      });
    } catch (e) {
      console.error("Failed to get initiative:", e);
      res.status(500).json({ error: "Failed to get initiative" });
    }
  });

  app.post("/api/campaigns/:campaignId/initiative", requireAuth, async (req, res) => {
    try {
      const { characterId, value, isHidden } = req.body;
      
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const character = await storage.getCharacter(characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      const isGM = campaign.gmUserId === req.session.userId || await storage.isGM(req.session.userId!, req.params.campaignId);
      const isOwner = character.userId === req.session.userId;
      const editPermission = await storage.getCharacterPermission(characterId, req.session.userId!);
      const hasEditAccess = editPermission?.accessLevel === 'edit';
      
      // GM, character owner, or users with edit permission can roll initiative
      if (!isGM && !isOwner && !hasEditAccess) {
        return res.status(403).json({ error: "Not authorized to roll initiative for this character" });
      }
      
      const entry = await storage.createInitiativeEntry({
        campaignId: req.params.campaignId,
        characterId,
        value,
        isHidden: isHidden ?? false
      });
      
      // Broadcast initiative update to campaign room
      const room = campaignRooms.get(req.params.campaignId);
      if (room) {
        const initiativeMessage = JSON.stringify({
          type: 'initiative_update',
          campaignId: req.params.campaignId
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
      
      // Get the initiative entry to find the campaign
      const entries = await db.select().from(initiativeEntries).where(eq(initiativeEntries.id, req.params.id)).limit(1);
      const entry = entries[0];
      if (!entry) {
        return res.status(404).json({ error: "Initiative entry not found" });
      }
      
      const campaign = await storage.getCampaign(entry.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can edit initiative values" });
      }
      
      const updated = await storage.updateInitiativeEntry(req.params.id, { value, isHidden });
      
      // Broadcast initiative update
      const room = campaignRooms.get(entry.campaignId);
      if (room) {
        const initiativeMessage = JSON.stringify({
          type: 'initiative_update',
          campaignId: entry.campaignId
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
      // Get the initiative entry to find the campaign
      const entries = await db.select().from(initiativeEntries).where(eq(initiativeEntries.id, req.params.id)).limit(1);
      const entry = entries[0];
      if (!entry) {
        return res.status(404).json({ error: "Initiative entry not found" });
      }
      
      const campaign = await storage.getCampaign(entry.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can remove initiative entries" });
      }
      
      await storage.deleteInitiativeEntry(req.params.id);
      
      // Broadcast initiative update
      const room = campaignRooms.get(entry.campaignId);
      if (room) {
        const initiativeMessage = JSON.stringify({
          type: 'initiative_update',
          campaignId: entry.campaignId
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
  app.post("/api/campaigns/:campaignId/combat", requireAuth, async (req, res) => {
    try {
      const { inCombat, currentTurnCharacterId } = req.body;
      
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can start/stop combat" });
      }
      
      const updated = await storage.updateCampaign(req.params.campaignId, { 
        inCombat, 
        currentTurnCharacterId 
      });
      
      // Broadcast combat state update
      const room = campaignRooms.get(req.params.campaignId);
      if (room) {
        const combatMessage = JSON.stringify({
          type: 'combat_update',
          campaignId: req.params.campaignId,
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

  // Process effect triggers for start of turn/round
  // This endpoint is called when a character's turn starts to process their active token effects
  // It also decrements duration for ALL effects on ALL tokens in the scene (not just current character)
  app.post("/api/scenes/:sceneId/effect-triggers", requireAuth, async (req, res) => {
    try {
      const { characterId, timing, isNewRound } = req.body;
      // timing: 'start_of_turn' | 'start_of_round'
      
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can trigger effects" });
      }
      
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Get ALL tokens in this scene (for duration countdown on all effects)
      const sceneTokens = await storage.getSceneTokens(req.params.sceneId);
      
      // Get tokens belonging to the current character (for damage/healing effects)
      const characterTokens = sceneTokens.filter((t: { characterId?: string | null }) => t.characterId === characterId);
      
      const character = characterId ? await storage.getCharacter(characterId) : null;
      
      const results: any[] = [];
      // Track current HP to accumulate damage from multiple effects (for current character only)
      let currentHp = character?.hp ?? 0;
      
      // STEP 1: Process damage/healing effects for the CURRENT CHARACTER's turn only
      if (character && characterTokens.length > 0) {
        for (const token of characterTokens) {
          const activeEffects = await storage.getTokenActiveEffects(token.id);
          
          for (const activeEffect of activeEffects) {
            const effect = activeEffect.effect;
            
            // Check if this effect should trigger based on timing
            const shouldTrigger = 
              (timing === 'start_of_turn' && effect.timing === 'start_of_turn') ||
              (timing === 'start_of_round' && effect.timing === 'start_of_round') ||
              (isNewRound && effect.timing === 'start_of_round');
            
            if (!shouldTrigger) continue;
            
            // If effect causes damage, roll dice and apply
            if (effect.causesDamage && effect.diceAmount) {
              // Parse dice notation (e.g., "1d6", "2d4+2")
              const diceMatch = effect.diceAmount.match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
              if (!diceMatch) continue;
              
              const numDice = parseInt(diceMatch[1], 10);
              const dieSize = parseInt(diceMatch[2], 10);
              const bonus = diceMatch[3] ? parseInt(diceMatch[3], 10) : 0;
              
              // Roll the dice
              let total = bonus;
              const rolls: number[] = [];
              for (let i = 0; i < numDice; i++) {
                const roll = crypto.randomInt(1, dieSize + 1);
                rolls.push(roll);
                total += roll;
              }
              
              // Calculate new HP from current accumulated HP value
              const previousHp = currentHp;
              const isHealing = effect.damageType === 'Health';
              const newHp = isHealing 
                ? Math.min(character.maxHp, currentHp + total)
                : Math.max(0, currentHp - total);
              
              // Update accumulated HP for subsequent effects
              currentHp = newHp;
              
              await storage.updateCharacter(characterId, { hp: newHp });
              
              const diceText = `${numDice}d${dieSize}`;
              const rollBreakdown = `${diceText} = [${rolls.join(', ')}]${bonus > 0 ? ` + ${bonus}` : ''} = ${total}`;
              const effectAction = isHealing ? 'heals' : 'damages';
              const chatMessage = await storage.createChatMessage({
                campaignId: scene.campaignId,
                userId: req.session.userId!,
                sender: effect.name,
                text: `${effect.name} ${effectAction} ${character.name}: ${rollBreakdown}${effect.damageType ? ` (${effect.damageType})` : ''}`,
                type: 'roll'
              });
              
              // Broadcast HP update with correct previous HP for this specific effect
              broadcastToCampaign(scene.campaignId, {
                type: "character_hp_update",
                characterId,
                hp: newHp,
                previousHp,
                damage: isHealing ? -total : total,
                isHealing,
                attackerName: effect.name
              });
              
              // Broadcast chat message
              broadcastToCampaign(scene.campaignId, {
                type: "chat_message",
                message: chatMessage
              });
              
              // Broadcast effect roll notification
              broadcastToCampaign(scene.campaignId, {
                type: "effect_roll",
                effectName: effect.name,
                effectImage: effect.imageUrl,
                characterName: character.name,
                rolls,
                bonus,
                total,
                damageType: effect.damageType,
                isHealing
              });
              
              results.push({
                effectId: effect.id,
                effectName: effect.name,
                rolls,
                bonus,
                total,
                damageType: effect.damageType,
                isHealing,
                characterName: character.name,
                newHp
              });
            }
          }
        }
      }
      
      // STEP 2: Process duration countdown
      // - durationType 'turns': only decrement on the affected token's own turn
      // - durationType 'rounds': decrement once per new round for all tokens
      for (const token of sceneTokens) {
        const activeEffects = await storage.getTokenActiveEffects(token.id);
        const tokenCharacter = token.characterId ? await storage.getCharacter(token.characterId) : null;
        const tokenCharacterName = tokenCharacter?.name || 'Unknown';
        const isCurrentCharacterToken = token.characterId === characterId;
        
        for (const activeEffect of activeEffects) {
          const effect = activeEffect.effect;
          
          const shouldDecrementDuration = activeEffect.duration !== null && activeEffect.duration > 0 && (
            (effect.durationType === 'rounds' && isNewRound) ||
            (effect.durationType !== 'rounds' && timing === 'start_of_turn' && isCurrentCharacterToken)
          );
          
          if (shouldDecrementDuration) {
            const newDuration = activeEffect.duration! - 1;
            if (newDuration <= 0) {
              // Effect has expired - remove it
              await storage.removeTokenActiveEffect(activeEffect.id);
              
              // Broadcast effect removal
              broadcastToCampaign(scene.campaignId, {
                type: "effect_expired",
                tokenId: token.id,
                effectId: effect.id,
                effectName: effect.name,
                characterName: tokenCharacterName
              });
              
              await storage.createChatMessage({
                campaignId: scene.campaignId,
                userId: req.session.userId!,
                sender: effect.name,
                text: `${effect.name} on ${tokenCharacterName} has expired`,
                type: 'roll'
              });
            } else {
              // Decrement duration
              await storage.updateTokenActiveEffectDuration(activeEffect.id, newDuration);
              
              // Broadcast duration update
              broadcastToCampaign(scene.campaignId, {
                type: "effect_duration_update",
                tokenId: token.id,
                activeEffectId: activeEffect.id,
                effectId: effect.id,
                remainingDuration: newDuration
              });
            }
          }
        }
      }
      
      res.json({ processed: results });
    } catch (e) {
      console.error("Failed to process effect triggers:", e);
      res.status(500).json({ error: "Failed to process effect triggers" });
    }
  });

  // Clear all initiative entries for a campaign
  app.delete("/api/campaigns/:campaignId/initiative", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign || campaign.gmUserId !== req.session.userId) {
        return res.status(403).json({ error: "Only GMs can clear initiative" });
      }
      
      await storage.clearCampaignInitiative(req.params.campaignId);
      
      // Also reset combat state on campaign
      await storage.updateCampaign(req.params.campaignId, { 
        inCombat: false, 
        currentTurnCharacterId: null 
      });
      
      // Broadcast initiative clear
      const room = campaignRooms.get(req.params.campaignId);
      if (room) {
        const clearMessage = JSON.stringify({
          type: 'initiative_update',
          campaignId: req.params.campaignId
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

  // ======== THROWN ITEMS ROUTES ========

  // Get all thrown items for a scene (with item data)
  app.get("/api/scenes/:sceneId/thrown-items", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const thrownItems = await storage.getThrownItems(req.params.sceneId);
      
      // Enrich with item data for rendering
      const enrichedItems = await Promise.all(
        thrownItems.map(async (ti) => {
          const item = await storage.getItem(ti.itemId);
          return {
            ...ti,
            item: item ? {
              id: item.id,
              name: item.name,
              image: item.image,
              detonateAoeRange: item.detonateAoeRange,
              detonateAoeShape: item.detonateAoeShape,
              isDetonatable: item.isDetonatable,
            } : null,
          };
        })
      );
      
      res.json(enrichedItems);
    } catch (e) {
      console.error("Failed to get thrown items:", e);
      res.status(500).json({ error: "Failed to get thrown items" });
    }
  });

  // Delete all thrown items for a scene (GM only)
  app.delete("/api/scenes/:sceneId/thrown-items", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }

      // Check GM permission
      const isGM = await storage.isGM(userId, scene.campaignId);
      if (!isGM) {
        return res.status(403).json({ error: "Only GMs can clear all thrown items" });
      }

      await storage.deleteThrownItemsByScene(req.params.sceneId);

      // Broadcast to campaign
      broadcastToCampaign(scene.campaignId, {
        type: "thrown_items_cleared",
        sceneId: scene.id
      });

      res.json({ success: true });
    } catch (e) {
      console.error("Failed to clear thrown items:", e);
      res.status(500).json({ error: "Failed to clear thrown items" });
    }
  });

  // Create a thrown item
  app.post("/api/scenes/:sceneId/thrown-items", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) {
        return res.status(404).json({ error: "Scene not found" });
      }
      
      const { itemId, characterId, x, y, attachedToTokenId } = req.body;
      
      if (!itemId || !characterId || x === undefined || y === undefined) {
        return res.status(400).json({ error: "Missing required fields: itemId, characterId, x, y" });
      }
      
      const thrownItem = await storage.createThrownItem({
        sceneId: req.params.sceneId,
        itemId,
        characterId,
        x,
        y,
        attachedToTokenId: attachedToTokenId || null,
      });
      
      // Broadcast to campaign
      broadcastToCampaign(scene.campaignId, {
        type: "thrown_item_created",
        thrownItem,
        sceneId: scene.id
      });
      
      res.json(thrownItem);
    } catch (e) {
      console.error("Failed to create thrown item:", e);
      res.status(500).json({ error: "Failed to create thrown item" });
    }
  });

  // Delete a single thrown item
  app.delete("/api/thrown-items/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteThrownItem(req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete thrown item:", e);
      res.status(500).json({ error: "Failed to delete thrown item" });
    }
  });

  // Detonate - delete all thrown items from a specific source item
  app.delete("/api/thrown-items/item/:itemId/detonate", requireAuth, async (req, res) => {
    try {
      // Get thrown items first to know which scenes to broadcast to
      const thrownItems = await storage.getThrownItemsByItemId(req.params.itemId);
      
      // Delete all thrown items
      await storage.deleteThrownItemsByItemId(req.params.itemId);
      
      // Broadcast detonation to each unique scene's campaign
      const processedScenes = new Set<string>();
      for (const ti of thrownItems) {
        if (!processedScenes.has(ti.sceneId)) {
          processedScenes.add(ti.sceneId);
          const scene = await storage.getScene(ti.sceneId);
          if (scene) {
            broadcastToCampaign(scene.campaignId, {
              type: "thrown_items_detonated",
              itemId: req.params.itemId,
              sceneId: ti.sceneId
            });
          }
        }
      }
      
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to detonate thrown items:", e);
      res.status(500).json({ error: "Failed to detonate thrown items" });
    }
  });

  // ======== FOG OF WAR ROUTES ========

  // Scene Walls CRUD
  app.get("/api/scenes/:sceneId/walls", requireAuth, async (req, res) => {
    try {
      const walls = await storage.getSceneWalls(req.params.sceneId);
      res.json(walls);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch walls" });
    }
  });

  app.post("/api/scenes/:sceneId/walls", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const campaign = await storage.getCampaign(scene.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage walls" });
      
      const wall = await storage.createSceneWall({ ...req.body, sceneId: req.params.sceneId });
      broadcastToCampaign(scene.campaignId, { type: "wall_created", wall });
      res.json(wall);
    } catch (e) {
      res.status(500).json({ error: "Failed to create wall" });
    }
  });

  app.post("/api/scenes/:sceneId/walls/batch", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage walls" });
      
      const wallValues = req.body.walls.map((w: any) => ({ ...w, sceneId: req.params.sceneId }));
      const walls = await storage.createSceneWallsBatch(wallValues);
      broadcastToCampaign(scene.campaignId, { type: "walls_batch_created", walls });
      res.json(walls);
    } catch (e) {
      res.status(500).json({ error: "Failed to create walls batch" });
    }
  });

  app.put("/api/walls/:id", requireAuth, async (req, res) => {
    try {
      const wall = await storage.updateSceneWall(req.params.id, req.body);
      if (!wall) return res.status(404).json({ error: "Wall not found" });
      res.json(wall);
    } catch (e) {
      res.status(500).json({ error: "Failed to update wall" });
    }
  });

  app.delete("/api/walls/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSceneWall(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete wall" });
    }
  });

  app.delete("/api/scenes/:sceneId/walls", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage walls" });
      
      await storage.deleteSceneWalls(req.params.sceneId);
      broadcastToCampaign(scene.campaignId, { type: "walls_cleared", sceneId: req.params.sceneId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to clear walls" });
    }
  });

  app.delete("/api/scenes/:sceneId/doors", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage doors" });
      
      await storage.deleteSceneDoors(req.params.sceneId);
      broadcastToCampaign(scene.campaignId, { type: "doors_cleared", sceneId: req.params.sceneId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to clear doors" });
    }
  });

  // Scene Doors CRUD
  app.get("/api/scenes/:sceneId/doors", requireAuth, async (req, res) => {
    try {
      const doors = await storage.getSceneDoors(req.params.sceneId);
      res.json(doors);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch doors" });
    }
  });

  app.post("/api/scenes/:sceneId/doors", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage doors" });
      
      const door = await storage.createSceneDoor({ ...req.body, sceneId: req.params.sceneId });
      broadcastToCampaign(scene.campaignId, { type: "door_created", door });
      res.json(door);
    } catch (e) {
      res.status(500).json({ error: "Failed to create door" });
    }
  });

  app.put("/api/doors/:id", requireAuth, async (req, res) => {
    try {
      const door = await storage.updateSceneDoor(req.params.id, req.body);
      if (!door) return res.status(404).json({ error: "Door not found" });
      res.json(door);
    } catch (e) {
      res.status(500).json({ error: "Failed to update door" });
    }
  });

  app.delete("/api/doors/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSceneDoor(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete door" });
    }
  });

  app.delete("/api/scenes/:sceneId/windows", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage windows" });
      
      await storage.deleteSceneWindows(req.params.sceneId);
      broadcastToCampaign(scene.campaignId, { type: "windows_cleared", sceneId: req.params.sceneId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to clear windows" });
    }
  });

  // Scene Windows CRUD
  app.get("/api/scenes/:sceneId/windows", requireAuth, async (req, res) => {
    try {
      const windows = await storage.getSceneWindows(req.params.sceneId);
      res.json(windows);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch windows" });
    }
  });

  app.post("/api/scenes/:sceneId/windows", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage windows" });
      
      const win = await storage.createSceneWindow({ ...req.body, sceneId: req.params.sceneId });
      broadcastToCampaign(scene.campaignId, { type: "window_created", window: win });
      res.json(win);
    } catch (e) {
      res.status(500).json({ error: "Failed to create window" });
    }
  });

  app.put("/api/windows/:id", requireAuth, async (req, res) => {
    try {
      const win = await storage.updateSceneWindow(req.params.id, req.body);
      if (!win) return res.status(404).json({ error: "Window not found" });
      res.json(win);
    } catch (e) {
      res.status(500).json({ error: "Failed to update window" });
    }
  });

  app.delete("/api/windows/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSceneWindow(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete window" });
    }
  });

  app.delete("/api/scenes/:sceneId/lights", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage lights" });
      
      await storage.deleteSceneLights(req.params.sceneId);
      broadcastToCampaign(scene.campaignId, { type: "lights_cleared", sceneId: req.params.sceneId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to clear lights" });
    }
  });

  // Scene Lights CRUD
  app.get("/api/scenes/:sceneId/lights", requireAuth, async (req, res) => {
    try {
      const lights = await storage.getSceneLights(req.params.sceneId);
      res.json(lights);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch lights" });
    }
  });

  app.post("/api/scenes/:sceneId/lights", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage lights" });
      
      const light = await storage.createSceneLight({ ...req.body, sceneId: req.params.sceneId });
      broadcastToCampaign(scene.campaignId, { type: "light_created", light });
      res.json(light);
    } catch (e) {
      res.status(500).json({ error: "Failed to create light" });
    }
  });

  app.put("/api/lights/:id", requireAuth, async (req, res) => {
    try {
      const light = await storage.updateSceneLight(req.params.id, req.body);
      if (!light) return res.status(404).json({ error: "Light not found" });
      res.json(light);
    } catch (e) {
      res.status(500).json({ error: "Failed to update light" });
    }
  });

  app.delete("/api/lights/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSceneLight(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete light" });
    }
  });

  // Scene Vision Zones CRUD
  app.get("/api/scenes/:sceneId/vision-zones", requireAuth, async (req, res) => {
    const zones = await storage.getSceneVisionZones(req.params.sceneId);
    res.json(zones);
  });

  app.post("/api/scenes/:sceneId/vision-zones", requireAuth, async (req, res) => {
    const zone = await storage.createSceneVisionZone({
      ...req.body,
      sceneId: req.params.sceneId,
    });
    const scene = await storage.getScene(req.params.sceneId);
    if (scene) {
      broadcastToCampaign(scene.campaignId, { type: 'vision_zone_changed', sceneId: req.params.sceneId });
    }
    res.json(zone);
  });

  app.put("/api/vision-zones/:zoneId", requireAuth, async (req, res) => {
    try {
      const { zoneId } = req.params;
      const { points, mode, name } = req.body;
      const updates: Record<string, any> = {};
      if (points !== undefined) updates.points = points;
      if (mode !== undefined) updates.mode = mode;
      if (name !== undefined) updates.name = name;

      const zone = await storage.updateVisionZone(zoneId, updates);
      if (!zone) return res.status(404).json({ error: "Vision zone not found" });
      const scene = await storage.getScene(zone.sceneId);
      if (scene) {
        broadcastToCampaign(scene.campaignId, { type: 'vision_zone_changed', sceneId: zone.sceneId });
      }
      res.json(zone);
    } catch (e) {
      res.status(500).json({ error: "Failed to update vision zone" });
    }
  });

  app.delete("/api/vision-zones/:zoneId", requireAuth, async (req, res) => {
    const [zone] = await db.select().from(sceneVisionZones).where(eq(sceneVisionZones.id, req.params.zoneId));
    if (zone) {
      const scene = await storage.getScene(zone.sceneId);
      if (scene) {
        broadcastToCampaign(scene.campaignId, { type: 'vision_zone_changed', sceneId: zone.sceneId });
      }
    }
    await storage.deleteSceneVisionZone(req.params.zoneId);
    res.json({ success: true });
  });

  app.delete("/api/scenes/:sceneId/vision-zones", requireAuth, async (req, res) => {
    await storage.deleteAllSceneVisionZones(req.params.sceneId);
    const scene = await storage.getScene(req.params.sceneId);
    if (scene) {
      broadcastToCampaign(scene.campaignId, { type: 'vision_zone_changed', sceneId: req.params.sceneId });
    }
    res.json({ success: true });
  });

  app.get("/api/campaigns/:campaignId/trait-vision-modifiers", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.campaignId;
      const chars = await storage.getCampaignCharacters(campaignId);
      const result: Record<string, { dayBonus: number; nightBonus: number }> = {};
      
      for (const char of chars) {
        const traits = await storage.getCharacterTraits(char.id);
        let dayBonus = 0;
        let nightBonus = 0;
        
        for (const trait of traits) {
          const mod = trait.visionModifier ?? 0;
          if (mod === 0) continue;
          const time = trait.visionModifierTime ?? 'both';
          if (time === 'day' || time === 'both') dayBonus += mod;
          if (time === 'night' || time === 'both') nightBonus += mod;
        }
        
        if (dayBonus !== 0 || nightBonus !== 0) {
          result[char.id] = { dayBonus, nightBonus };
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching trait vision modifiers:', error);
      res.status(500).json({ error: 'Failed to fetch trait vision modifiers' });
    }
  });

  // Fog of War state management
  app.put("/api/scenes/:sceneId/fog-state", requireAuth, async (req, res) => {
    try {
      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      const isGm = await storage.isGM(req.session.userId!, scene.campaignId);
      if (!isGm) return res.status(403).json({ error: "Only GMs can manage fog" });
      
      const updated = await storage.updateScene(req.params.sceneId, { fogState: req.body.fogState });
      broadcastToCampaign(scene.campaignId, { type: "fog_state_updated", sceneId: req.params.sceneId, fogState: req.body.fogState });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: "Failed to update fog state" });
    }
  });

  // Door toggle (open/close) - available to players too
  app.post("/api/doors/:id/toggle", requireAuth, async (req, res) => {
    try {
      const existingDoor = await storage.getSceneDoor(req.params.id);
      if (!existingDoor) return res.status(404).json({ error: "Door not found" });

      const updates: Record<string, any> = {};
      if (req.body.isOpen !== undefined) {
        updates.isOpen = req.body.isOpen;
      }
      if (req.body.blocksVisionWhenClosed !== undefined) {
        const scene = await storage.getScene(existingDoor.sceneId);
        if (!scene) return res.status(404).json({ error: "Scene not found" });
        const campaign = await storage.getCampaign(scene.campaignId);
        if (!campaign) return res.status(404).json({ error: "Campaign not found" });
        const gmAccess = await hasGmAccess(req.session.userId!, campaign.id, campaign.gmUserId);
        if (!gmAccess) {
          return res.status(403).json({ error: "Only the GM can toggle door vision" });
        }
        updates.blocksVisionWhenClosed = req.body.blocksVisionWhenClosed;
      }

      const door = await storage.updateSceneDoor(req.params.id, updates);
      if (!door) return res.status(404).json({ error: "Door not found" });
      
      const scene = await storage.getScene(door.sceneId);
      if (scene) {
        broadcastToCampaign(scene.campaignId, { type: "door_toggled", door });
      }
      res.json(door);
    } catch (e) {
      res.status(500).json({ error: "Failed to toggle door" });
    }
  });

  // ======== PER-USER GOOGLE OAUTH ROUTES ========

  app.get("/api/google/auth-url", requireAuth, async (req, res) => {
    try {
      const { getAuthUrl } = await import("./googleUserAuth.js");
      const url = getAuthUrl(req.session.userId!, req.get('host'));
      res.json({ url });
    } catch (e: any) {
      console.error("Failed to generate Google auth URL:", e);
      res.status(500).json({ error: "Failed to generate Google auth URL" });
    }
  });

  app.get("/api/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).send("Missing code or state parameter");
      }
      const { validateOAuthState, exchangeCodeForTokens } = await import("./googleUserAuth.js");
      const stateData = validateOAuthState(state as string);
      if (!stateData) {
        return res.status(400).send("Invalid or expired OAuth state. Please try connecting again.");
      }
      await exchangeCodeForTokens(code as string, stateData.userId, stateData.origin);
      res.redirect(stateData.origin + '/notes?google_connected=1');
    } catch (e: any) {
      console.error("Google OAuth callback failed:", e);
      res.status(500).send("Google authentication failed. Please try again.");
    }
  });

  app.post("/api/google/disconnect", requireAuth, async (req, res) => {
    try {
      const { disconnectGoogle } = await import("./googleUserAuth.js");
      await disconnectGoogle(req.session.userId!);
      res.json({ success: true });
    } catch (e: any) {
      console.error("Failed to disconnect Google:", e);
      res.status(500).json({ error: "Failed to disconnect Google account" });
    }
  });

  app.get("/api/google/status", requireAuth, async (req, res) => {
    try {
      const { getGoogleConnectionStatus } = await import("./googleUserAuth.js");
      const status = await getGoogleConnectionStatus(req.session.userId!);
      res.json(status);
    } catch (e: any) {
      console.error("Failed to get Google status:", e);
      res.status(500).json({ error: "Failed to get Google connection status" });
    }
  });

  // ======== PER-USER GOOGLE DOCS SYNC ROUTES ========

  app.get("/api/notes/drive-files", requireAuth, async (req, res) => {
    try {
      const { listUserGoogleDocs } = await import("./googleUserAuth.js");
      const docs = await listUserGoogleDocs(req.session.userId!, 50);
      res.json(docs);
    } catch (e: any) {
      console.error("Failed to list Google Docs:", e);
      if (e.message?.includes("not connected") || e.message?.includes("reconnect")) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: "Failed to list Google Docs" });
    }
  });

  app.post("/api/notes/:id/export-to-drive", requireAuth, async (req, res) => {
    try {
      const access = await storage.canAccessNote(req.session.userId!, req.params.id);
      if (!access.canAccess) {
        return res.status(403).json({ error: "Not authorized to access this note" });
      }
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      const { exportNoteToUserGoogleDoc } = await import("./googleUserAuth.js");
      const { existingDocId } = req.body || {};
      const result = await exportNoteToUserGoogleDoc(req.session.userId!, note.title, note.content || '', existingDocId);
      res.json({ success: true, docId: result.docId, webViewLink: result.webViewLink });
    } catch (e: any) {
      console.error("Failed to export note to Google Docs:", e);
      if (e.message?.includes("not connected") || e.message?.includes("reconnect")) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: "Failed to export note to Google Docs" });
    }
  });

  app.post("/api/notes/import-from-drive", requireAuth, async (req, res) => {
    try {
      const { docId, folderId, campaignId } = req.body;
      if (!docId) {
        return res.status(400).json({ error: "Document ID is required" });
      }
      const { importUserGoogleDoc } = await import("./googleUserAuth.js");
      const { title, content } = await importUserGoogleDoc(req.session.userId!, docId);
      const note = await storage.createNote({
        title,
        content,
        type: "markdown",
        userId: req.session.userId!,
        folderId: folderId || null,
        campaignId: campaignId || null,
      });
      res.status(201).json(note);
    } catch (e: any) {
      console.error("Failed to import Google Doc:", e);
      if (e.message?.includes("not connected") || e.message?.includes("reconnect")) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: "Failed to import Google Doc" });
    }
  });

  // ======== GOOGLE DRIVE IMAGE LIBRARY ROUTES ========
  
  // Get Google Drive connection status (GM's Replit connector - for image library)
  app.get("/api/drive/status", requireAuth, async (req, res) => {
    try {
      const status = await getGoogleDriveStatus();
      res.json(status);
    } catch (e) {
      console.error("Failed to get Drive status:", e);
      res.json({ connected: false });
    }
  });

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

  // ======== IMAGE UPLOAD ROUTES ========

  async function processAndSaveImage(buffer: Buffer, originalName: string): Promise<string> {
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const filename = `${id}.webp`;
    const filepath = path.join(UPLOADS_DIR, filename);

    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    let pipeline = sharp(buffer);
    const MAX_DIM = 8192;
    if (width > MAX_DIM || height > MAX_DIM) {
      pipeline = pipeline.resize({
        width: width > height ? MAX_DIM : undefined,
        height: height >= width ? MAX_DIM : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    await pipeline.webp({ quality: 90 }).toFile(filepath);
    return `/uploads/scene-backgrounds/${filename}`;
  }

  app.post("/api/upload/image", requireAuth, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }
      const url = await processAndSaveImage(req.file.buffer, req.file.originalname);
      res.json({ url });
    } catch (e: any) {
      console.error("Failed to upload image:", e);
      res.status(500).json({ error: "Failed to upload image: " + (e.message || "Unknown error") });
    }
  });

  app.post("/api/upload/base64", requireAuth, async (req, res) => {
    try {
      const { data } = req.body;
      if (!data || typeof data !== 'string') {
        return res.status(400).json({ error: "No image data provided" });
      }
      const matches = data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: "Invalid base64 image data" });
      }
      const buffer = Buffer.from(matches[2], 'base64');
      const url = await processAndSaveImage(buffer, 'image');
      res.json({ url });
    } catch (e: any) {
      console.error("Failed to upload base64 image:", e);
      res.status(500).json({ error: "Failed to upload image: " + (e.message || "Unknown error") });
    }
  });

  app.post("/api/drive/image/:fileId/save", requireAuth, async (req, res) => {
    try {
      const base64Data = await getImageBase64(req.params.fileId);
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return res.status(500).json({ error: "Invalid image data from Google Drive" });
      }
      const buffer = Buffer.from(matches[2], 'base64');
      const url = await processAndSaveImage(buffer, req.params.fileId);
      res.json({ url });
    } catch (e: any) {
      console.error("Failed to save Drive image:", e);
      res.status(500).json({ error: "Failed to save image: " + (e.message || "Unknown error") });
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

  // Update username with uniqueness check
  app.put("/api/profile/username", requireAuth, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: "Username is required" });
      }
      
      // Validate username format (alphanumeric, underscores, 3-30 chars)
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({ 
          error: "Username must be 3-30 characters and contain only letters, numbers, and underscores" 
        });
      }
      
      // Check if username is already taken by another user
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== req.session.userId) {
        return res.status(409).json({ error: "Username is already taken" });
      }
      
      // Update the username
      const updated = await storage.updateUserProfile(req.session.userId!, { username });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(updated));
    } catch (e) {
      console.error("Failed to update username:", e);
      res.status(500).json({ error: "Failed to update username" });
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
      
      // Create a notification for the recipient
      const sender = await storage.getUser(req.session.userId!);
      if (sender) {
        await storage.createUserNotification({
          userId: recipient.id,
          type: "friend_request",
          title: "New Friend Request",
          message: `${sender.username} sent you a friend request`,
          referenceId: request.id,
        });
      }
      
      sendToUser(recipient.id, { type: 'friend_request_received', requestId: request.id, senderId: req.session.userId });
      
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
      sendToUser(request.senderId, { type: 'friend_request_accepted', requestId: req.params.id, recipientId: req.session.userId });
      sendToUser(req.session.userId!, { type: 'friends_updated' });
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
      sendToUser(request.senderId, { type: 'friend_request_declined', requestId: req.params.id });
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
      sendToUser(request.recipientId, { type: 'friend_request_cancelled', requestId: req.params.id });
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
      const showHidden = req.query.showHidden === 'true';
      const folders = await storage.getUserNoteFolders(req.session.userId!, campaignId, showHidden);
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
      if (folder.campaignId) {
        broadcastToCampaign(folder.campaignId, { type: 'note_folder_changed', campaignId: folder.campaignId });
      }
      sendToUser(req.session.userId!, { type: 'note_folder_changed' });
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
      if (updated?.campaignId) {
        broadcastToCampaign(updated.campaignId, { type: 'note_folder_changed', campaignId: updated.campaignId });
      }
      sendToUser(req.session.userId!, { type: 'note_folder_changed' });
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
      if (folder.campaignId) {
        broadcastToCampaign(folder.campaignId, { type: 'note_folder_changed', campaignId: folder.campaignId });
      }
      sendToUser(req.session.userId!, { type: 'note_folder_changed' });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete note folder:", e);
      res.status(500).json({ error: "Failed to delete note folder" });
    }
  });

  // Reorder folders endpoint - batch update sortOrder for multiple folders
  app.post("/api/notes/folders/reorder", requireAuth, async (req, res) => {
    try {
      const { folderOrders } = req.body as { folderOrders: { id: string; sortOrder: number }[] };
      if (!folderOrders || !Array.isArray(folderOrders)) {
        return res.status(400).json({ error: "folderOrders array is required" });
      }
      
      // Verify all folders belong to the user
      for (const item of folderOrders) {
        const folder = await storage.getNoteFolder(item.id);
        if (!folder) {
          return res.status(404).json({ error: `Folder ${item.id} not found` });
        }
        if (folder.userId !== req.session.userId) {
          return res.status(403).json({ error: "Not authorized to reorder these folders" });
        }
      }
      
      // Update all folder orders
      await storage.reorderNoteFolders(folderOrders);
      const firstFolder = folderOrders.length > 0 ? await storage.getNoteFolder(folderOrders[0].id) : null;
      if (firstFolder?.campaignId) {
        broadcastToCampaign(firstFolder.campaignId, { type: 'note_folder_changed', campaignId: firstFolder.campaignId });
      }
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to reorder note folders:", e);
      res.status(500).json({ error: "Failed to reorder note folders" });
    }
  });

  // Note endpoints
  app.get("/api/notes", requireAuth, async (req, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const campaignId = req.query.campaignId as string | undefined;
      
      if (campaignId) {
        const notes = await storage.getCampaignNotesForUser(req.session.userId!, campaignId, folderId);
        return res.json(notes);
      }
      
      const ownedNotes = await storage.getUserNotes(req.session.userId!, folderId, undefined);
      const sharedNotes = await storage.getSharedNotes(req.session.userId!);
      const allNotes = [...ownedNotes];
      for (const sn of sharedNotes) {
        if (folderId && sn.folderId !== folderId) continue;
        if (!allNotes.some(n => n.id === sn.id)) {
          allNotes.push(sn);
        }
      }
      allNotes.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      res.json(allNotes);
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
      
      if (note.campaignId) {
        broadcastToCampaign(note.campaignId, {
          type: 'note_created',
          noteId: note.id,
          campaignId: note.campaignId,
          userId: req.session.userId,
        });
      }
      sendToUser(req.session.userId!, { type: 'notes_changed', noteId: note.id });
      
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
      if (updated?.campaignId) {
        broadcastToCampaign(updated.campaignId, { type: 'note_changed', noteId: req.params.id, campaignId: updated.campaignId });
      }
      const noteShares = await storage.getNoteShares(req.params.id);
      if (noteShares.length > 0) {
        for (const share of noteShares) {
          sendToUser(share.sharedWithId, { type: 'notes_changed', noteId: req.params.id });
        }
      }
      sendToUser(req.session.userId!, { type: 'notes_changed', noteId: req.params.id });
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
      
      // Store campaignId and shares before deletion for broadcast
      const campaignId = note.campaignId;
      const shares = await storage.getNoteShares(req.params.id);
      
      await storage.deleteNote(req.params.id);
      
      if (campaignId) {
        broadcastToCampaign(campaignId, {
          type: 'note_deleted',
          noteId: req.params.id,
          campaignId: campaignId,
          userId: req.session.userId,
        });
      }
      
      if (shares.length > 0) {
        for (const share of shares) {
          sendToUser(share.sharedWithId, { type: 'note_deleted', noteId: req.params.id });
        }
      }
      sendToUser(req.session.userId!, { type: 'notes_changed', noteId: req.params.id });
      
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
      
      // Check if they are friends
      const areFriends = await storage.areFriends(req.session.userId!, friendId);
      
      // Also check if note is in a campaign and target user is a campaign member
      let isCampaignMember = false;
      if (note.campaignId) {
        const campaignMembers = await storage.getCampaignMembers(note.campaignId);
        isCampaignMember = campaignMembers.some(m => m.userId === friendId);
      }
      
      if (!areFriends && !isCampaignMember) {
        return res.status(400).json({ error: "Can only share with friends or campaign members" });
      }
      
      const share = await storage.createNoteShare({
        noteId: req.params.id,
        ownerId: req.session.userId!,
        sharedWithId: friendId,
        permission: permission || 'view',
      });
      sendToUser(friendId, { type: 'notes_changed', noteId: req.params.id });
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

  // ============================================
  // TOKEN EFFECTS SYSTEM ROUTES
  // ============================================

  // Public route for getting all token effects (for battle map display)
  app.get("/api/token-effects", requireAuth, async (req, res) => {
    try {
      const effects = await storage.getTokenEffects();
      res.json(effects);
    } catch (err) {
      console.error("Failed to fetch token effects:", err);
      res.status(500).json({ error: "Failed to fetch token effects" });
    }
  });

  // Admin Token Effects CRUD routes
  app.get("/api/admin/token-effects", requireAdmin, async (req, res) => {
    try {
      const effects = await storage.getTokenEffects();
      res.json(effects);
    } catch (err) {
      console.error("Failed to fetch token effects:", err);
      res.status(500).json({ error: "Failed to fetch token effects" });
    }
  });

  app.post("/api/admin/token-effects", requireAdmin, async (req, res) => {
    try {
      const effectData = insertTokenEffectSchema.parse(req.body);
      const effect = await storage.createTokenEffect(effectData);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'token-effects' });
      res.status(201).json(effect);
    } catch (err) {
      console.error("Failed to create token effect:", err);
      res.status(400).json({ error: "Failed to create token effect" });
    }
  });

  app.get("/api/admin/token-effects/:id", requireAdmin, async (req, res) => {
    try {
      const effect = await storage.getTokenEffect(req.params.id);
      if (!effect) {
        return res.status(404).json({ error: "Token effect not found" });
      }
      res.json(effect);
    } catch (err) {
      console.error("Failed to fetch token effect:", err);
      res.status(500).json({ error: "Failed to fetch token effect" });
    }
  });

  app.put("/api/admin/token-effects/:id", requireAdmin, async (req, res) => {
    try {
      const effect = await storage.getTokenEffect(req.params.id);
      if (!effect) {
        return res.status(404).json({ error: "Token effect not found" });
      }
      const updated = await storage.updateTokenEffect(req.params.id, req.body);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'token-effects' });
      res.json(updated);
    } catch (err) {
      console.error("Failed to update token effect:", err);
      res.status(400).json({ error: "Failed to update token effect" });
    }
  });

  app.delete("/api/admin/token-effects/:id", requireAdmin, async (req, res) => {
    try {
      const effect = await storage.getTokenEffect(req.params.id);
      if (!effect) {
        return res.status(404).json({ error: "Token effect not found" });
      }
      await storage.deleteTokenEffect(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'token-effects' });
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete token effect:", err);
      res.status(400).json({ error: "Failed to delete token effect" });
    }
  });

  // Admin Spell Effects association routes
  app.get("/api/admin/spells/:spellId/effects", requireAdmin, async (req, res) => {
    try {
      const effects = await storage.getSpellEffects(req.params.spellId);
      res.json(effects);
    } catch (err) {
      console.error("Failed to fetch spell effects:", err);
      res.status(500).json({ error: "Failed to fetch spell effects" });
    }
  });

  app.post("/api/admin/spells/:spellId/effects", requireAdmin, async (req, res) => {
    try {
      const { effectId, triggerCondition } = req.body;
      if (!effectId) {
        return res.status(400).json({ error: "effectId is required" });
      }
      const effect = await storage.getTokenEffect(effectId);
      if (!effect) {
        return res.status(404).json({ error: "Token effect not found" });
      }
      const spellEffect = await storage.addSpellEffect(
        req.params.spellId,
        effectId,
        triggerCondition || "always"
      );
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'spell-effects' });
      res.status(201).json(spellEffect);
    } catch (err) {
      console.error("Failed to add spell effect:", err);
      res.status(400).json({ error: "Failed to add spell effect" });
    }
  });

  app.delete("/api/admin/spell-effects/:id", requireAdmin, async (req, res) => {
    try {
      await storage.removeSpellEffect(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'spell-effects' });
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to remove spell effect:", err);
      res.status(400).json({ error: "Failed to remove spell effect" });
    }
  });

  // Admin Item Effects association routes
  app.get("/api/admin/items/:itemId/effects", requireAdmin, async (req, res) => {
    try {
      const effects = await storage.getItemEffects(req.params.itemId);
      res.json(effects);
    } catch (err) {
      console.error("Failed to fetch item effects:", err);
      res.status(500).json({ error: "Failed to fetch item effects" });
    }
  });

  app.post("/api/admin/items/:itemId/effects", requireAdmin, async (req, res) => {
    try {
      const { effectId, triggerCondition } = req.body;
      if (!effectId) {
        return res.status(400).json({ error: "effectId is required" });
      }
      const effect = await storage.getTokenEffect(effectId);
      if (!effect) {
        return res.status(404).json({ error: "Token effect not found" });
      }
      const itemEffect = await storage.addItemEffect(
        req.params.itemId,
        effectId,
        triggerCondition || "always"
      );
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'item-effects' });
      res.status(201).json(itemEffect);
    } catch (err) {
      console.error("Failed to add item effect:", err);
      res.status(400).json({ error: "Failed to add item effect" });
    }
  });

  app.delete("/api/admin/item-effects/:id", requireAdmin, async (req, res) => {
    try {
      await storage.removeItemEffect(req.params.id);
      broadcastToAllClients({ type: 'admin_data_changed', entity: 'item-effects' });
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to remove item effect:", err);
      res.status(400).json({ error: "Failed to remove item effect" });
    }
  });

  // Token Active Effects routes (requires GM role or token owner)
  app.get("/api/tokens/:tokenId/active-effects", requireAuth, async (req, res) => {
    try {
      const token = await storage.getToken(req.params.tokenId);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      const campaign = await storage.getCampaign(token.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isGM = await hasGmAccess(req.session.userId!, token.campaignId, campaign.gmUserId);
      const isMember = isGM || await storage.isCampaignMember(token.campaignId, req.session.userId!);
      
      if (!isGM && !isMember) {
        return res.status(403).json({ error: "Not authorized to view this token" });
      }

      const effects = await storage.getTokenActiveEffects(req.params.tokenId);
      res.json(effects);
    } catch (err) {
      console.error("Failed to fetch token active effects:", err);
      res.status(500).json({ error: "Failed to fetch token active effects" });
    }
  });

  app.post("/api/tokens/:tokenId/active-effects", requireAuth, async (req, res) => {
    try {
      const token = await storage.getToken(req.params.tokenId);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      const campaign = await storage.getCampaign(token.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isGM = await hasGmAccess(req.session.userId!, token.campaignId, campaign.gmUserId);
      
      if (!isGM) {
        return res.status(403).json({ error: "Only the GM can apply effects to tokens" });
      }

      const { effectId, sourceType, sourceId, duration } = req.body;
      if (!effectId) {
        return res.status(400).json({ error: "effectId is required" });
      }

      const effect = await storage.getTokenEffect(effectId);
      if (!effect) {
        return res.status(404).json({ error: "Token effect not found" });
      }

      // Use provided duration, or default from effect definition if effect has duration enabled
      const effectDuration = duration !== undefined ? duration : 
        (effect.hasDuration && effect.defaultDuration ? effect.defaultDuration : null);

      const activeEffect = await storage.addTokenActiveEffect({
        tokenId: req.params.tokenId,
        effectId,
        sourceType: sourceType || null,
        sourceId: sourceId || null,
        duration: effectDuration,
      });
      broadcastToCampaign(token.campaignId, { type: 'token_updated' });
      res.status(201).json(activeEffect);
    } catch (err) {
      console.error("Failed to apply token effect:", err);
      res.status(400).json({ error: "Failed to apply token effect" });
    }
  });

  app.delete("/api/token-active-effects/:id", requireAuth, async (req, res) => {
    try {
      // First get the active effect to find the token and verify GM access
      const activeEffect = await storage.getTokenActiveEffect(req.params.id);
      if (!activeEffect) {
        return res.status(404).json({ error: "Active effect not found" });
      }
      
      const token = await storage.getToken(activeEffect.tokenId);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      
      const campaign = await storage.getCampaign(token.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const isGM = await hasGmAccess(req.session.userId!, token.campaignId, campaign.gmUserId);
      if (!isGM) {
        return res.status(403).json({ error: "Only the GM can remove effects from tokens" });
      }
      
      await storage.removeTokenActiveEffect(req.params.id);
      broadcastToCampaign(token.campaignId, { type: 'token_updated' });
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to remove token active effect:", err);
      res.status(400).json({ error: "Failed to remove token active effect" });
    }
  });

  app.delete("/api/tokens/:tokenId/active-effects", requireAuth, async (req, res) => {
    try {
      const token = await storage.getToken(req.params.tokenId);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      const campaign = await storage.getCampaign(token.campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const isGM = await hasGmAccess(req.session.userId!, token.campaignId, campaign.gmUserId);
      
      if (!isGM) {
        return res.status(403).json({ error: "Only the GM can clear effects from tokens" });
      }

      await storage.clearTokenActiveEffects(req.params.tokenId);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to clear token active effects:", err);
      res.status(400).json({ error: "Failed to clear token active effects" });
    }
  });

  // ============================================
  // User Notifications API
  // ============================================

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getUserNotifications(req.session.userId!);
      res.json(notifications);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.session.userId!);
      res.json({ count });
    } catch (err) {
      console.error("Failed to fetch notification count:", err);
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.session.userId!);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete notification:", err);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // ============================================
  // Terms & Conditions API
  // ============================================

  app.get("/api/terms", async (req, res) => {
    try {
      const terms = await storage.getCurrentTerms();
      res.json(terms || null);
    } catch (err) {
      console.error("Failed to fetch terms:", err);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });

  app.put("/api/terms", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }

      const terms = await storage.updateTerms(content, req.session.userId!);
      res.json(terms);
    } catch (err) {
      console.error("Failed to update terms:", err);
      res.status(500).json({ error: "Failed to update terms" });
    }
  });

  app.get("/api/terms/status", requireAuth, async (req, res) => {
    try {
      const currentTerms = await storage.getCurrentTerms();
      const hasAccepted = await storage.hasUserAcceptedCurrentTerms(req.session.userId!);
      res.json({ 
        hasAccepted, 
        currentVersion: currentTerms?.version ?? null 
      });
    } catch (err) {
      console.error("Failed to check terms status:", err);
      res.status(500).json({ error: "Failed to check terms status" });
    }
  });

  app.post("/api/terms/accept", requireAuth, async (req, res) => {
    try {
      const currentTerms = await storage.getCurrentTerms();
      if (!currentTerms) {
        return res.status(404).json({ error: "No terms found" });
      }

      const acceptance = await storage.acceptTerms(req.session.userId!, currentTerms.version);
      res.json(acceptance);
    } catch (err) {
      console.error("Failed to accept terms:", err);
      res.status(500).json({ error: "Failed to accept terms" });
    }
  });

  // Sandbox Folder endpoints
  app.get("/api/campaigns/:campaignId/sandbox/folders", requireAuth, async (req, res) => {
    try {
      const folders = await storage.getSandboxFolders(req.params.campaignId);
      res.json(folders);
    } catch (e) {
      console.error("Failed to get sandbox folders:", e);
      res.status(500).json({ error: "Failed to get sandbox folders" });
    }
  });

  app.post("/api/campaigns/:campaignId/sandbox/folders", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage folders" });
      const folder = await storage.createSandboxFolder({
        campaignId: req.params.campaignId,
        name: req.body.name || "New Folder",
        parentId: req.body.parentId || null,
        sortOrder: req.body.sortOrder || 0,
      });
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json(folder);
    } catch (e) {
      console.error("Failed to create sandbox folder:", e);
      res.status(500).json({ error: "Failed to create sandbox folder" });
    }
  });

  app.patch("/api/campaigns/:campaignId/sandbox/folders/:folderId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage folders" });
      const allowedFields: any = {};
      if (req.body.name !== undefined) allowedFields.name = req.body.name;
      if (req.body.parentId !== undefined) allowedFields.parentId = req.body.parentId;
      if (req.body.sortOrder !== undefined) allowedFields.sortOrder = req.body.sortOrder;
      if (req.body.color !== undefined) allowedFields.color = req.body.color;
      const folder = await storage.updateSandboxFolder(req.params.folderId, allowedFields);
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json(folder);
    } catch (e) {
      console.error("Failed to update sandbox folder:", e);
      res.status(500).json({ error: "Failed to update sandbox folder" });
    }
  });

  app.delete("/api/campaigns/:campaignId/sandbox/folders/:folderId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage folders" });
      await storage.deleteSandboxFolder(req.params.folderId);
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete sandbox folder:", e);
      res.status(500).json({ error: "Failed to delete sandbox folder" });
    }
  });

  // Sandbox Template endpoints
  app.get("/api/campaigns/:campaignId/sandbox/templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getSandboxTemplates(req.params.campaignId);
      res.json(templates);
    } catch (e) {
      console.error("Failed to get sandbox templates:", e);
      res.status(500).json({ error: "Failed to get sandbox templates" });
    }
  });

  app.post("/api/campaigns/:campaignId/sandbox/templates", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage templates" });
      const canvasId = crypto.randomUUID();
      const defaultData = {
        version: 3,
        type: req.body.templateType || "character",
        canvas: {
          id: canvasId,
          width: 450,
          height: 550,
          backgroundConfig: { backgroundColor: "#1c1917" },
        },
        layoutNodes: {},
        properties: {
          pfp: {
            id: crypto.randomUUID(),
            key: "pfp",
            type: "pfp",
            parentId: null,
            metadata: {
              label: "Profile Picture",
              uiConfig: { x: 10, y: 10, width: 100, height: 100, labelPosition: "hidden" },
              style: { border: { enabled: true, color: "#44403c", width: 2, radius: 8, style: "solid" }, backgroundColor: "#292524" },
            },
          },
          name: {
            id: crypto.randomUUID(),
            key: "name",
            type: "text",
            parentId: null,
            metadata: {
              label: "Name",
              uiConfig: { x: 120, y: 10, width: 310, height: 40, labelFontSize: 10, valueFontSize: 18, labelPosition: "top" },
              style: { labelColor: "#a8a29e", valueColor: "#e7e5e4" },
            },
          },
        },
        settings: { defaultWidth: 450, defaultHeight: 550 },
      };
      const template = await storage.createSandboxTemplate({
        campaignId: req.params.campaignId,
        name: req.body.name || "Untitled Template",
        folderId: req.body.folderId || null,
        data: JSON.stringify(defaultData),
      });
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json(template);
    } catch (e) {
      console.error("Failed to create sandbox template:", e);
      res.status(500).json({ error: "Failed to create sandbox template" });
    }
  });

  app.post("/api/campaigns/:campaignId/sandbox/seed-arcana", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can seed templates" });

      const { buildCharacterTemplateData, buildWeaponTemplateData, buildSpellTemplateData } = await import("./arcanaTemplates");

      const characterTemplate = await storage.createSandboxTemplate({
        campaignId: req.params.campaignId,
        name: "AA Character",
        folderId: null,
        data: JSON.stringify(buildCharacterTemplateData()),
      });

      const weaponTemplate = await storage.createSandboxTemplate({
        campaignId: req.params.campaignId,
        name: "AA Weapon",
        folderId: null,
        data: JSON.stringify(buildWeaponTemplateData()),
      });

      const spellTemplate = await storage.createSandboxTemplate({
        campaignId: req.params.campaignId,
        name: "AA Spell",
        folderId: null,
        data: JSON.stringify(buildSpellTemplateData()),
      });

      res.json({ templates: [characterTemplate, weaponTemplate, spellTemplate] });
    } catch (e) {
      console.error("Failed to seed arcana templates:", e);
      res.status(500).json({ error: "Failed to seed arcana templates" });
    }
  });

  app.patch("/api/campaigns/:campaignId/sandbox/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage templates" });
      const template = await storage.updateSandboxTemplate(req.params.templateId, req.body);
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json(template);
    } catch (e) {
      console.error("Failed to update sandbox template:", e);
      res.status(500).json({ error: "Failed to update sandbox template" });
    }
  });

  app.delete("/api/campaigns/:campaignId/sandbox/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage templates" });
      await storage.deleteSandboxTemplate(req.params.templateId);
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete sandbox template:", e);
      res.status(500).json({ error: "Failed to delete sandbox template" });
    }
  });

  // Sandbox Actor endpoints
  app.get("/api/campaigns/:campaignId/sandbox/actors", requireAuth, async (req, res) => {
    try {
      const actors = await storage.getSandboxActors(req.params.campaignId);
      res.json(actors);
    } catch (e) {
      console.error("Failed to get sandbox actors:", e);
      res.status(500).json({ error: "Failed to get sandbox actors" });
    }
  });

  app.post("/api/campaigns/:campaignId/sandbox/actors", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage actors" });
      const actor = await storage.createSandboxActor({
        campaignId: req.params.campaignId,
        name: req.body.name || "Untitled Actor",
        templateId: req.body.templateId || null,
        folderId: req.body.folderId || null,
        data: "{}",
      });
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json(actor);
    } catch (e) {
      console.error("Failed to create sandbox actor:", e);
      res.status(500).json({ error: "Failed to create sandbox actor" });
    }
  });

  app.patch("/api/campaigns/:campaignId/sandbox/actors/:actorId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage actors" });
      const allowedFields: any = {};
      if (req.body.name !== undefined) allowedFields.name = req.body.name;
      if (req.body.templateId !== undefined) allowedFields.templateId = req.body.templateId;
      if (req.body.data !== undefined) allowedFields.data = req.body.data;
      if (req.body.folderId !== undefined) allowedFields.folderId = req.body.folderId;
      const actor = await storage.updateSandboxActor(req.params.actorId, allowedFields);
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json(actor);
    } catch (e) {
      console.error("Failed to update sandbox actor:", e);
      res.status(500).json({ error: "Failed to update sandbox actor" });
    }
  });

  app.delete("/api/campaigns/:campaignId/sandbox/actors/:actorId", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can manage actors" });
      await storage.deleteSandboxActor(req.params.actorId);
      broadcastToCampaign(req.params.campaignId, { type: 'sandbox_changed' });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete sandbox actor:", e);
      res.status(500).json({ error: "Failed to delete sandbox actor" });
    }
  });

  // ==================== ENTITY ROUTES ====================

  app.get("/api/campaigns/:campaignId/entities", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const entities = await storage.getEntitiesByCampaign(campaignId);
      const filtered = isGM ? entities : entities.filter(e => e.visibility !== 'gm_only');
      res.json(filtered);
    } catch (e) {
      console.error("Failed to get entities:", e);
      res.status(500).json({ error: "Failed to get entities" });
    }
  });

  app.get("/api/campaigns/:campaignId/entities/search", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { q, type } = req.query;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const entities = await storage.searchEntitiesByCampaign(campaignId, (q as string) || "", type as string | undefined);
      const filtered = isGM ? entities : entities.filter(e => e.visibility !== 'gm_only');
      res.json(filtered);
    } catch (e) {
      console.error("Failed to search entities:", e);
      res.status(500).json({ error: "Failed to search entities" });
    }
  });

  app.get("/api/campaigns/:campaignId/entities/:entityId", requireAuth, async (req, res) => {
    try {
      const { campaignId, entityId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const entity = await storage.getEntity(entityId);
      if (!entity || entity.campaignId !== campaignId) return res.status(404).json({ error: "Entity not found" });
      if (!isGM && entity.visibility === 'gm_only') return res.status(404).json({ error: "Entity not found" });
      res.json(entity);
    } catch (e) {
      console.error("Failed to get entity:", e);
      res.status(500).json({ error: "Failed to get entity" });
    }
  });

  app.post("/api/campaigns/:campaignId/entities", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create entities" });
      const parsed = insertEntitySchema.parse({ ...req.body, campaignId, createdBy: req.session.userId });
      const entity = await storage.createEntity(parsed);
      broadcastToCampaign(campaignId, { type: "entity_created", entity });
      res.status(201).json(entity);
    } catch (e) {
      console.error("Failed to create entity:", e);
      res.status(500).json({ error: "Failed to create entity" });
    }
  });

  app.patch("/api/campaigns/:campaignId/entities/:entityId", requireAuth, async (req, res) => {
    try {
      const { campaignId, entityId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can update entities" });
      const existing = await storage.getEntity(entityId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Entity not found" });
      const entity = await storage.updateEntity(entityId, req.body);
      broadcastToCampaign(campaignId, { type: "entity_updated", entity });
      res.json(entity);
    } catch (e) {
      console.error("Failed to update entity:", e);
      res.status(500).json({ error: "Failed to update entity" });
    }
  });

  app.delete("/api/campaigns/:campaignId/entities/:entityId", requireAuth, async (req, res) => {
    try {
      const { campaignId, entityId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete entities" });
      const existing = await storage.getEntity(entityId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Entity not found" });
      await storage.softDeleteEntity(entityId);
      broadcastToCampaign(campaignId, { type: "entity_deleted", entityId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete entity:", e);
      res.status(500).json({ error: "Failed to delete entity" });
    }
  });

  app.post("/api/campaigns/:campaignId/entities/:entityId/restore", requireAuth, async (req, res) => {
    try {
      const { campaignId, entityId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can restore entities" });
      const entity = await storage.restoreEntity(entityId);
      if (!entity) return res.status(404).json({ error: "Entity not found" });
      broadcastToCampaign(campaignId, { type: "entity_restored", entity });
      res.json(entity);
    } catch (e) {
      console.error("Failed to restore entity:", e);
      res.status(500).json({ error: "Failed to restore entity" });
    }
  });

  app.get("/api/campaigns/:campaignId/entities/:entityId/references", requireAuth, async (req, res) => {
    try {
      const { campaignId, entityId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const references = await storage.getEntityReferences(entityId);
      res.json(references);
    } catch (e) {
      console.error("Failed to get entity references:", e);
      res.status(500).json({ error: "Failed to get entity references" });
    }
  });

  // ==================== ENTITY LINK ROUTES ====================

  app.get("/api/campaigns/:campaignId/entity-links", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const links = await storage.getEntityLinksByCampaign(campaignId);
      if (isGM) {
        res.json(links);
      } else {
        const allEntities = await storage.getEntitiesByCampaign(campaignId);
        const gmOnlyIds = new Set(allEntities.filter(e => e.visibility === 'gm_only').map(e => e.id));
        res.json(links.filter(l => !gmOnlyIds.has(l.fromEntityId) && !gmOnlyIds.has(l.toEntityId)));
      }
    } catch (e) {
      console.error("Failed to get entity links:", e);
      res.status(500).json({ error: "Failed to get entity links" });
    }
  });

  app.get("/api/campaigns/:campaignId/entity-links/entity/:entityId", requireAuth, async (req, res) => {
    try {
      const { campaignId, entityId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const links = await storage.getEntityLinks(entityId);
      if (isGM) {
        res.json(links);
      } else {
        const allEntities = await storage.getEntitiesByCampaign(campaignId);
        const gmOnlyIds = new Set(allEntities.filter(e => e.visibility === 'gm_only').map(e => e.id));
        res.json(links.filter(l => !gmOnlyIds.has(l.fromEntityId) && !gmOnlyIds.has(l.toEntityId)));
      }
    } catch (e) {
      console.error("Failed to get entity links:", e);
      res.status(500).json({ error: "Failed to get entity links" });
    }
  });

  app.post("/api/campaigns/:campaignId/entity-links", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create entity links" });
      const parsed = insertEntityLinkSchema.parse({ ...req.body, campaignId });
      const link = await storage.createEntityLink(parsed);
      broadcastToCampaign(campaignId, { type: "entity_link_created", link });
      res.status(201).json(link);
    } catch (e) {
      console.error("Failed to create entity link:", e);
      res.status(500).json({ error: "Failed to create entity link" });
    }
  });

  app.patch("/api/campaigns/:campaignId/entity-links/:linkId", requireAuth, async (req, res) => {
    try {
      const { campaignId, linkId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can update entity links" });
      const existing = await storage.getEntityLink(linkId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Entity link not found" });
      const link = await storage.updateEntityLink(linkId, req.body);
      broadcastToCampaign(campaignId, { type: "entity_link_updated", link });
      res.json(link);
    } catch (e) {
      console.error("Failed to update entity link:", e);
      res.status(500).json({ error: "Failed to update entity link" });
    }
  });

  app.delete("/api/campaigns/:campaignId/entity-links/:linkId", requireAuth, async (req, res) => {
    try {
      const { campaignId, linkId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete entity links" });
      const existing = await storage.getEntityLink(linkId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Entity link not found" });
      await storage.deleteEntityLink(linkId);
      broadcastToCampaign(campaignId, { type: "entity_link_deleted", linkId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete entity link:", e);
      res.status(500).json({ error: "Failed to delete entity link" });
    }
  });

  // ==================== WORLD SHARE LINK ROUTES ====================

  app.post("/api/campaigns/:campaignId/share-link", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create share links" });
      const existing = await storage.getWorldShareLink(campaignId);
      if (existing) return res.status(400).json({ error: "Share link already exists", link: existing });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: "User not found" });
      const campaignSlug = campaign.name.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
      const userSlug = user.username.replace(/[^a-zA-Z0-9]+/g, '');
      let shareToken = `${campaignSlug}${userSlug}`;
      const existingToken = await storage.getWorldShareLinkByToken(shareToken);
      if (existingToken) {
        shareToken = `${shareToken}-${crypto.randomBytes(3).toString('hex')}`;
      }
      const link = await storage.createWorldShareLink({
        campaignId,
        token: shareToken,
        createdBy: req.session.userId!,
        isActive: true,
      });
      broadcastToCampaign(campaignId, { type: "world_share_link_created", link });
      res.status(201).json(link);
    } catch (e) {
      console.error("Failed to create share link:", e);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  app.get("/api/campaigns/:campaignId/share-link", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can view share links" });
      const link = await storage.getWorldShareLink(campaignId);
      res.json(link || null);
    } catch (e) {
      console.error("Failed to get share link:", e);
      res.status(500).json({ error: "Failed to get share link" });
    }
  });

  app.delete("/api/campaigns/:campaignId/share-link/:linkId", requireAuth, async (req, res) => {
    try {
      const { campaignId, linkId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete share links" });
      await storage.deleteWorldShareLink(linkId);
      broadcastToCampaign(campaignId, { type: "world_share_link_deleted", linkId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete share link:", e);
      res.status(500).json({ error: "Failed to delete share link" });
    }
  });

  // ==================== PUBLIC SHARED WORLD VIEW (NO AUTH) ====================

  app.get("/api/shared/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const shareLink = await storage.getWorldShareLinkByToken(token);
      if (!shareLink) return res.status(404).json({ error: "Share link not found or inactive" });

      let allEntities: any[];
      let allMaps: any[];
      let calendars: any[];
      let allTimelineEvents: any[];
      let entityLinksAll: any[];
      let sourceName: string;
      let worldDescription: string | null = null;
      let worldImage: string | null = null;
      let worldHomeContent: string | null = null;

      if (shareLink.worldId) {
        const world = await storage.getWorld(shareLink.worldId);
        if (!world) return res.status(404).json({ error: "World not found" });
        sourceName = world.name;
        worldDescription = world.description || null;
        worldImage = world.image || null;
        worldHomeContent = world.homeContent || null;
        allEntities = await storage.getEntitiesByWorld(shareLink.worldId);
        allMaps = await storage.getWorldMapsByWorld(shareLink.worldId);
        calendars = await storage.getWorldCalendarsByWorld(shareLink.worldId);
        allTimelineEvents = await storage.getWorldTimelineEventsByWorld(shareLink.worldId);
        entityLinksAll = await storage.getEntityLinksByWorld(shareLink.worldId);
      } else if (shareLink.campaignId) {
        const campaign = await storage.getCampaign(shareLink.campaignId);
        if (!campaign) return res.status(404).json({ error: "Campaign not found" });
        sourceName = campaign.name;
        allEntities = await storage.getEntitiesByCampaign(shareLink.campaignId);
        allMaps = await storage.getWorldMaps(shareLink.campaignId);
        calendars = await storage.getWorldCalendars(shareLink.campaignId);
        allTimelineEvents = await storage.getWorldTimelineEvents(shareLink.campaignId);
        entityLinksAll = await storage.getEntityLinksByCampaign(shareLink.campaignId);
      } else {
        return res.status(404).json({ error: "Share link has no associated world or campaign" });
      }

      const visibleEntities = allEntities.filter(e => e.visibility === 'player_visible' || e.visibility === 'shared');
      const visibleMaps = allMaps.filter(m => m.visibility !== 'gm_only');
      const mapPinsMap: Record<string, any[]> = {};
      for (const map of visibleMaps) {
        mapPinsMap[map.id] = await storage.getWorldMapPins(map.id);
      }
      const visibleTimelineEvents = allTimelineEvents.filter(e => e.visibility !== 'gm_only');
      const visibleEntityIds = new Set(visibleEntities.map(e => e.id));
      const visibleLinks = entityLinksAll.filter(l => visibleEntityIds.has(l.fromEntityId) && visibleEntityIds.has(l.toEntityId));
      res.json({
        campaignName: sourceName,
        worldDescription,
        worldImage,
        homeContent: worldHomeContent,
        entities: visibleEntities,
        entityLinks: visibleLinks,
        maps: visibleMaps,
        mapPins: mapPinsMap,
        calendars,
        timelineEvents: visibleTimelineEvents,
      });
    } catch (e) {
      console.error("Failed to get shared world:", e);
      res.status(500).json({ error: "Failed to get shared world" });
    }
  });

  // ==================== WORLD MAP ROUTES ====================

  app.get("/api/campaigns/:campaignId/world-maps", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const maps = await storage.getWorldMaps(campaignId);
      const filtered = isGM ? maps : maps.filter(m => m.visibility !== 'gm_only');
      res.json(filtered);
    } catch (e) {
      console.error("Failed to get world maps:", e);
      res.status(500).json({ error: "Failed to get world maps" });
    }
  });

  app.get("/api/campaigns/:campaignId/world-maps/:mapId", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const map = await storage.getWorldMap(mapId);
      if (!map || map.campaignId !== campaignId) return res.status(404).json({ error: "Map not found" });
      if (!isGM && map.visibility === 'gm_only') return res.status(404).json({ error: "Map not found" });
      res.json(map);
    } catch (e) {
      console.error("Failed to get world map:", e);
      res.status(500).json({ error: "Failed to get world map" });
    }
  });

  app.post("/api/campaigns/:campaignId/world-maps", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create maps" });
      const parsed = insertWorldMapSchema.parse({ ...req.body, campaignId });
      const map = await storage.createWorldMap(parsed);
      broadcastToCampaign(campaignId, { type: "world_map_created", map });
      res.status(201).json(map);
    } catch (e) {
      console.error("Failed to create world map:", e);
      res.status(500).json({ error: "Failed to create world map" });
    }
  });

  app.patch("/api/campaigns/:campaignId/world-maps/:mapId", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can update maps" });
      const existing = await storage.getWorldMap(mapId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Map not found" });
      const map = await storage.updateWorldMap(mapId, req.body);
      broadcastToCampaign(campaignId, { type: "world_map_updated", map });
      res.json(map);
    } catch (e) {
      console.error("Failed to update world map:", e);
      res.status(500).json({ error: "Failed to update world map" });
    }
  });

  app.delete("/api/campaigns/:campaignId/world-maps/:mapId", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete maps" });
      const existing = await storage.getWorldMap(mapId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Map not found" });
      await storage.deleteWorldMap(mapId);
      broadcastToCampaign(campaignId, { type: "world_map_deleted", mapId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world map:", e);
      res.status(500).json({ error: "Failed to delete world map" });
    }
  });

  // ==================== WORLD MAP PIN ROUTES ====================

  app.get("/api/campaigns/:campaignId/world-maps/:mapId/pins", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const map = await storage.getWorldMap(mapId);
      if (!map || map.campaignId !== campaignId) return res.status(404).json({ error: "Map not found" });
      const pins = await storage.getWorldMapPins(mapId);
      res.json(pins);
    } catch (e) {
      console.error("Failed to get map pins:", e);
      res.status(500).json({ error: "Failed to get map pins" });
    }
  });

  app.post("/api/campaigns/:campaignId/world-maps/:mapId/pins", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create pins" });
      const map = await storage.getWorldMap(mapId);
      if (!map || map.campaignId !== campaignId) return res.status(404).json({ error: "Map not found" });
      const parsed = insertWorldMapPinSchema.parse({ ...req.body, mapId });
      const pin = await storage.createWorldMapPin(parsed);
      broadcastToCampaign(campaignId, { type: "world_map_pin_created", pin, mapId });
      res.status(201).json(pin);
    } catch (e) {
      console.error("Failed to create map pin:", e);
      res.status(500).json({ error: "Failed to create map pin" });
    }
  });

  app.patch("/api/campaigns/:campaignId/world-maps/:mapId/pins/:pinId", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId, pinId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can update pins" });
      const existing = await storage.getWorldMapPin(pinId);
      if (!existing || existing.mapId !== mapId) return res.status(404).json({ error: "Pin not found" });
      const pin = await storage.updateWorldMapPin(pinId, req.body);
      broadcastToCampaign(campaignId, { type: "world_map_pin_updated", pin, mapId });
      res.json(pin);
    } catch (e) {
      console.error("Failed to update map pin:", e);
      res.status(500).json({ error: "Failed to update map pin" });
    }
  });

  app.delete("/api/campaigns/:campaignId/world-maps/:mapId/pins/:pinId", requireAuth, async (req, res) => {
    try {
      const { campaignId, mapId, pinId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete pins" });
      const existing = await storage.getWorldMapPin(pinId);
      if (!existing || existing.mapId !== mapId) return res.status(404).json({ error: "Pin not found" });
      await storage.deleteWorldMapPin(pinId);
      broadcastToCampaign(campaignId, { type: "world_map_pin_deleted", pinId, mapId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete map pin:", e);
      res.status(500).json({ error: "Failed to delete map pin" });
    }
  });

  // ==================== WORLD CALENDAR ROUTES ====================

  app.get("/api/campaigns/:campaignId/calendars", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const calendars = await storage.getWorldCalendars(campaignId);
      res.json(calendars);
    } catch (e) {
      console.error("Failed to get calendars:", e);
      res.status(500).json({ error: "Failed to get calendars" });
    }
  });

  app.get("/api/campaigns/:campaignId/calendars/:calendarId", requireAuth, async (req, res) => {
    try {
      const { campaignId, calendarId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const calendar = await storage.getWorldCalendar(calendarId);
      if (!calendar || calendar.campaignId !== campaignId) return res.status(404).json({ error: "Calendar not found" });
      res.json(calendar);
    } catch (e) {
      console.error("Failed to get calendar:", e);
      res.status(500).json({ error: "Failed to get calendar" });
    }
  });

  app.post("/api/campaigns/:campaignId/calendars", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create calendars" });
      const parsed = insertWorldCalendarSchema.parse({ ...req.body, campaignId });
      const calendar = await storage.createWorldCalendar(parsed);
      broadcastToCampaign(campaignId, { type: "world_calendar_created", calendar });
      res.status(201).json(calendar);
    } catch (e) {
      console.error("Failed to create calendar:", e);
      res.status(500).json({ error: "Failed to create calendar" });
    }
  });

  app.patch("/api/campaigns/:campaignId/calendars/:calendarId", requireAuth, async (req, res) => {
    try {
      const { campaignId, calendarId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can update calendars" });
      const existing = await storage.getWorldCalendar(calendarId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Calendar not found" });
      const calendar = await storage.updateWorldCalendar(calendarId, req.body);
      broadcastToCampaign(campaignId, { type: "world_calendar_updated", calendar });
      res.json(calendar);
    } catch (e) {
      console.error("Failed to update calendar:", e);
      res.status(500).json({ error: "Failed to update calendar" });
    }
  });

  app.delete("/api/campaigns/:campaignId/calendars/:calendarId", requireAuth, async (req, res) => {
    try {
      const { campaignId, calendarId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete calendars" });
      const existing = await storage.getWorldCalendar(calendarId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Calendar not found" });
      await storage.deleteWorldCalendar(calendarId);
      broadcastToCampaign(campaignId, { type: "world_calendar_deleted", calendarId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete calendar:", e);
      res.status(500).json({ error: "Failed to delete calendar" });
    }
  });

  // ==================== WORLD TIMELINE EVENT ROUTES ====================

  app.get("/api/campaigns/:campaignId/timeline-events", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const events = await storage.getWorldTimelineEvents(campaignId);
      const filtered = isGM ? events : events.filter(e => e.visibility !== 'gm_only');
      res.json(filtered);
    } catch (e) {
      console.error("Failed to get timeline events:", e);
      res.status(500).json({ error: "Failed to get timeline events" });
    }
  });

  app.get("/api/campaigns/:campaignId/timeline-events/:eventId", requireAuth, async (req, res) => {
    try {
      const { campaignId, eventId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isMember = await storage.isCampaignMember(campaignId, req.session.userId!);
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isMember && !isGM) return res.status(403).json({ error: "Not a campaign member" });
      const event = await storage.getWorldTimelineEvent(eventId);
      if (!event || event.campaignId !== campaignId) return res.status(404).json({ error: "Event not found" });
      if (!isGM && event.visibility === 'gm_only') return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (e) {
      console.error("Failed to get timeline event:", e);
      res.status(500).json({ error: "Failed to get timeline event" });
    }
  });

  app.post("/api/campaigns/:campaignId/timeline-events", requireAuth, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can create timeline events" });
      const parsed = insertWorldTimelineEventSchema.parse({ ...req.body, campaignId });
      const event = await storage.createWorldTimelineEvent(parsed);
      broadcastToCampaign(campaignId, { type: "world_timeline_event_created", event });
      res.status(201).json(event);
    } catch (e) {
      console.error("Failed to create timeline event:", e);
      res.status(500).json({ error: "Failed to create timeline event" });
    }
  });

  app.patch("/api/campaigns/:campaignId/timeline-events/:eventId", requireAuth, async (req, res) => {
    try {
      const { campaignId, eventId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can update timeline events" });
      const existing = await storage.getWorldTimelineEvent(eventId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Event not found" });
      const event = await storage.updateWorldTimelineEvent(eventId, req.body);
      broadcastToCampaign(campaignId, { type: "world_timeline_event_updated", event });
      res.json(event);
    } catch (e) {
      console.error("Failed to update timeline event:", e);
      res.status(500).json({ error: "Failed to update timeline event" });
    }
  });

  app.delete("/api/campaigns/:campaignId/timeline-events/:eventId", requireAuth, async (req, res) => {
    try {
      const { campaignId, eventId } = req.params;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const isGM = await hasGmAccess(req.session.userId!, campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only GMs can delete timeline events" });
      const existing = await storage.getWorldTimelineEvent(eventId);
      if (!existing || existing.campaignId !== campaignId) return res.status(404).json({ error: "Event not found" });
      await storage.deleteWorldTimelineEvent(eventId);
      broadcastToCampaign(campaignId, { type: "world_timeline_event_deleted", eventId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete timeline event:", e);
      res.status(500).json({ error: "Failed to delete timeline event" });
    }
  });

  // ==================== WORLD CRUD ROUTES ====================

  app.get("/api/worlds", requireAuth, async (req, res) => {
    try {
      const worldsList = await storage.getWorldsByUser(req.session.userId!);
      res.json(worldsList);
    } catch (e) {
      console.error("Failed to get worlds:", e);
      res.status(500).json({ error: "Failed to get worlds" });
    }
  });

  app.post("/api/worlds", requireAuth, async (req, res) => {
    try {
      const parsed = insertWorldSchema.parse({ ...req.body, userId: req.session.userId! });
      const world = await storage.createWorld(parsed);
      res.status(201).json(world);
    } catch (e) {
      console.error("Failed to create world:", e);
      res.status(500).json({ error: "Failed to create world" });
    }
  });

  app.get("/api/worlds/:worldId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      res.json(world);
    } catch (e) {
      console.error("Failed to get world:", e);
      res.status(500).json({ error: "Failed to get world" });
    }
  });

  app.patch("/api/worlds/:worldId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const updated = await storage.updateWorld(req.params.worldId, req.body);
      res.json(updated);
    } catch (e) {
      console.error("Failed to update world:", e);
      res.status(500).json({ error: "Failed to update world" });
    }
  });

  app.delete("/api/worlds/:worldId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      await storage.deleteWorld(req.params.worldId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world:", e);
      res.status(500).json({ error: "Failed to delete world" });
    }
  });

  // ==================== WORLD-SCOPED ENTITY ROUTES ====================

  app.get("/api/worlds/:worldId/entities", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const allEntities = await storage.getEntitiesByWorld(req.params.worldId);
      res.json(allEntities);
    } catch (e) {
      console.error("Failed to get world entities:", e);
      res.status(500).json({ error: "Failed to get entities" });
    }
  });

  app.get("/api/worlds/:worldId/entities/search", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const { q, type } = req.query;
      const allEntities = await storage.searchEntitiesByWorld(req.params.worldId, (q as string) || "", type as string | undefined);
      res.json(allEntities);
    } catch (e) {
      console.error("Failed to search world entities:", e);
      res.status(500).json({ error: "Failed to search entities" });
    }
  });

  app.get("/api/worlds/:worldId/entities/:entityId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const entity = await storage.getEntity(req.params.entityId);
      if (!entity || entity.worldId !== req.params.worldId) return res.status(404).json({ error: "Entity not found" });
      res.json(entity);
    } catch (e) {
      console.error("Failed to get world entity:", e);
      res.status(500).json({ error: "Failed to get entity" });
    }
  });

  app.post("/api/worlds/:worldId/entities", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertEntitySchema.parse({ ...req.body, worldId: req.params.worldId, createdBy: req.session.userId });
      const entity = await storage.createEntity(parsed);
      res.status(201).json(entity);
    } catch (e) {
      console.error("Failed to create world entity:", e);
      res.status(500).json({ error: "Failed to create entity" });
    }
  });

  app.patch("/api/worlds/:worldId/entities/:entityId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getEntity(req.params.entityId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Entity not found" });
      const entity = await storage.updateEntity(req.params.entityId, req.body);
      res.json(entity);
    } catch (e) {
      console.error("Failed to update world entity:", e);
      res.status(500).json({ error: "Failed to update entity" });
    }
  });

  app.delete("/api/worlds/:worldId/entities/:entityId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getEntity(req.params.entityId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Entity not found" });
      await storage.softDeleteEntity(req.params.entityId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world entity:", e);
      res.status(500).json({ error: "Failed to delete entity" });
    }
  });

  app.post("/api/worlds/:worldId/entities/:entityId/restore", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const entity = await storage.restoreEntity(req.params.entityId);
      if (!entity) return res.status(404).json({ error: "Entity not found" });
      res.json(entity);
    } catch (e) {
      console.error("Failed to restore world entity:", e);
      res.status(500).json({ error: "Failed to restore entity" });
    }
  });

  app.get("/api/worlds/:worldId/entities/:entityId/references", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const references = await storage.getEntityReferences(req.params.entityId);
      res.json(references);
    } catch (e) {
      console.error("Failed to get world entity references:", e);
      res.status(500).json({ error: "Failed to get entity references" });
    }
  });

  // ==================== WORLD-SCOPED ENTITY LINK ROUTES ====================

  app.get("/api/worlds/:worldId/entity-links", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const links = await storage.getEntityLinksByWorld(req.params.worldId);
      res.json(links);
    } catch (e) {
      console.error("Failed to get world entity links:", e);
      res.status(500).json({ error: "Failed to get entity links" });
    }
  });

  app.get("/api/worlds/:worldId/entity-links/entity/:entityId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const links = await storage.getEntityLinks(req.params.entityId);
      res.json(links);
    } catch (e) {
      console.error("Failed to get world entity links:", e);
      res.status(500).json({ error: "Failed to get entity links" });
    }
  });

  app.post("/api/worlds/:worldId/entity-links", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertEntityLinkSchema.parse({ ...req.body, worldId: req.params.worldId });
      const link = await storage.createEntityLink(parsed);
      res.status(201).json(link);
    } catch (e) {
      console.error("Failed to create world entity link:", e);
      res.status(500).json({ error: "Failed to create entity link" });
    }
  });

  app.patch("/api/worlds/:worldId/entity-links/:linkId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getEntityLink(req.params.linkId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Entity link not found" });
      const link = await storage.updateEntityLink(req.params.linkId, req.body);
      res.json(link);
    } catch (e) {
      console.error("Failed to update world entity link:", e);
      res.status(500).json({ error: "Failed to update entity link" });
    }
  });

  app.delete("/api/worlds/:worldId/entity-links/:linkId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getEntityLink(req.params.linkId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Entity link not found" });
      await storage.deleteEntityLink(req.params.linkId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world entity link:", e);
      res.status(500).json({ error: "Failed to delete entity link" });
    }
  });

  // ==================== WORLD-SCOPED SHARE LINK ROUTES ====================

  app.post("/api/worlds/:worldId/share-link", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldShareLinkByWorld(req.params.worldId);
      if (existing) return res.status(400).json({ error: "Share link already exists", link: existing });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: "User not found" });
      const worldSlug = world.name.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
      const userSlug = user.username.replace(/[^a-zA-Z0-9]+/g, '');
      let shareToken = `${worldSlug}${userSlug}`;
      const existingToken = await storage.getWorldShareLinkByToken(shareToken);
      if (existingToken) {
        shareToken = `${shareToken}-${crypto.randomBytes(3).toString('hex')}`;
      }
      const link = await storage.createWorldShareLink({
        worldId: req.params.worldId,
        token: shareToken,
        createdBy: req.session.userId!,
        isActive: true,
      });
      res.status(201).json(link);
    } catch (e) {
      console.error("Failed to create world share link:", e);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  app.get("/api/worlds/:worldId/share-link", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const link = await storage.getWorldShareLinkByWorld(req.params.worldId);
      res.json(link || null);
    } catch (e) {
      console.error("Failed to get world share link:", e);
      res.status(500).json({ error: "Failed to get share link" });
    }
  });

  app.delete("/api/worlds/:worldId/share-link/:linkId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      await storage.deleteWorldShareLink(req.params.linkId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world share link:", e);
      res.status(500).json({ error: "Failed to delete share link" });
    }
  });

  // ==================== WORLD-SCOPED WORLD MAP ROUTES ====================

  app.get("/api/worlds/:worldId/world-maps", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const maps = await storage.getWorldMapsByWorld(req.params.worldId);
      res.json(maps);
    } catch (e) {
      console.error("Failed to get world maps:", e);
      res.status(500).json({ error: "Failed to get world maps" });
    }
  });

  app.get("/api/worlds/:worldId/world-maps/:mapId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const map = await storage.getWorldMap(req.params.mapId);
      if (!map || map.worldId !== req.params.worldId) return res.status(404).json({ error: "Map not found" });
      res.json(map);
    } catch (e) {
      console.error("Failed to get world map:", e);
      res.status(500).json({ error: "Failed to get world map" });
    }
  });

  app.post("/api/worlds/:worldId/world-maps", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertWorldMapSchema.parse({ ...req.body, worldId: req.params.worldId });
      const map = await storage.createWorldMap(parsed);
      res.status(201).json(map);
    } catch (e) {
      console.error("Failed to create world map:", e);
      res.status(500).json({ error: "Failed to create world map" });
    }
  });

  app.patch("/api/worlds/:worldId/world-maps/:mapId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldMap(req.params.mapId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Map not found" });
      const map = await storage.updateWorldMap(req.params.mapId, req.body);
      res.json(map);
    } catch (e) {
      console.error("Failed to update world map:", e);
      res.status(500).json({ error: "Failed to update world map" });
    }
  });

  app.delete("/api/worlds/:worldId/world-maps/:mapId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldMap(req.params.mapId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Map not found" });
      await storage.deleteWorldMap(req.params.mapId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world map:", e);
      res.status(500).json({ error: "Failed to delete world map" });
    }
  });

  // ==================== WORLD-SCOPED WORLD MAP PIN ROUTES ====================

  app.get("/api/worlds/:worldId/world-maps/:mapId/pins", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const map = await storage.getWorldMap(req.params.mapId);
      if (!map || map.worldId !== req.params.worldId) return res.status(404).json({ error: "Map not found" });
      const pins = await storage.getWorldMapPins(req.params.mapId);
      res.json(pins);
    } catch (e) {
      console.error("Failed to get world map pins:", e);
      res.status(500).json({ error: "Failed to get map pins" });
    }
  });

  app.post("/api/worlds/:worldId/world-maps/:mapId/pins", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const map = await storage.getWorldMap(req.params.mapId);
      if (!map || map.worldId !== req.params.worldId) return res.status(404).json({ error: "Map not found" });
      const parsed = insertWorldMapPinSchema.parse({ ...req.body, mapId: req.params.mapId });
      const pin = await storage.createWorldMapPin(parsed);
      res.status(201).json(pin);
    } catch (e) {
      console.error("Failed to create world map pin:", e);
      res.status(500).json({ error: "Failed to create map pin" });
    }
  });

  app.patch("/api/worlds/:worldId/world-maps/:mapId/pins/:pinId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldMapPin(req.params.pinId);
      if (!existing || existing.mapId !== req.params.mapId) return res.status(404).json({ error: "Pin not found" });
      const pin = await storage.updateWorldMapPin(req.params.pinId, req.body);
      res.json(pin);
    } catch (e) {
      console.error("Failed to update world map pin:", e);
      res.status(500).json({ error: "Failed to update map pin" });
    }
  });

  app.delete("/api/worlds/:worldId/world-maps/:mapId/pins/:pinId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldMapPin(req.params.pinId);
      if (!existing || existing.mapId !== req.params.mapId) return res.status(404).json({ error: "Pin not found" });
      await storage.deleteWorldMapPin(req.params.pinId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world map pin:", e);
      res.status(500).json({ error: "Failed to delete map pin" });
    }
  });

  // ==================== WORLD-SCOPED CALENDAR ROUTES ====================

  app.get("/api/worlds/:worldId/calendars", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const calendars = await storage.getWorldCalendarsByWorld(req.params.worldId);
      res.json(calendars);
    } catch (e) {
      console.error("Failed to get world calendars:", e);
      res.status(500).json({ error: "Failed to get calendars" });
    }
  });

  app.get("/api/worlds/:worldId/calendars/:calendarId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const calendar = await storage.getWorldCalendar(req.params.calendarId);
      if (!calendar || calendar.worldId !== req.params.worldId) return res.status(404).json({ error: "Calendar not found" });
      res.json(calendar);
    } catch (e) {
      console.error("Failed to get world calendar:", e);
      res.status(500).json({ error: "Failed to get calendar" });
    }
  });

  app.post("/api/worlds/:worldId/calendars", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertWorldCalendarSchema.parse({ ...req.body, worldId: req.params.worldId });
      const calendar = await storage.createWorldCalendar(parsed);
      res.status(201).json(calendar);
    } catch (e) {
      console.error("Failed to create world calendar:", e);
      res.status(500).json({ error: "Failed to create calendar" });
    }
  });

  app.patch("/api/worlds/:worldId/calendars/:calendarId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldCalendar(req.params.calendarId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Calendar not found" });
      const calendar = await storage.updateWorldCalendar(req.params.calendarId, req.body);
      res.json(calendar);
    } catch (e) {
      console.error("Failed to update world calendar:", e);
      res.status(500).json({ error: "Failed to update calendar" });
    }
  });

  app.delete("/api/worlds/:worldId/calendars/:calendarId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldCalendar(req.params.calendarId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Calendar not found" });
      await storage.deleteWorldCalendar(req.params.calendarId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world calendar:", e);
      res.status(500).json({ error: "Failed to delete calendar" });
    }
  });

  // ==================== WORLD-SCOPED TIMELINE EVENT ROUTES ====================

  app.get("/api/worlds/:worldId/timeline-events", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const events = await storage.getWorldTimelineEventsByWorld(req.params.worldId);
      res.json(events);
    } catch (e) {
      console.error("Failed to get world timeline events:", e);
      res.status(500).json({ error: "Failed to get timeline events" });
    }
  });

  app.get("/api/worlds/:worldId/timeline-events/:eventId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const event = await storage.getWorldTimelineEvent(req.params.eventId);
      if (!event || event.worldId !== req.params.worldId) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (e) {
      console.error("Failed to get world timeline event:", e);
      res.status(500).json({ error: "Failed to get timeline event" });
    }
  });

  app.post("/api/worlds/:worldId/timeline-events", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertWorldTimelineEventSchema.parse({ ...req.body, worldId: req.params.worldId });
      const event = await storage.createWorldTimelineEvent(parsed);
      res.status(201).json(event);
    } catch (e) {
      console.error("Failed to create world timeline event:", e);
      res.status(500).json({ error: "Failed to create timeline event" });
    }
  });

  app.patch("/api/worlds/:worldId/timeline-events/:eventId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldTimelineEvent(req.params.eventId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Event not found" });
      const event = await storage.updateWorldTimelineEvent(req.params.eventId, req.body);
      res.json(event);
    } catch (e) {
      console.error("Failed to update world timeline event:", e);
      res.status(500).json({ error: "Failed to update timeline event" });
    }
  });

  app.delete("/api/worlds/:worldId/timeline-events/:eventId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getWorldTimelineEvent(req.params.eventId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Event not found" });
      await storage.deleteWorldTimelineEvent(req.params.eventId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete world timeline event:", e);
      res.status(500).json({ error: "Failed to delete timeline event" });
    }
  });

  // ==================== WORLD-SCOPED CALENDAR SYNC ROUTES ====================

  app.get("/api/worlds/:worldId/calendar-syncs", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const syncs = await storage.getCalendarSyncsByWorld(req.params.worldId);
      res.json(syncs);
    } catch (e) {
      console.error("Failed to get calendar syncs:", e);
      res.status(500).json({ error: "Failed to get calendar syncs" });
    }
  });

  app.post("/api/worlds/:worldId/calendar-syncs", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertWorldCalendarSyncSchema.parse({ ...req.body, worldId: req.params.worldId });
      const sync = await storage.createCalendarSync(parsed);
      res.status(201).json(sync);
    } catch (e) {
      console.error("Failed to create calendar sync:", e);
      res.status(500).json({ error: "Failed to create calendar sync" });
    }
  });

  app.delete("/api/worlds/:worldId/calendar-syncs/:syncId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getCalendarSync(req.params.syncId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Calendar sync not found" });
      await storage.deleteCalendarSync(req.params.syncId);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete calendar sync:", e);
      res.status(500).json({ error: "Failed to delete calendar sync" });
    }
  });

  // World Timeline CRUD (world-scoped)
  app.get("/api/worlds/:worldId/timelines", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      const timelines = await storage.getTimelinesByWorld(req.params.worldId);
      res.json(timelines);
    } catch (e) {
      console.error("Failed to get timelines:", e);
      res.status(500).json({ error: "Failed to get timelines" });
    }
  });

  app.post("/api/worlds/:worldId/timelines", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const parsed = insertWorldTimelineSchema.parse({ ...req.body, worldId: req.params.worldId });
      const timeline = await storage.createTimeline(parsed);
      if (world.campaignId) broadcastToCampaign(world.campaignId, { type: "world_timeline_created", timeline });
      res.status(201).json(timeline);
    } catch (e) {
      console.error("Failed to create timeline:", e);
      res.status(500).json({ error: "Failed to create timeline" });
    }
  });

  app.patch("/api/worlds/:worldId/timelines/:timelineId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getTimeline(req.params.timelineId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Timeline not found" });
      const timeline = await storage.updateTimeline(req.params.timelineId, req.body);
      if (world.campaignId) broadcastToCampaign(world.campaignId, { type: "world_timeline_updated", timeline });
      res.json(timeline);
    } catch (e) {
      console.error("Failed to update timeline:", e);
      res.status(500).json({ error: "Failed to update timeline" });
    }
  });

  app.delete("/api/worlds/:worldId/timelines/:timelineId", requireAuth, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ error: "World not found" });
      if (world.userId !== req.session.userId!) return res.status(403).json({ error: "Not the world owner" });
      const existing = await storage.getTimeline(req.params.timelineId);
      if (!existing || existing.worldId !== req.params.worldId) return res.status(404).json({ error: "Timeline not found" });
      await storage.deleteTimeline(req.params.timelineId);
      if (world.campaignId) broadcastToCampaign(world.campaignId, { type: "world_timeline_deleted", timelineId: req.params.timelineId });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to delete timeline:", e);
      res.status(500).json({ error: "Failed to delete timeline" });
    }
  });

  // ============ CAMPAIGN MAP PINS ============

  app.get("/api/campaigns/:campaignId/scenes/:sceneId/map-pins", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const membership = await storage.getCampaignMembership(req.session.userId!, req.params.campaignId);
      const isGM = campaign.gmUserId === req.session.userId!;
      if (!isGM && !membership) return res.status(403).json({ error: "Not a member of this campaign" });

      const pins = await storage.getCampaignMapPins(req.params.sceneId);
      res.json(pins);
    } catch (err) {
      console.error("Failed to get map pins:", err);
      res.status(500).json({ error: "Failed to get map pins" });
    }
  });

  app.post("/api/campaigns/:campaignId/scenes/:sceneId/map-pins", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, req.params.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can create map pins" });

      const parsed = insertCampaignMapPinSchema.parse({
        ...req.body,
        sceneId: req.params.sceneId,
        campaignId: req.params.campaignId,
      });
      const result = await storage.createCampaignMapPin(parsed);

      broadcastToCampaign(req.params.campaignId, { type: "campaign_map_pin_created", pin: result });
      res.status(201).json(result);
    } catch (err) {
      console.error("Failed to create map pin:", err);
      res.status(400).json({ error: "Failed to create map pin" });
    }
  });

  app.patch("/api/campaign-map-pins/:pinId", requireAuth, async (req, res) => {
    try {
      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can update map pins" });

      const result = await storage.updateCampaignMapPin(req.params.pinId, req.body);
      broadcastToCampaign(pin.campaignId, { type: "campaign_map_pin_updated", pin: result });
      res.json(result);
    } catch (err) {
      console.error("Failed to update map pin:", err);
      res.status(500).json({ error: "Failed to update map pin" });
    }
  });

  app.delete("/api/campaign-map-pins/:pinId", requireAuth, async (req, res) => {
    try {
      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can delete map pins" });

      await storage.deleteCampaignMapPin(req.params.pinId);
      broadcastToCampaign(pin.campaignId, { type: "campaign_map_pin_deleted", pinId: req.params.pinId });
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete map pin:", err);
      res.status(500).json({ error: "Failed to delete map pin" });
    }
  });

  // ============ SHOP ITEMS ============

  app.get("/api/campaign-map-pins/:pinId/shop-items", requireAuth, async (req, res) => {
    try {
      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const membership = await storage.getCampaignMembership(req.session.userId!, pin.campaignId);
      const isGM = campaign.gmUserId === req.session.userId!;
      if (!isGM && !membership) return res.status(403).json({ error: "Not a member of this campaign" });

      const shopItemsList = await storage.getShopItems(req.params.pinId);
      res.json(shopItemsList);
    } catch (err) {
      console.error("Failed to get shop items:", err);
      res.status(500).json({ error: "Failed to get shop items" });
    }
  });

  app.post("/api/campaign-map-pins/:pinId/shop-items", requireAuth, async (req, res) => {
    try {
      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can create shop items" });

      const parsed = insertShopItemSchema.parse({
        ...req.body,
        pinId: req.params.pinId,
      });
      const result = await storage.createShopItem(parsed);
      res.status(201).json(result);
    } catch (err) {
      console.error("Failed to create shop item:", err);
      res.status(400).json({ error: "Failed to create shop item" });
    }
  });

  app.patch("/api/shop-items/:itemId", requireAuth, async (req, res) => {
    try {
      const shopItem = await storage.getShopItem(req.params.itemId);
      if (!shopItem) return res.status(404).json({ error: "Shop item not found" });

      const pin = await storage.getCampaignMapPin(shopItem.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can update shop items" });

      const result = await storage.updateShopItem(req.params.itemId, req.body);
      res.json(result);
    } catch (err) {
      console.error("Failed to update shop item:", err);
      res.status(500).json({ error: "Failed to update shop item" });
    }
  });

  app.delete("/api/shop-items/:itemId", requireAuth, async (req, res) => {
    try {
      const shopItem = await storage.getShopItem(req.params.itemId);
      if (!shopItem) return res.status(404).json({ error: "Shop item not found" });

      const pin = await storage.getCampaignMapPin(shopItem.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can delete shop items" });

      await storage.deleteShopItem(req.params.itemId);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete shop item:", err);
      res.status(500).json({ error: "Failed to delete shop item" });
    }
  });

  app.post("/api/campaign-map-pins/:pinId/buy", requireAuth, async (req, res) => {
    try {
      const { shopItemId, characterId } = req.body;
      if (!shopItemId || !characterId) return res.status(400).json({ error: "shopItemId and characterId are required" });

      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const character = await storage.getCharacter(characterId);
      if (!character) return res.status(404).json({ error: "Character not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM && character.userId !== req.session.userId!) {
        const membership = await storage.getCampaignMembership(req.session.userId!, pin.campaignId);
        if (!membership || membership.assignedCharacterId !== characterId) {
          return res.status(403).json({ error: "Character does not belong to you" });
        }
      }

      const shopItem = await storage.getShopItem(shopItemId);
      if (!shopItem) return res.status(404).json({ error: "Shop item not found" });
      if (shopItem.pinId !== req.params.pinId) return res.status(400).json({ error: "Shop item does not belong to this pin" });

      if (shopItem.quantity === 0) return res.status(400).json({ error: "Item is out of stock" });

      const currencyToCopper: Record<string, number> = { platinum: 1000, gold: 100, silver: 10, copper: 1 };
      const totalCostCopper = shopItem.price * (currencyToCopper[shopItem.currency] || 1);

      const characterItems = await storage.getItemsByCharacter(characterId);
      const currencyItems = characterItems.filter(i => i.itemType === 'currency');

      let totalCopperHeld = 0;
      for (const ci of currencyItems) {
        const rate = currencyToCopper[ci.currency] || 1;
        totalCopperHeld += ci.quantity * rate;
      }

      if (totalCopperHeld < totalCostCopper) {
        return res.status(400).json({ error: "Insufficient funds", required: totalCostCopper, available: totalCopperHeld });
      }

      let remaining = totalCostCopper;
      const sortOrder = ['copper', 'silver', 'gold', 'platinum'];
      const sortedCurrency = [...currencyItems].sort((a, b) => sortOrder.indexOf(a.currency) - sortOrder.indexOf(b.currency));

      for (const ci of sortedCurrency) {
        if (remaining <= 0) break;
        const rate = currencyToCopper[ci.currency] || 1;
        const itemValueCopper = ci.quantity * rate;

        if (itemValueCopper <= remaining) {
          remaining -= itemValueCopper;
          await storage.deleteItem(ci.id);
        } else {
          const unitsNeeded = Math.ceil(remaining / rate);
          const changeCopper = (unitsNeeded * rate) - remaining;
          remaining = 0;

          if (ci.quantity - unitsNeeded > 0) {
            await storage.updateItem(ci.id, { quantity: ci.quantity - unitsNeeded });
          } else {
            await storage.deleteItem(ci.id);
          }

          if (changeCopper > 0) {
            let changeCopperLeft = changeCopper;
            for (const denom of ['platinum', 'gold', 'silver', 'copper'] as const) {
              const denomRate = currencyToCopper[denom];
              if (changeCopperLeft >= denomRate) {
                const count = Math.floor(changeCopperLeft / denomRate);
                changeCopperLeft -= count * denomRate;
                await storage.createItem({
                  characterId,
                  name: denom.charAt(0).toUpperCase() + denom.slice(1),
                  itemType: 'currency',
                  currency: denom,
                  quantity: count,
                  price: 1,
                  rarity: 'common',
                  durability: 10,
                  isEquipped: false,
                  isContainer: false,
                  isHeavy: false,
                  rulesVisible: true,
                  breakChance: 0,
                  itemWeight: 0,
                  priceCopper: 0,
                  priceSilver: 0,
                  priceGold: 0,
                  pricePlatinum: 0,
                  isArchived: false,
                  isDamaging: false,
                  isDetonatable: false,
                  canApplyEffects: false,
                  grantsDcBonus: false,
                  dcBonusValue: 0,
                  isTemplate: false,
                } as any);
              }
            }
          }
        }
      }

      const itemData = (shopItem.itemData || {}) as Record<string, any>;
      const newItem = await storage.createItem({
        characterId,
        name: itemData.name || shopItem.name,
        description: itemData.description || shopItem.description || '',
        image: itemData.image || shopItem.image,
        itemType: itemData.itemType || shopItem.itemType || 'utility',
        quantity: 1,
        price: shopItem.price,
        currency: shopItem.currency,
        rarity: itemData.rarity || 'common',
        durability: itemData.durability ?? 10,
        damage: itemData.damage,
        damageType: itemData.damageType,
        mod: itemData.mod ?? 0,
        range: itemData.range,
        aoe: itemData.aoe,
        attribute: itemData.attribute,
        size: itemData.size,
        isHeavy: itemData.isHeavy ?? false,
        isEquipped: false,
        isContainer: itemData.isContainer ?? false,
        carryCapacity: itemData.carryCapacity ?? 0,
        armorSlot: itemData.armorSlot,
        armorBonus: itemData.armorBonus ?? 0,
        damageReduction: itemData.damageReduction ?? 0,
        damageReductionType: itemData.damageReductionType,
        rulesVisible: true,
        breakChance: itemData.breakChance ?? 10,
        itemWeight: itemData.itemWeight ?? 0,
        priceCopper: 0,
        priceSilver: 0,
        priceGold: 0,
        pricePlatinum: 0,
        isArchived: false,
        isDamaging: itemData.isDamaging ?? false,
        isDetonatable: itemData.isDetonatable ?? false,
        canApplyEffects: itemData.canApplyEffects ?? false,
        grantsDcBonus: itemData.grantsDcBonus ?? false,
        dcBonusValue: itemData.dcBonusValue ?? 0,
        isTemplate: false,
      } as any);

      if (shopItem.quantity > 0) {
        await storage.updateShopItem(shopItemId, { quantity: shopItem.quantity - 1 });
      }

      if (pin.shopkeeperCharacterId) {
        let copperToAdd = totalCostCopper;
        for (const denom of ['platinum', 'gold', 'silver', 'copper'] as const) {
          const denomRate = currencyToCopper[denom];
          if (copperToAdd >= denomRate) {
            const count = Math.floor(copperToAdd / denomRate);
            copperToAdd -= count * denomRate;
            await storage.createItem({
              characterId: pin.shopkeeperCharacterId,
              name: denom.charAt(0).toUpperCase() + denom.slice(1),
              itemType: 'currency', currency: denom, quantity: count, price: 1,
              rarity: 'common', durability: 10, isEquipped: false, isContainer: false,
              isHeavy: false, rulesVisible: true, breakChance: 0, itemWeight: 0,
              priceCopper: 0, priceSilver: 0, priceGold: 0, pricePlatinum: 0,
              isArchived: false, isDamaging: false, isDetonatable: false,
              canApplyEffects: false, grantsDcBonus: false, dcBonusValue: 0, isTemplate: false,
            } as any);
          }
        }
      }

      res.json({ success: true, item: newItem });
    } catch (err) {
      console.error("Failed to buy item:", err);
      res.status(500).json({ error: "Failed to buy item" });
    }
  });

  app.post("/api/campaign-map-pins/:pinId/sell", requireAuth, async (req, res) => {
    try {
      const { characterId, itemId, sellPercentage } = req.body;
      if (!characterId || !itemId || sellPercentage == null) {
        return res.status(400).json({ error: "characterId, itemId, and sellPercentage are required" });
      }

      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Map pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const character = await storage.getCharacter(characterId);
      if (!character) return res.status(404).json({ error: "Character not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM && character.userId !== req.session.userId!) {
        const membership = await storage.getCampaignMembership(req.session.userId!, pin.campaignId);
        if (!membership || membership.assignedCharacterId !== characterId) {
          return res.status(403).json({ error: "Character does not belong to you" });
        }
      }

      const item = await storage.getItem(itemId);
      if (!item || item.characterId !== characterId) {
        return res.status(404).json({ error: "Item not found in character inventory" });
      }

      const currencyToCopper: Record<string, number> = { platinum: 1000, gold: 100, silver: 10, copper: 1 };
      const itemValueCopper = item.price * (currencyToCopper[item.currency] || 1);
      const sellValueCopper = Math.floor(itemValueCopper * (sellPercentage / 100));

      if (item.quantity > 1) {
        await storage.updateItem(itemId, { quantity: item.quantity - 1 });
      } else {
        await storage.deleteItem(itemId);
      }

      let bestCurrency = 'copper';
      let bestAmount = sellValueCopper;

      if (sellValueCopper > 0) {
        let copperLeft = sellValueCopper;
        for (const denom of ['platinum', 'gold', 'silver', 'copper'] as const) {
          const denomRate = currencyToCopper[denom];
          if (copperLeft >= denomRate) {
            const count = Math.floor(copperLeft / denomRate);
            copperLeft -= count * denomRate;
            await storage.createItem({
              characterId,
              name: denom.charAt(0).toUpperCase() + denom.slice(1),
              itemType: 'currency',
              currency: denom,
              quantity: count,
              price: 1,
              rarity: 'common',
              durability: 10,
              isEquipped: false,
              isContainer: false,
              isHeavy: false,
              rulesVisible: true,
              breakChance: 0,
              itemWeight: 0,
              priceCopper: 0,
              priceSilver: 0,
              priceGold: 0,
              pricePlatinum: 0,
              isArchived: false,
              isDamaging: false,
              isDetonatable: false,
              canApplyEffects: false,
              grantsDcBonus: false,
              dcBonusValue: 0,
              isTemplate: false,
            } as any);
          }
        }

        for (const denom of ['platinum', 'gold', 'silver', 'copper'] as const) {
          const denomRate = currencyToCopper[denom];
          if (sellValueCopper >= denomRate && sellValueCopper % denomRate === 0) {
            bestCurrency = denom;
            bestAmount = sellValueCopper / denomRate;
            break;
          }
        }
      }

      if (pin.shopkeeperCharacterId && sellValueCopper > 0) {
        const shopkeeperItems = await storage.getItemsByCharacter(pin.shopkeeperCharacterId);
        const shopkeeperCurrency = shopkeeperItems.filter(i => i.itemType === 'currency');
        let remaining = sellValueCopper;
        const sortOrder = ['platinum', 'gold', 'silver', 'copper'];
        const sortedCurrency = [...shopkeeperCurrency].sort((a, b) => sortOrder.indexOf(a.currency) - sortOrder.indexOf(b.currency));

        for (const ci of sortedCurrency) {
          if (remaining <= 0) break;
          const rate = currencyToCopper[ci.currency] || 1;
          const itemValueCopper = ci.quantity * rate;

          if (itemValueCopper <= remaining) {
            remaining -= itemValueCopper;
            await storage.deleteItem(ci.id);
          } else {
            const unitsNeeded = Math.ceil(remaining / rate);
            const changeCopper = (unitsNeeded * rate) - remaining;
            remaining = 0;

            if (ci.quantity - unitsNeeded > 0) {
              await storage.updateItem(ci.id, { quantity: ci.quantity - unitsNeeded });
            } else {
              await storage.deleteItem(ci.id);
            }

            if (changeCopper > 0) {
              let changeCopperLeft = changeCopper;
              for (const denom of ['platinum', 'gold', 'silver', 'copper'] as const) {
                const denomRate = currencyToCopper[denom];
                if (changeCopperLeft >= denomRate) {
                  const count = Math.floor(changeCopperLeft / denomRate);
                  changeCopperLeft -= count * denomRate;
                  await storage.createItem({
                    characterId: pin.shopkeeperCharacterId!,
                    name: denom.charAt(0).toUpperCase() + denom.slice(1),
                    itemType: 'currency', currency: denom, quantity: count, price: 1,
                    rarity: 'common', durability: 10, isEquipped: false, isContainer: false,
                    isHeavy: false, rulesVisible: true, breakChance: 0, itemWeight: 0,
                    priceCopper: 0, priceSilver: 0, priceGold: 0, pricePlatinum: 0,
                    isArchived: false, isDamaging: false, isDetonatable: false,
                    canApplyEffects: false, grantsDcBonus: false, dcBonusValue: 0, isTemplate: false,
                  } as any);
                }
              }
            }
          }
        }
      }

      res.json({ success: true, earnings: { amount: bestAmount, currency: bestCurrency } });
    } catch (err) {
      console.error("Failed to sell item:", err);
      res.status(500).json({ error: "Failed to sell item" });
    }
  });

  app.get("/api/campaign-map-pins/:pinId/haggle-rolls", requireAuth, async (req, res) => {
    try {
      const rolls = await storage.getShopHaggleRolls(req.params.pinId);
      res.json(rolls);
    } catch (err) {
      console.error("Failed to get haggle rolls:", err);
      res.status(500).json({ error: "Failed to get haggle rolls" });
    }
  });

  app.get("/api/campaign-map-pins/:pinId/haggle-rolls/:characterId", requireAuth, async (req, res) => {
    try {
      const roll = await storage.getShopHaggleRoll(req.params.pinId, req.params.characterId);
      res.json(roll || null);
    } catch (err) {
      console.error("Failed to get haggle roll:", err);
      res.status(500).json({ error: "Failed to get haggle roll" });
    }
  });

  app.post("/api/campaign-map-pins/:pinId/haggle-rolls", requireAuth, async (req, res) => {
    try {
      const { characterId, characterName, roll, sellPercentage, d20Result, charismaMod } = req.body;
      if (!characterId || roll == null || sellPercentage == null || d20Result == null) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const result = await storage.upsertShopHaggleRoll({
        pinId: req.params.pinId,
        characterId,
        characterName: characterName || '',
        roll,
        sellPercentage,
        d20Result,
        charismaMod: charismaMod || 0,
      });
      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (pin) {
        broadcastToCampaign(pin.campaignId, { type: "shop_haggle_roll_updated", pinId: req.params.pinId, roll: result });
      }
      res.json(result);
    } catch (err) {
      console.error("Failed to save haggle roll:", err);
      res.status(500).json({ error: "Failed to save haggle roll" });
    }
  });

  app.delete("/api/campaign-map-pins/:pinId/haggle-rolls/:characterId", requireAuth, async (req, res) => {
    try {
      const pin = await storage.getCampaignMapPin(req.params.pinId);
      if (!pin) return res.status(404).json({ error: "Pin not found" });

      const campaign = await storage.getCampaign(pin.campaignId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      const isGM = await hasGmAccess(req.session.userId!, pin.campaignId, campaign.gmUserId);
      if (!isGM) return res.status(403).json({ error: "Only the GM can reset haggle rolls" });

      await storage.deleteShopHaggleRoll(req.params.pinId, req.params.characterId);
      broadcastToCampaign(pin.campaignId, { type: "shop_haggle_roll_reset", pinId: req.params.pinId, characterId: req.params.characterId });
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to reset haggle roll:", err);
      res.status(500).json({ error: "Failed to reset haggle roll" });
    }
  });

  (async () => {
    try {
      const { eq, and, isNull } = await import('drizzle-orm');
      const aaV2CampaignRows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.system, 'aa-v2'));
      const campaignIds = aaV2CampaignRows.map(c => c.id);
      if (campaignIds.length === 0) {
        console.log('[AA V2 Fix] No AA V2 campaigns found');
        return;
      }
      for (const campId of campaignIds) {
        const chars = await storage.getCampaignCharacters(campId);
        for (const char of chars) {
          if (char.isTemplate) continue;
          const level = char.level || 1;
          let expectedTotal = 0;
          for (let lvl = 1; lvl <= level; lvl++) {
            expectedTotal += (lvl % 3 === 0) ? 5 : 3;
          }
          const charClasses = await storage.getCharacterClasses(char.id);
          let totalSpent = 0;
          for (const cc of charClasses) {
            const skills = await storage.getCharacterClassSkills(char.id, cc.classId);
            const nodes = await storage.getClassSkillNodes(cc.classId);
            for (const s of skills) {
              const node = nodes.find(n => n.id === s.nodeId);
              totalSpent += node?.cost || 0;
            }
          }
          const correctPoints = Math.max(0, expectedTotal - totalSpent);
          if ((char.classSkillPoints || 0) !== correctPoints) {
            await storage.updateCharacter(char.id, { classSkillPoints: correctPoints });
            console.log(`[AA V2 Fix] ${char.name}: classSkillPoints ${char.classSkillPoints || 0} -> ${correctPoints}`);
          }
        }
      }
      console.log('[AA V2 Fix] Class points correction complete');
    } catch (err) {
      console.error('[AA V2 Fix] Error correcting class points:', err);
    }
  })();

  return httpServer;
}
