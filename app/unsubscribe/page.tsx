import { rawDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import type { DigestRecipient } from "@/lib/digest";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result invalid />;
  }

  const recipient = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE unsubscribe_token = ?`)
    .get(token) as DigestRecipient | undefined;

  if (!recipient || !recipient.active) {
    return <Result invalid />;
  }

  rawDb
    .prepare(`UPDATE "DigestRecipient" SET active = 0 WHERE id = ?`)
    .run(recipient.id);

  console.log(`[digest] Recipient ${recipient.email} unsubscribed via link`);

  const adminEmail = process.env.DIGEST_ADMIN_EMAIL;
  if (adminEmail) {
    const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const result = await sendEmail(
      adminEmail,
      `Digest unsubscribe: ${recipient.name}`,
      `<p style="font-family:sans-serif;font-size:14px;color:#374151;">
        <strong>${recipient.name}</strong> (${recipient.email}) has unsubscribed from the weekly digest.<br>
        Time: ${now} (PHT)<br><br>
        Re-activate them from the
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/digest">Digest Settings</a> page.
      </p>`
    );
    if (!result.ok) {
      console.error(`[digest] Failed to send unsubscribe alert: ${result.error}`);
    }
  } else {
    console.warn("[digest] DIGEST_ADMIN_EMAIL not set; skipping unsubscribe alert email");
  }

  return <Result invalid={false} />;
}

function Result({ invalid }: { invalid: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-[#14532d] px-8 py-5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-emerald-400/80">
            DAR · Region V · Bicol
          </p>
          <p className="text-sm font-bold text-white mt-1">Unclassified ARRs Data Management System</p>
        </div>
        <div className="px-8 py-8 text-center">
          {invalid ? (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-1">Link invalid or already used</p>
              <p className="text-xs text-gray-400">
                This unsubscribe link is not recognized or has already been processed.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-1">You&apos;ve been unsubscribed.</p>
              <p className="text-xs text-gray-400">
                You will no longer receive weekly digest emails. Contact your system administrator to re-subscribe.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
