export type YouTubeContext = {
  title: string;
  author: string;
  description: string;
};

export async function fetchYouTubeContext(
  sourceUrl: string,
): Promise<YouTubeContext> {
  const response = await fetch(sourceUrl, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube page returned ${response.status}.`);
  }

  const html = await response.text();
  const playerResponse = parseInitialPlayerResponse(html);
  const videoDetails = playerResponse?.videoDetails;
  const title = asString(videoDetails?.title) || readMeta(html, "title");
  const author = asString(videoDetails?.author);
  const description =
    asString(videoDetails?.shortDescription) ||
    readMeta(html, "description") ||
    readMeta(html, "og:description");

  if (!description.trim()) {
    throw new Error("Could not read a YouTube description for fallback extraction.");
  }

  return {
    title: title || "Unknown YouTube video",
    author: author || "Unknown creator",
    description,
  };
}

function parseInitialPlayerResponse(html: string) {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const objectStart = html.indexOf("{", markerIndex);

  if (objectStart === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const char = html[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      try {
        return JSON.parse(html.slice(objectStart, index + 1)) as {
          videoDetails?: {
            title?: unknown;
            author?: unknown;
            shortDescription?: unknown;
          };
        };
      } catch {
        return null;
      }
    }
  }

  return null;
}

function readMeta(html: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexes = [
    new RegExp(
      `<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+property=["']${escapedName}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
  ];

  for (const regex of regexes) {
    const match = html.match(regex);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]).trim();
    }
  }

  return "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
