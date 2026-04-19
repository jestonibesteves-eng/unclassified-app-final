import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";

export type B2UploadResult =
  | { b2FileKey: string; uploadedAt: string }
  | { error: string; failedAt: string }
  | null; // null = B2 not configured (env vars absent)

/**
 * Uploads a backup file to Backblaze B2 via the S3-compatible API.
 * Returns null if B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, or B2_ENDPOINT
 * env vars are not set (B2 not configured).
 * Never throws — errors are returned as { error, failedAt }.
 *
 * Required env vars:
 *   B2_KEY_ID        — Application Key ID from the B2 console
 *   B2_APP_KEY       — Application Key secret
 *   B2_BUCKET_NAME   — Name of the target B2 bucket
 *   B2_ENDPOINT      — e.g. https://s3.us-west-004.backblazeb2.com
 */
export async function uploadBackupToB2(
  filePath: string,
  filename: string
): Promise<B2UploadResult> {
  const keyId    = process.env.B2_KEY_ID;
  const appKey   = process.env.B2_APP_KEY;
  const bucket   = process.env.B2_BUCKET_NAME;
  const endpoint = process.env.B2_ENDPOINT;

  if (!keyId || !appKey || !bucket || !endpoint) return null;

  try {
    const client = new S3Client({
      endpoint,
      region: "auto",
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: appKey,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        Body: fs.createReadStream(filePath),
        ContentType: "application/octet-stream",
      })
    );

    return { b2FileKey: filename, uploadedAt: new Date().toISOString() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { error, failedAt: new Date().toISOString() };
  }
}
