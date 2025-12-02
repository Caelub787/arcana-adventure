// Google Drive integration for browsing image library
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Drive not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
async function getGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Root folder ID for the image library - restricts browsing to this folder only
export const IMAGE_LIBRARY_ROOT_FOLDER_ID = '1MAdVTaRIO4r2ZsQU5AxEyQgb9iH_na6D';

// List folders in a directory
export async function listFolders(parentId?: string): Promise<{ id: string; name: string; }[]> {
  const drive = await getGoogleDriveClient();
  
  // Use the image library root folder if no parent specified
  const effectiveParentId = parentId || IMAGE_LIBRARY_ROOT_FOLDER_ID;
  
  let query = `mimeType='application/vnd.google-apps.folder' and trashed=false and '${effectiveParentId}' in parents`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    orderBy: 'name',
    pageSize: 100,
  });

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
  }));
}

// List image files in a directory
export async function listImages(folderId?: string): Promise<{ id: string; name: string; thumbnailLink?: string; webContentLink?: string; }[]> {
  const drive = await getGoogleDriveClient();
  
  // Use the image library root folder if no folder specified
  const effectiveFolderId = folderId || IMAGE_LIBRARY_ROOT_FOLDER_ID;
  
  let query = `(mimeType contains 'image/') and trashed=false and '${effectiveFolderId}' in parents`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, thumbnailLink, webContentLink)',
    orderBy: 'name',
    pageSize: 100,
  });

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    thumbnailLink: file.thumbnailLink || undefined,
    webContentLink: file.webContentLink || undefined,
  }));
}

// Maximum file size for image downloads (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Get a direct image URL (base64 encoded for use in app)
export async function getImageBase64(fileId: string): Promise<string> {
  const drive = await getGoogleDriveClient();
  
  // First get file metadata to check mime type and size
  const metadata = await drive.files.get({
    fileId,
    fields: 'mimeType,size',
  });
  
  const mimeType = metadata.data.mimeType || 'image/png';
  const fileSize = parseInt(metadata.data.size || '0', 10);
  
  // Check file size to prevent memory issues
  if (fileSize > MAX_IMAGE_SIZE) {
    throw new Error(`Image file is too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is 10MB.`);
  }
  
  // Download the file content
  const response = await drive.files.get({
    fileId,
    alt: 'media',
  }, {
    responseType: 'arraybuffer',
  });
  
  const buffer = Buffer.from(response.data as ArrayBuffer);
  const base64 = buffer.toString('base64');
  
  return `data:${mimeType};base64,${base64}`;
}

// Search for files by name
export async function searchImages(searchTerm: string, folderId?: string): Promise<{ id: string; name: string; thumbnailLink?: string; }[]> {
  const drive = await getGoogleDriveClient();
  
  let query = `(mimeType contains 'image/') and trashed=false and name contains '${searchTerm.replace(/'/g, "\\'")}'`;
  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, thumbnailLink)',
    orderBy: 'name',
    pageSize: 50,
  });

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    thumbnailLink: file.thumbnailLink || undefined,
  }));
}
