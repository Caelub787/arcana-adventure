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

// Maximum file size for direct image downloads (10MB)
// Images larger than this will use Google Drive's thumbnail resizing
const MAX_DIRECT_IMAGE_SIZE = 10 * 1024 * 1024;

// Maximum allowed size for resized images (50MB original -> ~2-5MB resized)
const MAX_RESIZABLE_IMAGE_SIZE = 100 * 1024 * 1024;

// Target width for large image resizing (maintains aspect ratio)
const LARGE_IMAGE_RESIZE_WIDTH = 2000;

// Get a direct image URL (base64 encoded for use in app)
// For large images, automatically fetches a resized version via Google Drive thumbnails
export async function getImageBase64(fileId: string): Promise<string> {
  const drive = await getGoogleDriveClient();
  
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

// Get all folder IDs recursively under a parent folder (for recursive search)
async function getAllFolderIds(parentId: string): Promise<string[]> {
  const drive = await getGoogleDriveClient();
  const allFolderIds: string[] = [parentId];
  const foldersToProcess: string[] = [parentId];
  
  while (foldersToProcess.length > 0) {
    const currentFolder = foldersToProcess.pop()!;
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false and '${currentFolder}' in parents`,
      fields: 'files(id)',
      pageSize: 100,
    });
    
    const subfolders = response.data.files || [];
    for (const folder of subfolders) {
      if (folder.id) {
        allFolderIds.push(folder.id);
        foldersToProcess.push(folder.id);
      }
    }
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
  const drive = await getGoogleDriveClient();
  
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
  
  // No folder specified - search recursively in all allowed folders
  // allowedFolderIds already fetched above
  
  // Build query with all allowed folder IDs (OR conditions)
  // Google Drive API has query length limits, so we batch if needed
  const MAX_FOLDERS_PER_QUERY = 20;
  const allResults: { id: string; name: string; thumbnailLink?: string; }[] = [];
  
  for (let i = 0; i < allowedFolderIds.length; i += MAX_FOLDERS_PER_QUERY) {
    const folderBatch = allowedFolderIds.slice(i, i + MAX_FOLDERS_PER_QUERY);
    const parentsClauses = folderBatch.map(id => `'${id}' in parents`).join(' or ');
    const query = `(mimeType contains 'image/') and trashed=false and name contains '${searchTerm.replace(/'/g, "\\'")}' and (${parentsClauses})`;
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, thumbnailLink)',
      orderBy: 'name',
      pageSize: 50,
    });

    const batchResults = (response.data.files || []).map(file => ({
      id: file.id!,
      name: file.name!,
      thumbnailLink: file.thumbnailLink || undefined,
    }));
    
    allResults.push(...batchResults);
    
    // Stop if we have enough results
    if (allResults.length >= 50) break;
  }
  
  // Dedupe and limit results
  const uniqueResults = Array.from(new Map(allResults.map(r => [r.id, r])).values());
  return uniqueResults.slice(0, 50);
}
