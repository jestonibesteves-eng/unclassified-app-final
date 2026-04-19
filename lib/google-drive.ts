import { google } from "googleapis";
import fs from "fs";
import path from "path";

export type DriveUploadResult =
  | { driveFileId: string; uploadedAt: string }
  | { error: string; failedAt: string }
  | null; // null = Drive not configured (env vars absent)

/**
 * Uploads a backup file to Google Drive.
 * Returns null if GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_DRIVE_BACKUP_FOLDER_ID
 * env vars are not set (Drive not configured).
 * Never throws — errors are returned as { error, failedAt }.
 *
 * GOOGLE_SERVICE_ACCOUNT_KEY accepts either:
 *   - An absolute or relative path to the service account JSON key file
 *   - The raw JSON string of the service account key
 */
export async function uploadBackupToDrive(
  filePath: string,
  filename: string
): Promise<DriveUploadResult> {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;

  if (!keyRaw || !folderId) return null;

  try {
    let credentials: object;
    try {
      if (keyRaw.trim().startsWith("{")) {
        credentials = JSON.parse(keyRaw);
      } else {
        const absPath = path.isAbsolute(keyRaw)
          ? keyRaw
          : path.resolve(process.cwd(), keyRaw);
        credentials = JSON.parse(fs.readFileSync(absPath, "utf-8"));
      }
    } catch {
      return { error: "Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY — check it is valid JSON.", failedAt: new Date().toISOString() };
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: "application/octet-stream",
        body: fs.createReadStream(filePath),
      },
      fields: "id",
    });

    const driveFileId = response.data.id;
    if (!driveFileId) throw new Error("Drive did not return a file ID.");

    return { driveFileId, uploadedAt: new Date().toISOString() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { error, failedAt: new Date().toISOString() };
  }
}
