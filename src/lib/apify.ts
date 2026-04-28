type ApifyTranscriptItem = {
  overview?: unknown;
  segments?: unknown;
  transcript?: unknown;
  transcriptText?: unknown;
  translatedText?: unknown;
  fullText?: unknown;
  segmentText?: unknown;
  summary?: unknown;
  text?: unknown;
  title?: unknown;
  caption?: unknown;
  metadata?: unknown;
  author?: unknown;
  username?: unknown;
  userName?: unknown;
  duration?: unknown;
  errMsg?: unknown;
};

export type InstagramTranscript = {
  transcript: string;
  metadata: Record<string, unknown>;
};

function stringifySegments(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((segment) => {
        if (typeof segment === "string") {
          return segment;
        }

        if (segment && typeof segment === "object") {
          const record = segment as Record<string, unknown>;
          return [
            record.start ?? record.startTime ?? record.from,
            record.text ?? record.transcript ?? record.caption,
          ]
            .filter(Boolean)
            .join(": ");
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return "";
}

export async function fetchInstagramTranscript(
  reelUrl: string,
  token: string,
): Promise<InstagramTranscript> {
  const actors = actorCandidates();
  const errors: string[] = [];

  for (const actor of actors) {
    try {
      return await fetchTranscriptWithActor(reelUrl, token, actor);
    } catch (error) {
      errors.push(
        `${actor}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  throw new Error(errors.join(" | "));
}

async function fetchTranscriptWithActor(
  reelUrl: string,
  token: string,
  actor: string,
): Promise<InstagramTranscript> {
  const actorPath = actor.replace("/", "~");
  const endpoint = new URL(
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`,
  );
  endpoint.searchParams.set("token", token);

  const controller = new AbortController();
  const timeout = windowlessSetTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inputForActor(actor, reelUrl)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Apify returned ${response.status}: ${detail}`);
    }

    const items = (await response.json()) as ApifyTranscriptItem[];
    const firstItem = items[0];

    if (!firstItem) {
      throw new Error("Apify returned no transcript items.");
    }

    if (typeof firstItem.errMsg === "string" && firstItem.errMsg.trim()) {
      throw new Error(firstItem.errMsg);
    }

    const transcript = [
      stringifySegments(firstItem.transcript),
      stringifySegments(firstItem.transcriptText),
      stringifySegments(firstItem.translatedText),
      stringifySegments(firstItem.fullText),
      stringifySegments(firstItem.text),
      stringifySegments(firstItem.segments),
      stringifySegments(firstItem.segmentText),
      stringifySegments(firstItem.summary),
      stringifySegments(firstItem.caption),
      stringifySegments(firstItem.title),
      stringifySegments(firstItem.overview),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!transcript) {
      throw new Error("No transcript text was available for this Reel.");
    }

    return {
      transcript,
      metadata: {
        metadata: firstItem.metadata,
        title: firstItem.title,
        author: firstItem.author ?? firstItem.username ?? firstItem.userName,
        duration: firstItem.duration,
        actor,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function actorCandidates(): string[] {
  return [
    process.env.APIFY_INSTAGRAM_TRANSCRIPT_ACTOR?.trim(),
    "bulletproof/instagram-transcript",
    "linen_snack/instagram-reel-transcript-ai-extractor",
    "crawlerbros/instagram-transcript-scraper",
  ].filter((actor, index, actors): actor is string => {
    return Boolean(actor) && actors.indexOf(actor) === index;
  });
}

function inputForActor(actor: string, reelUrl: string) {
  if (actor === "linen_snack/instagram-reel-transcript-ai-extractor") {
    return {
      reelUrls: [reelUrl],
      language: "auto",
      includeSummary: true,
    };
  }

  if (actor === "crawlerbros/instagram-transcript-scraper") {
    return {
      videoUrls: [reelUrl],
      transcriptionMethod: "auto",
      whisperModel: "base",
      language: "en",
    };
  }

  return {
    url: reelUrl,
    language: "en",
    format: "json",
    includeMetadata: true,
  };
}

function windowlessSetTimeout(
  handler: () => void,
  timeout: number,
): ReturnType<typeof setTimeout> {
  return setTimeout(handler, timeout);
}
