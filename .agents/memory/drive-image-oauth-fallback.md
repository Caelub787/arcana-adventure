---
name: Drive image OAuth fallback scoping
description: Why any OAuth fallback for Drive image download must re-validate folder ancestry under the library root.
---

The image library uses a PUBLIC API-key Drive client. That client implicitly
scopes access — it can only read files that are broadly/publicly shared, so it
naturally limits `/api/drive/image/:fileId` (and `/save`) to library files even
though those routes are only `requireAuth` and accept an arbitrary `fileId`.

**Rule:** If you add an authenticated (OAuth connector) fallback for Drive
downloads, you MUST re-validate that the requested file is a descendant of
`IMAGE_LIBRARY_ROOT_FOLDER_ID` before downloading. Walk the `parents` chain
upward (bounded depth + visited guard, multi-parent aware) and only proceed if
you reach the root.

**Why:** The connector account can read far more than the public API key. Without
the ancestry check, any logged-in user could exfiltrate arbitrary
connector-readable Drive files by guessing/knowing a file id. This was caught in
code review as a broken-access-control regression introduced by adding the
fallback.

**How to apply:** Keep the public-client-first / OAuth-second order in
`server/googleDrive.ts` `getImageBase64`; never let the OAuth branch download a
file that fails `isUnderLibraryRoot`. If the connector itself is unavailable,
rethrow the original public-client error rather than masking it.
