import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertCampaignSchema, insertCharacterSchema, insertTokenSchema, insertChatMessageSchema, insertSceneSchema } from "@shared/schema";
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
  
  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Map to track campaign rooms
  const campaignRooms = new Map<string, Set<any>>();

  wss.on("connection", (ws, req) => {
    let currentCampaignId: string | null = null;

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "join_campaign" && message.campaignId) {
          currentCampaignId = message.campaignId;
          if (!campaignRooms.has(message.campaignId)) {
            campaignRooms.set(message.campaignId, new Set());
          }
          campaignRooms.get(message.campaignId)!.add(ws);
        }

        if (message.type === "token_move" && currentCampaignId) {
          // Broadcast to all clients in the campaign
          const room = campaignRooms.get(currentCampaignId);
          if (room) {
            room.forEach((client) => {
              if (client.readyState === 1) { // OPEN
                client.send(JSON.stringify(message));
              }
            });
          }
        }

        if (message.type === "chat_message" && currentCampaignId) {
          // Save to database and broadcast
          const chatMessage = await storage.createChatMessage({
            campaignId: currentCampaignId,
            userId: message.userId,
            sender: message.sender,
            text: message.text,
            type: message.messageType || "chat"
          });

          const room = campaignRooms.get(currentCampaignId);
          if (room) {
            room.forEach((client) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({ type: "chat_message", message: chatMessage }));
              }
            });
          }
        }
      } catch (err) {
        console.error("WebSocket error:", err);
      }
    });

    ws.on("close", () => {
      if (currentCampaignId) {
        const room = campaignRooms.get(currentCampaignId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) {
            campaignRooms.delete(currentCampaignId);
          }
        }
      }
    });
  });

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

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

      // Create default scene
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
    } catch (err) {
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
      const character = await storage.updateCharacter(req.params.id, req.body);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json(character);
    } catch (err) {
      res.status(400).json({ error: "Failed to update character" });
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

      const updatedCampaign = await storage.setActiveScene(req.params.campaignId, sceneId);
      res.json(updatedCampaign);
    } catch (err) {
      res.status(400).json({ error: "Failed to set active scene" });
    }
  });

  return httpServer;
}
