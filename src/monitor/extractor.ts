// AI-powered metadata extraction from tweets

import type { ExtractionResult } from "../types";
import type { Tweet } from "./twitter";

/**
 * Uses Claude (or GPT-4o) with structured JSON output to extract
 * token launch metadata from tweet content.
 *
 * Extracts:
 * - name: token display name
 * - symbol: ticker ($SYMBOL pattern)
 * - description: brief description from tweet context
 * - imageUrl: attached media or referenced image
 * - confidence: 0-1 score for launch viability
 *
 * Techniques:
 * - JSON Schema / structured output for reliable parsing
 * - Regex pre-processing for $TICKER patterns
 * - Few-shot examples for accuracy
 * - Image analysis for logo suitability
 *
 * Cost: ~$0.001 per tweet (Claude Haiku)
 * Latency: 200-500ms
 */

// TODO: Implement AI extraction
// - Call Claude API with structured output schema
// - Pre-process tweet for $TICKER regex matches
// - Handle attached images (pass URL to multimodal model)
// - Return ExtractionResult with confidence score

export async function extractTokenMetadata(
  tweet: Tweet
): Promise<ExtractionResult> {
  throw new Error("Not yet implemented");
}
