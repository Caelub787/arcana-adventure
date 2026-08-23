import { google } from 'googleapis';
import crypto from 'crypto';
import { storage } from './storage';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

const pendingOAuthStates = new Map<string, { userId: string; origin: string; expiresAt: number }>();

function getRedirectUri(origin: string): string {
  return `${origin}/api/google/callback`;
}

function resolveOrigin(reqHost?: string): string {
  if (reqHost && !reqHost.includes('localhost')) {
    const host = reqHost.split(':')[0];
    return `https://${host}`;
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  return 'http://localhost:5000';
}

function getOAuth2Client(origin: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(origin));
}

export function getAuthUrl(userId: string, reqHost?: string): string {
  const origin = resolveOrigin(reqHost);
  const nonce = crypto.randomBytes(32).toString('hex');
  pendingOAuthStates.set(nonce, { userId, origin, expiresAt: Date.now() + 10 * 60 * 1000 });
  const client = getOAuth2Client(origin);
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: nonce,
  });
}

export function validateOAuthState(nonce: string): { userId: string; origin: string } | null {
  const entry = pendingOAuthStates.get(nonce);
  if (!entry) return null;
  pendingOAuthStates.delete(nonce);
  if (Date.now() > entry.expiresAt) return null;
  return { userId: entry.userId, origin: entry.origin };
}

export async function exchangeCodeForTokens(code: string, userId: string, origin: string): Promise<{ email: string }> {
  const client = getOAuth2Client(origin);
  const { tokens } = await client.getToken(code);

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const userInfo = await oauth2.userinfo.get();

  await storage.updateUserGoogleTokens(userId, {
    googleAccessToken: tokens.access_token || null,
    googleRefreshToken: tokens.refresh_token || null,
    googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    googleEmail: userInfo.data.email || null,
  });

  return { email: userInfo.data.email || '' };
}

export async function getUserGoogleClient(userId: string): Promise<{ drive: ReturnType<typeof google.drive>; docs: ReturnType<typeof google.docs> }> {
  const tokens = await storage.getUserGoogleTokens(userId);
  if (!tokens || !tokens.googleAccessToken) {
    throw new Error('Google account not connected. Please connect your Google account in your profile settings.');
  }

  const client = getOAuth2Client(resolveOrigin());
  client.setCredentials({
    access_token: tokens.googleAccessToken,
    refresh_token: tokens.googleRefreshToken,
    expiry_date: tokens.googleTokenExpiry ? tokens.googleTokenExpiry.getTime() : undefined,
  });

  const now = Date.now();
  const expiry = tokens.googleTokenExpiry ? tokens.googleTokenExpiry.getTime() : 0;
  if (expiry && expiry < now + 60000) {
    if (!tokens.googleRefreshToken) {
      throw new Error('Google session expired. Please reconnect your Google account in your profile settings.');
    }
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      await storage.updateUserGoogleTokens(userId, {
        googleAccessToken: credentials.access_token || null,
        googleRefreshToken: credentials.refresh_token || tokens.googleRefreshToken,
        googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        googleEmail: tokens.googleEmail,
      });
    } catch (err) {
      throw new Error('Failed to refresh Google session. Please reconnect your Google account in your profile settings.');
    }
  }

  return {
    drive: google.drive({ version: 'v3', auth: client }),
    docs: google.docs({ version: 'v1', auth: client }),
  };
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await storage.updateUserGoogleTokens(userId, {
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    googleEmail: null,
  });
}

export async function getGoogleConnectionStatus(userId: string): Promise<{ connected: boolean; email?: string }> {
  const tokens = await storage.getUserGoogleTokens(userId);
  if (!tokens || !tokens.googleAccessToken) {
    return { connected: false };
  }
  return { connected: true, email: tokens.googleEmail || undefined };
}

export interface GoogleDocInfo {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function listUserGoogleDocs(userId: string, pageSize: number = 50): Promise<GoogleDocInfo[]> {
  const { drive } = await getUserGoogleClient(userId);
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.document' and trashed=false",
    fields: 'files(id, name, modifiedTime, webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize,
  });
  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    modifiedTime: file.modifiedTime || undefined,
    webViewLink: file.webViewLink || undefined,
  }));
}

export async function exportNoteToUserGoogleDoc(
  userId: string,
  title: string,
  content: string,
  existingDocId?: string
): Promise<{ docId: string; webViewLink: string }> {
  const { drive, docs } = await getUserGoogleClient(userId);

  if (existingDocId) {
    const existingDoc = await docs.documents.get({ documentId: existingDocId });
    const docContent = existingDoc.data.body?.content || [];
    let endIndex = 1;
    for (const element of docContent) {
      if (element.endIndex && element.endIndex > endIndex) {
        endIndex = element.endIndex;
      }
    }
    const requests: any[] = [];
    if (endIndex > 2) {
      requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
    }
    requests.push({ insertText: { location: { index: 1 }, text: content } });
    if (requests.length > 0) {
      await docs.documents.batchUpdate({ documentId: existingDocId, requestBody: { requests } });
    }
    await drive.files.update({ fileId: existingDocId, requestBody: { name: title } });
    const updatedFile = await drive.files.get({ fileId: existingDocId, fields: 'webViewLink' });
    return {
      docId: existingDocId,
      webViewLink: updatedFile.data.webViewLink || `https://docs.google.com/document/d/${existingDocId}/edit`,
    };
  } else {
    const file = await drive.files.create({
      requestBody: { name: title, mimeType: 'application/vnd.google-apps.document' },
      fields: 'id, webViewLink',
    });
    const docId = file.data.id!;
    if (content) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: content } }] },
      });
    }
    return {
      docId,
      webViewLink: file.data.webViewLink || `https://docs.google.com/document/d/${docId}/edit`,
    };
  }
}

export async function importUserGoogleDoc(userId: string, docId: string): Promise<{ title: string; content: string }> {
  const { drive, docs } = await getUserGoogleClient(userId);
  const fileInfo = await drive.files.get({ fileId: docId, fields: 'name' });
  const doc = await docs.documents.get({ documentId: docId });
  let content = '';
  const body = doc.data.body?.content || [];
  for (const element of body) {
    if (element.paragraph) {
      for (const textElement of element.paragraph.elements || []) {
        if (textElement.textRun?.content) {
          content += textElement.textRun.content;
        }
      }
    }
  }
  return { title: fileInfo.data.name || 'Imported Note', content: content.trim() };
}
