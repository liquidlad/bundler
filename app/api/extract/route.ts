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
    // 1. Scrape the tweet (now includes images via fxtwitter)
    const tweet = await scrapeTweet(tweetUrl);

    // 2. Extract metadata using AI, pass first image if available
    const imageUrl = tweet.mediaUrls.length > 0 ? tweet.mediaUrls[0] : undefined;
    const result = await extractMetadataFromTweet(
      tweetUrl,
      tweet.text,
      tweet.authorUsername,
      imageUrl
    );

    // Ensure the image URL is set on the metadata
    if (imageUrl && !result.metadata.imageUrl) {
      result.metadata.imageUrl = imageUrl;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to extract metadata" },
      { status: 500 }
    );
  }
}
