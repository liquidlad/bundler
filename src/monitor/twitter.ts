// Twitter/X account monitoring

import type { MonitorConfig } from "../types";

/**
 * Monitors specified Twitter/X accounts for new tweets.
 *
 * Options:
 * 1. twikit (Python, free) — poll every 5-10s, breaks when X changes
 * 2. Twitter API v2 Pro ($5K/mo) — filtered streams, real-time
 * 3. Custom scraper (Puppeteer) — slowest but hardest to detect
 *
 * Architecture:
 * - Poll target accounts at configured interval
 * - Track last seen tweet ID to detect new tweets
 * - Emit new tweets to the extraction pipeline
 * - Handle rate limits and scraper breakage gracefully
 */

// TODO: Implement Twitter monitoring
// - Set up polling loop for target accounts
// - Detect new tweets (compare against last seen ID)
// - Extract tweet text + attached media URLs
// - Pass to AI extractor pipeline

export interface Tweet {
  id: string;
  text: string;
  authorUsername: string;
  mediaUrls: string[];
  createdAt: Date;
  url: string;
}

export async function startMonitoring(
  config: MonitorConfig,
  onNewTweet: (tweet: Tweet) => Promise<void>
): Promise<void> {
  throw new Error("Not yet implemented");
}
