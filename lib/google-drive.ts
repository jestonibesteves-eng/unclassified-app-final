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
 * GOOGLE_SERVICE_ACCOUNT_KEY accepts:
 *   - The raw JSON string of the service account key
 *   - The service account JSON base64-encoded (recommended for hosted environments)
 *   - An absolute or relative path to the service account JSON key file
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
      const trimmed = keyRaw.trim();
      let raw: string;
      if (trimmed.startsWith("{")) {
        raw = trimmed;
      } else {
        let decoded: string | null = null;
        try {
          const candidate = Buffer.from(trimmed, "base64").toString("utf-8");
          if (candidate.trim().startsWith("{")) decoded = candidate;
        } catch { }

        if (decoded) {
          raw = decoded;
        } else {
          raw = fs.readFileSync(
            path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed),
            "utf-8"
          );
        }
      }
      credentials = JSON.parse(raw);
    } catch {
      return { error: "Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY — must be raw JSON, base64-encoded JSON, or a file path.", failedAt: new Date().toISOString() };
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
