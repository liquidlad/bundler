// Discord and Telegram notification utilities

import type { NotificationPayload } from "../types";

/**
 * Sends notifications to Discord (webhook) and Telegram (bot API)
 * for launch confirmations, sell alerts, and errors.
 */

// TODO: Implement notification channels
// - Discord webhook POST
// - Telegram sendMessage API

export async function sendNotification(
  payload: NotificationPayload
): Promise<void> {
  throw new Error("Not yet implemented");
}
