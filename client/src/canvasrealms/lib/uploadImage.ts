/**
 * Tiny image upload helper using the API server's presigned-URL flow.
 * Returns the canonical objectPath ("/objects/<uuid>") to store in the DB.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  const reqRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    // The api-server uses Clerk session cookies for auth. Without
    // `credentials: "include"` the browser will not send those cookies
    // and the endpoint returns 401, which is what made map image
    // uploads silently do nothing.
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type,
    }),
  });
  if (!reqRes.ok) {
    const body = (await reqRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Failed to request upload URL");
  }
  const { uploadURL, objectPath } = (await reqRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
  return objectPath;
}

/** Build a serving URL from a stored objectPath. */
export function objectUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}
