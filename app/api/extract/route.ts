import { NextRequest, NextResponse } from "next/server";
import { scrapeTweet, extractMetadataFromTweet } from "@/lib/monitor/extractor";

export async function POST(req: NextRequest) {
  const { tweetUrl } = await req.json();

  if (!tweetUrl || !tweetUrl.includes("x.com") && !tweetUrl.includes("twitter.com")) {
    return NextResponse.json(
      { error: "Please provide a valid Twitter/X URL" },
      { status: 400 }
    );
  }

  try {
    // 1. Scrape the tweet
    const tweet = await scrapeTweet(tweetUrl);

    // 2. Extract metadata using AI
    const result = await extractMetadataFromTweet(
      tweetUrl,
      tweet.text,
      tweet.authorUsername
    );

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to extract metadata" },
      { status: 500 }
    );
  }
}
