// Minimal subset of the @google-cloud/storage File API that the rest of this
// module (and its Canvas Realms duplicate) relies on. Any storage backend
// adapter — GCS, R2, S3 — implements this so callers never need to know
// which one is actually in use.
export interface StorageFileLike {
  name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<
    [{ contentType?: string; size?: number | string; metadata?: Record<string, string> }]
  >;
  setMetadata(opts: { metadata: Record<string, string> }): Promise<void>;
  createReadStream(): NodeJS.ReadableStream;
  save(
    data: Buffer,
    opts?: { contentType?: string; metadata?: Record<string, string>; resumable?: boolean }
  ): Promise<void>;
  getSignedUrl(opts: {
    version?: string;
    action: "read" | "write" | "delete";
    expires: number;
  }): Promise<[string]>;
}
