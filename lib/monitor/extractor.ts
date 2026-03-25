import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config";
import type { ExtractionResult } from "../types";

/**
 * Extract tweet ID from various Twitter/X URL formats.
 */
function extractTweetId(url: string): string {
  const match = url.match(/status\/(\d+)/);
  if (!match) throw new Error("Could not extract tweet ID from URL");
  return match[1];
}

/**
 * Scrape a tweet URL and extract its text + images.
 * Uses fxtwitter API (public, no auth needed) which returns full tweet data including media.
 * Falls back to Twitter oembed if fxtwitter fails.
 */
export async function scrapeTweet(tweetUrl: string): Promise<{
  text: string;
  authorUsername: string;
  mediaUrls: string[];
}> {
  const tweetId = extractTweetId(tweetUrl);

  // Try fxtwitter API first — returns full tweet data including media
  try {
    const fxUrl = `https://api.fxtwitter.com/status/${tweetId}`;
    const response = await fetch(fxUrl, {
      headers: { "User-Agent": "BundlerBot/1.0" },
    });

    if (response.ok) {
      const data = await response.json();
      const tweet = data.tweet;

      const mediaUrls: string[] = [];

      // Helper to extract photos from a tweet object
      function extractPhotos(t: any) {
        if (t?.media?.photos) {
          for (const photo of t.media.photos) {
            if (photo.url && !mediaUrls.includes(photo.url)) mediaUrls.push(photo.url);
          }
        }
        if (t?.media?.all) {
          for (const item of t.media.all) {
            if (item.type === "photo" && item.url && !mediaUrls.includes(item.url)) {
              mediaUrls.push(item.url);
            }
          }
        }
      }

      // 1. Check the tweet itself for images
      extractPhotos(tweet);

      // 2. If no images, check quoted tweet
      if (mediaUrls.length === 0 && tweet.quote) {
        extractPhotos(tweet.quote);
      }

      // 3. If still no images, check the tweet it's replying to
      if (mediaUrls.length === 0 && tweet.replying_to_status) {
        try {
          const parentRes = await fetch(
            `https://api.fxtwitter.com/status/${tweet.replying_to_status}`,
            { headers: { "User-Agent": "BundlerBot/1.0" } }
          );
          if (parentRes.ok) {
            const parentData = await parentRes.json();
            extractPhotos(parentData.tweet);
            // If parent also has no images, check parent's quote tweet
            if (mediaUrls.length === 0 && parentData.tweet?.quote) {
              extractPhotos(parentData.tweet.quote);
            }
          }
        } catch {}
      }

      return {
        text: tweet.text || "",
        authorUsername: tweet.author?.screen_name || tweet.author?.name || "",
        mediaUrls,
      };
    }
  } catch (e) {
    // Fall through to oembed
  }

  // Fallback: Twitter oembed (no images but at least gets text)
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
  const response = await fetch(oembedUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch tweet: ${response.status}`);
  }

  const data = await response.json();
  const htmlContent: string = data.html || "";
  const text = htmlContent.replace(/<[^>]*>/g, "").trim();
  const authorUsername = data.author_name || "";

  return {
    text,
    authorUsername,
    mediaUrls: [],
  };
}

/**
 * Use Claude to extract token metadata from tweet content.
 * Returns structured data with confidence score.
 */
export async function extractMetadataFromTweet(
  tweetUrl: string,
  tweetText: string,
  authorUsername: string,
  imageUrl?: string
): Promise<ExtractionResult> {
  const config = getConfig();

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const systemPrompt = `You extract meme coin / token launch metadata from tweets. Return ONLY valid JSON with these exact fields:
{
  "name": "string - the token's display name",
  "symbol": "string - the ticker symbol (usually $SOMETHING, return without the $)",
  "description": "string - use the exact words from the tweet as the description. Keep it as close to the original tweet text as possible. Clean up hashtags/mentions but preserve the message.",
  "shouldLaunch": true/false - whether this tweet has enough info for a token launch,
  "confidence": 0.0-1.0 - how confident you are this would make a good token
}

Rules:
- Look for $TICKER patterns in the text as high-confidence signals
- If no explicit ticker, create one from the main subject (max 10 chars, all caps)
- The name should be catchy and meme-worthy
- Description should be the actual tweet text (cleaned up slightly). Do NOT make up new text — use the tweet's own words
- Set shouldLaunch=false if the tweet is just normal conversation with no meme potential
- Be generous with confidence if there's clear meme/viral potential`;

  const userMessage = `Tweet by @${authorUsername}:
"${tweetText}"

Tweet URL: ${tweetUrl}
${imageUrl ? `Attached image: ${imageUrl}` : "No image attached"}

Extract token metadata from this tweet.`;

  const response = await client.messages.create({
    model: config.aiModel,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    metadata: {
      name: parsed.name,
      symbol: parsed.symbol,
      description: parsed.description,
      imageUrl: imageUrl || "",
      twitter: tweetUrl,
    },
    confidence: parsed.confidence,
    shouldLaunch: parsed.shouldLaunch,
    sourceTweetUrl: tweetUrl,
    sourceAccount: authorUsername,
  };
}
