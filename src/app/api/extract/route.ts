import { NextResponse } from "next/server";
import { fetchInstagramTranscript } from "@/lib/apify";
import type {
  ExtractionErrorCode,
  ExtractionErrorResponse,
  ExtractionSuccessResponse,
} from "@/lib/extraction-types";
import {
  extractFromTranscript,
  extractFromYouTubeUrl,
  normalizeExtraction,
} from "@/lib/gemini";
import { fetchInstagramPublicContext } from "@/lib/instagram";
import { parseVideoUrl } from "@/lib/video-url";
import { fetchYouTubeContext } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ExtractRequest = {
  url?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractRequest;
    const rawUrl = typeof body.url === "string" ? body.url : "";
    const parsed = parseVideoUrl(rawUrl);
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return errorResponse(
        "MISSING_GEMINI_KEY",
        "Gemini is not configured yet.",
        "Set GEMINI_API_KEY in your environment and restart the dev server.",
        500,
      );
    }

    const payload =
      parsed.platform === "youtube"
        ? await extractYouTube({
            apiKey: geminiApiKey,
            sourceUrl: parsed.url,
          })
        : await extractInstagram({
            apiKey: geminiApiKey,
            sourceUrl: parsed.url,
          });

    const result = normalizeExtraction({
      payload,
      platform: parsed.platform,
      sourceUrl: parsed.url,
    });

    if (result.confidence === "low" && result.ingredients.length < 3) {
      return errorResponse(
        "LOW_SIGNAL",
        "This video does not contain enough recipe signal to extract a reliable grocery list.",
        "Try a clearer cooking video with spoken ingredients, captions, or visible ingredient shots.",
        422,
      );
    }

    return NextResponse.json<ExtractionSuccessResponse>({ result });
  } catch (error) {
    return handleError(error);
  }
}

async function extractYouTube({
  apiKey,
  sourceUrl,
}: {
  apiKey: string;
  sourceUrl: string;
}) {
  try {
    return await extractFromYouTubeUrl({
      apiKey,
      sourceUrl,
    });
  } catch (error) {
    const context = await fetchYouTubeContext(sourceUrl);

    return extractFromTranscript({
      apiKey,
      sourceUrl,
      transcript: context.description,
      metadata: {
        title: context.title,
        author: context.author,
        fallbackReason:
          error instanceof Error
            ? error.message
            : "Direct Gemini video analysis failed.",
      },
      sourceKind:
        "YouTube title, creator, and description fallback. Assume the description contains the recipe ingredients when the direct video model is unavailable",
    });
  }
}

async function extractInstagram({
  apiKey,
  sourceUrl,
}: {
  apiKey: string;
  sourceUrl: string;
}) {
  const apifyToken = process.env.APIFY_TOKEN;

  if (!apifyToken) {
    throw new ExtractionError(
      "MISSING_APIFY_TOKEN",
      "Instagram Reel extraction is not configured yet.",
      "Set APIFY_TOKEN in your environment to extract public Instagram Reels.",
      500,
    );
  }

  const transcript = await fetchInstagramTranscript(sourceUrl, apifyToken);
  const publicContext = await fetchInstagramPublicContext(sourceUrl).catch(
    () => null,
  );

  return extractFromTranscript({
    apiKey,
    sourceUrl,
    transcript: [
      publicContext?.description
        ? `Instagram caption / page description:\n${publicContext.description}`
        : "",
      `Transcript:\n${transcript.transcript}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    metadata: {
      ...transcript.metadata,
      publicTitle: publicContext?.title,
    },
    sourceKind:
      "Instagram Reel transcript plus public caption/page description. Prefer exact ingredient quantities from the caption when present",
  });
}

function handleError(error: unknown) {
  if (error instanceof ExtractionError) {
    return errorResponse(
      error.code,
      error.message,
      error.detail,
      error.statusCode,
    );
  }

  if (error instanceof Error) {
    if (error.message === "INVALID_URL") {
      return errorResponse(
        "INVALID_URL",
        "Paste a valid YouTube video, YouTube Shorts, or Instagram Reel link.",
        undefined,
        400,
      );
    }

    if (error.message === "UNSUPPORTED_PLATFORM") {
      return errorResponse(
        "UNSUPPORTED_PLATFORM",
        "ClipCart currently supports YouTube videos, YouTube Shorts, and Instagram Reels.",
        undefined,
        400,
      );
    }

    if (error.message === "LOW_SIGNAL") {
      return errorResponse(
        "LOW_SIGNAL",
        "No reliable ingredient list could be extracted from this source.",
        "The video may not be a recipe, or it may lack visible/spoken ingredients.",
        422,
      );
    }

    if (
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("apify")
    ) {
      return errorResponse(
        "PROVIDER_FAILED",
        "Instagram transcript extraction failed.",
        error.message,
        502,
      );
    }

    return errorResponse(
      "MODEL_FAILED",
      "The extraction model could not analyze this link.",
      error.message,
      502,
    );
  }

  return errorResponse(
    "MODEL_FAILED",
    "Unexpected extraction failure.",
    undefined,
    500,
  );
}

function errorResponse(
  code: ExtractionErrorCode,
  message: string,
  detail: string | undefined,
  status: number,
) {
  return NextResponse.json<ExtractionErrorResponse>(
    { error: { code, message, detail } },
    { status },
  );
}

class ExtractionError extends Error {
  constructor(
    public readonly code: ExtractionErrorCode,
    message: string,
    public readonly detail: string | undefined,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}
