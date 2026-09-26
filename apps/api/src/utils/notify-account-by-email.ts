import { sql } from "drizzle-orm";
import db from "../database";
import { userTable } from "../database/schema";
import createNotification from "../notification/controllers/create-notification";

export type NotifyAccountResult =
  | { delivered: true }
  | { delivered: false; reason: "NO_ACCOUNT" };

/**
 * This instance sends no real email. Anything that would have been emailed is
 * delivered to the account that owns the address as an in-app notification
 * instead, which also reaches the recipient over the notification WebSocket.
 *
 * When no account owns the address there is nobody to reach, and the caller
 * has to fall back to something the sender can pass on by hand - an invitation
 * link, for instance. Callers must handle that rather than assume delivery.
 */
export async function notifyAccountByEmail(
  email: string,
  notification: {
    title: string;
    content: string;
    type: string;
    eventData?: Record<string, unknown> | null;
  },
): Promise<NotifyAccountResult> {
  const address = email.trim();
  if (!address) return { delivered: false, reason: "NO_ACCOUNT" };

  // Addresses are stored as the user typed them, so match case-insensitively
  // rather than assuming they were normalised on the way in.
  const recipient = await db.query.userTable.findFirst({
    where: sql`lower(${userTable.email}) = lower(${address})`,
    columns: { id: true },
  });

  if (!recipient) return { delivered: false, reason: "NO_ACCOUNT" };

  await createNotification({
    userId: recipient.id,
    title: notification.title,
    content: notification.content,
    type: notification.type,
    eventData: notification.eventData ?? null,
  });

  return { delivered: true };
}
