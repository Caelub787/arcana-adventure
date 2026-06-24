// Google Drive integration for browsing image library and Google Docs sync
import { google } from 'googleapis';

// Public Drive client using API key (for browsing the public shared image library folder).
// Uses GOOGLE_API_KEY env var. Read-only access to publicly shared files.
function getPublicDriveClient() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable not set');
  }
  return google.drive({ version: 'v3', auth: apiKey });
}

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

// Get Google Docs API client for reading/writing documents
export async function getGoogleDocsClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.docs({ version: 'v1', auth: oauth2Client });
}

// Get Google Drive connection status. The image library uses an API key against
// a publicly shared folder, so "connected" simply means the API key is configured.
export async function getGoogleDriveStatus(): Promise<{ connected: boolean; email?: string; name?: string }> {
  return { connected: !!process.env.GOOGLE_API_KEY };
}

// Root folder ID for the image library - restricts browsing to this folder only
export const IMAGE_LIBRARY_ROOT_FOLDER_ID = '1MAdVTaRIO4r2ZsQU5AxEyQgb9iH_na6D';

// List folders in a directory
export async function listFolders(parentId?: string): Promise<{ id: string; name: string; }[]> {
  const drive = getPublicDriveClient();
  
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
  const drive = getPublicDriveClient();
  
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

// Maximum file size for direct image downloads (10MB)
// Images larger than this will use Google Drive's thumbnail resizing
const MAX_DIRECT_IMAGE_SIZE = 10 * 1024 * 1024;

// Maximum allowed size for resized images (50MB original -> ~2-5MB resized)
const MAX_RESIZABLE_IMAGE_SIZE = 100 * 1024 * 1024;

// Target width for large image resizing (maintains aspect ratio)
const LARGE_IMAGE_RESIZE_WIDTH = 2000;

// Get a direct image URL (base64 encoded for use in app)
// For large images, automatically fetches a resized version via Google Drive thumbnails
//
// Tries the public API-key client first (fast, no token), then falls back to the
// authenticated Google Drive connector client. The API-key client can only read
// files that are broadly shared, so newly added or restricted images fail with it
// — the OAuth fallback can still download those.
export async function getImageBase64(fileId: string): Promise<string> {
  try {
    return await fetchImageBase64WithClient(getPublicDriveClient(), fileId);
  } catch (publicErr) {
    // The OAuth connector account can read far more than the public API key,
    // so before falling back we MUST confirm the requested file actually lives
    // inside the shared image-library tree. Otherwise any authenticated user
    // could download arbitrary connector-readable files by guessing an id.
    let drive: Awaited<ReturnType<typeof getGoogleDriveClient>>;
    try {
      drive = await getGoogleDriveClient();
    } catch {
      // Connector unavailable — surface the original public-client error.
      throw publicErr;
    }
    const allowed = await isUnderLibraryRoot(drive, fileId);
    if (!allowed) {
      throw new Error('Image is not part of the shared image library');
    }
    return await fetchImageBase64WithClient(drive, fileId);
  }
}

// Walk the parent chain of a file/folder up to a small depth to confirm it is
// a descendant of IMAGE_LIBRARY_ROOT_FOLDER_ID. Drive items can have multiple
// parents, so this does a bounded breadth-first walk with a visited guard.
async function isUnderLibraryRoot(
  drive: ReturnType<typeof getPublicDriveClient>,
  fileId: string,
): Promise<boolean> {
  if (fileId === IMAGE_LIBRARY_ROOT_FOLDER_ID) return true;
  const visited = new Set<string>();
  let frontier: string[] = [fileId];
  for (let depth = 0; depth < 25 && frontier.length > 0; depth++) {
    const parentLists = await Promise.all(
      frontier.map(async (id) => {
        try {
          const meta = await drive.files.get({ fileId: id, fields: 'parents' });
          return meta.data.parents || [];
        } catch {
          return [];
        }
      }),
    );
    const next: string[] = [];
    for (const parents of parentLists) {
      for (const parent of parents) {
        if (parent === IMAGE_LIBRARY_ROOT_FOLDER_ID) return true;
        if (!visited.has(parent)) {
          visited.add(parent);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return false;
}

async function fetchImageBase64WithClient(drive: ReturnType<typeof getPublicDriveClient>, fileId: string): Promise<string> {
  // First get file metadata to check mime type and size
  const metadata = await drive.files.get({
    fileId,
    fields: 'mimeType,size,thumbnailLink',
  });
  
  const mimeType = metadata.data.mimeType || 'image/png';
  const fileSize = parseInt(metadata.data.size || '0', 10);
  const thumbnailLink = metadata.data.thumbnailLink;
  
  // For images under the direct limit, download the full file
  if (fileSize <= MAX_DIRECT_IMAGE_SIZE) {
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
  
  // For large images, check if within resizable limit
  if (fileSize > MAX_RESIZABLE_IMAGE_SIZE) {
    throw new Error(`Image file is too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is ${Math.round(MAX_RESIZABLE_IMAGE_SIZE / 1024 / 1024)}MB.`);
  }
  
  // For large images, use Google Drive's thumbnail resizing
  // The thumbnail URL can be modified to get different sizes by changing the =s parameter
  if (thumbnailLink) {
    // Modify thumbnail URL to get a larger size (default is small)
    // Google Drive thumbnails have various formats:
    // - https://...=s220 (simple size)
    // - https://...=w220-h165-c (width/height with crop)
    // - https://...=s220-k (with additional flags)
    // We need to replace or append the size parameter
    let resizedUrl = thumbnailLink;
    
    if (thumbnailLink.includes('=s')) {
      // Replace existing =s{size} parameter (may have trailing flags)
      resizedUrl = thumbnailLink.replace(/=s\d+/, `=s${LARGE_IMAGE_RESIZE_WIDTH}`);
    } else if (thumbnailLink.includes('=w')) {
      // Replace existing =w{width} parameter
      resizedUrl = thumbnailLink.replace(/=w\d+/, `=w${LARGE_IMAGE_RESIZE_WIDTH}`);
    } else {
      // Append size parameter if none exists
      resizedUrl = thumbnailLink + `=s${LARGE_IMAGE_RESIZE_WIDTH}`;
    }
    
    console.log(`Resizing large image (${Math.round(fileSize / 1024 / 1024)}MB) via thumbnail: ${resizedUrl.substring(0, 100)}...`);
    
    try {
      // Fetch the resized thumbnail
      const response = await fetch(resizedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch resized image: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      
      console.log(`Successfully resized image to ${Math.round(buffer.length / 1024)}KB`);
      
      // Thumbnails are typically JPEG
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error('Failed to fetch resized thumbnail, falling back to original:', error);
      // Fall through to try direct download as last resort
    }
  } else {
    console.log(`No thumbnail link available for large image (${Math.round(fileSize / 1024 / 1024)}MB), attempting direct download`);
  }
  
  // Last resort: try direct download even for large files (may cause memory pressure)
  console.warn(`Downloading large image directly (${Math.round(fileSize / 1024 / 1024)}MB) - consider using smaller images`);
  
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

async function getAllFolderIds(parentId: string): Promise<string[]> {
  const drive = getPublicDriveClient();
  const allFolderIds: string[] = [parentId];
  let currentLevel: string[] = [parentId];
  
  while (currentLevel.length > 0) {
    const responses = await Promise.all(
      currentLevel.map(folderId =>
        drive.files.list({
          q: `mimeType='application/vnd.google-apps.folder' and trashed=false and '${folderId}' in parents`,
          fields: 'files(id)',
          pageSize: 100,
        })
      )
    );
    
    const nextLevel: string[] = [];
    for (const response of responses) {
      for (const folder of response.data.files || []) {
        if (folder.id) {
          allFolderIds.push(folder.id);
          nextLevel.push(folder.id);
        }
      }
    }
    currentLevel = nextLevel;
  }
  
  return allFolderIds;
}

// Cache for folder IDs to avoid repeated API calls
let cachedFolderIds: string[] | null = null;
let folderCacheTime = 0;
const FOLDER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAllowedFolderIds(): Promise<string[]> {
  const now = Date.now();
  if (cachedFolderIds && (now - folderCacheTime) < FOLDER_CACHE_TTL) {
    return cachedFolderIds;
  }
  
  cachedFolderIds = await getAllFolderIds(IMAGE_LIBRARY_ROOT_FOLDER_ID);
  folderCacheTime = now;
  console.log(`[GoogleDrive] Cached ${cachedFolderIds.length} allowed folder IDs`);
  return cachedFolderIds;
}

// Search for files by name - RESTRICTED to allowed folder tree
export async function searchImages(searchTerm: string, folderId?: string): Promise<{ id: string; name: string; thumbnailLink?: string; }[]> {
  const drive = getPublicDriveClient();
  
  // Get allowed folder IDs for validation and search
  const allowedFolderIds = await getAllowedFolderIds();
  
  // If a specific folder is provided, validate it's in the allowed tree
  if (folderId) {
    if (!allowedFolderIds.includes(folderId)) {
      console.warn(`[GoogleDrive] Search rejected: folderId ${folderId} not in allowed folder tree`);
      return []; // Reject search in unauthorized folders
    }
    
    const query = `(mimeType contains 'image/') and trashed=false and name contains '${searchTerm.replace(/'/g, "\\'")}' and '${folderId}' in parents`;
    
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
  
  const MAX_FOLDERS_PER_QUERY = 20;
  const batches: string[][] = [];
  for (let i = 0; i < allowedFolderIds.length; i += MAX_FOLDERS_PER_QUERY) {
    batches.push(allowedFolderIds.slice(i, i + MAX_FOLDERS_PER_QUERY));
  }

  const escapedTerm = searchTerm.replace(/'/g, "\\'");
  const batchPromises = batches.map(async (folderBatch) => {
    const parentsClauses = folderBatch.map(id => `'${id}' in parents`).join(' or ');
    const query = `(mimeType contains 'image/') and trashed=false and name contains '${escapedTerm}' and (${parentsClauses})`;
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
  });

  const batchResults = await Promise.all(batchPromises);
  const allResults = batchResults.flat();
  const uniqueResults = Array.from(new Map(allResults.map(r => [r.id, r])).values());
  return uniqueResults.slice(0, 50);
}

// ========== GOOGLE DOCS SYNC FUNCTIONS ==========

export interface GoogleDocInfo {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

// List Google Docs in the user's Drive
export async function listGoogleDocs(pageSize: number = 50): Promise<GoogleDocInfo[]> {
  const drive = await getGoogleDriveClient();
  
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

// Export a note to a Google Doc
export async function exportNoteToGoogleDoc(
  title: string, 
  content: string,
  existingDocId?: string
): Promise<{ docId: string; webViewLink: string }> {
  const drive = await getGoogleDriveClient();
  const docs = await getGoogleDocsClient();

  if (existingDocId) {
    // Update existing document
    // First, get the document to find its structure
    const existingDoc = await docs.documents.get({ documentId: existingDocId });
    const docContent = existingDoc.data.body?.content || [];
    
    // Calculate the end index of the document content (excluding the final newline)
    let endIndex = 1;
    for (const element of docContent) {
      if (element.endIndex && element.endIndex > endIndex) {
        endIndex = element.endIndex;
      }
    }
    
    // Clear existing content and insert new content
    const requests: any[] = [];
    
    // Delete all existing content (except the required first character)
    if (endIndex > 2) {
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: 1,
            endIndex: endIndex - 1,
          },
        },
      });
    }
    
    // Insert the new content
    requests.push({
      insertText: {
        location: { index: 1 },
        text: content,
      },
    });
    
    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: existingDocId,
        requestBody: { requests },
      });
    }
    
    // Update the document title if needed
    await drive.files.update({
      fileId: existingDocId,
      requestBody: { name: title },
    });
    
    // Get the web view link
    const updatedFile = await drive.files.get({
      fileId: existingDocId,
      fields: 'webViewLink',
    });
    
    return {
      docId: existingDocId,
      webViewLink: updatedFile.data.webViewLink || `https://docs.google.com/document/d/${existingDocId}/edit`,
    };
  } else {
    // Create a new Google Doc
    const fileMetadata = {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    };
    
    // Create the document
    const file = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink',
    });
    
    const docId = file.data.id!;
    
    // Insert content into the document
    if (content) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });
    }
    
    return {
      docId,
      webViewLink: file.data.webViewLink || `https://docs.google.com/document/d/${docId}/edit`,
    };
  }
}

// Import a Google Doc as note content
export async function importGoogleDoc(docId: string): Promise<{ title: string; content: string }> {
  const drive = await getGoogleDriveClient();
  const docs = await getGoogleDocsClient();
  
  // Get the document title
  const fileInfo = await drive.files.get({
    fileId: docId,
    fields: 'name',
  });
  
  // Get the document content
  const doc = await docs.documents.get({ documentId: docId });
  
  // Extract text content from the document
  let content = '';
  const body = doc.data.body?.content || [];
  
  for (const element of body) {
    if (element.paragraph) {
      const paragraph = element.paragraph;
      for (const textElement of paragraph.elements || []) {
        if (textElement.textRun?.content) {
          content += textElement.textRun.content;
        }
      }
    }
  }
  
  return {
    title: fileInfo.data.name || 'Imported Note',
    content: content.trim(),
  };
}
