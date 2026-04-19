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
      let raw = keyRaw.trim().startsWith("{")
        ? keyRaw
        : fs.readFileSync(
            path.isAbsolute(keyRaw) ? keyRaw : path.resolve(process.cwd(), keyRaw),
            "utf-8"
          );
      // Some hosting panels convert \n escape sequences in env var values to actual
      // newlines, breaking JSON.parse. Fix by escaping literal newlines inside every
      // JSON string value (handles the PEM body AND the trailing \n after -----END-----).
      raw = raw.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
        match.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
      );
      credentials = JSON.parse(raw);
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
