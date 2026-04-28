import type { SupportedPlatform } from "./extraction-types";

export type ParsedVideoUrl = {
  platform: SupportedPlatform;
  url: string;
};

export function parseVideoUrl(rawUrl: string): ParsedVideoUrl {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("INVALID_URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("INVALID_URL");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsed.pathname.toLowerCase();

  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be"
  ) {
    const hasVideoId =
      hostname === "youtu.be"
        ? parsed.pathname.length > 1
        : pathname.startsWith("/watch") ||
          pathname.startsWith("/shorts/") ||
          pathname.startsWith("/embed/");

    if (!hasVideoId) {
      throw new Error("INVALID_URL");
    }

    return { platform: "youtube", url: parsed.toString() };
  }

  if (hostname === "instagram.com" || hostname === "m.instagram.com") {
    const isReel =
      pathname.startsWith("/reel/") ||
      pathname.startsWith("/reels/") ||
      pathname.startsWith("/p/") ||
      pathname.startsWith("/tv/") ||
      pathname.includes("/reel/") ||
      pathname.includes("/reels/") ||
      pathname.includes("/p/") ||
      pathname.includes("/tv/");

    if (!isReel) {
      throw new Error("INVALID_URL");
    }

    return { platform: "instagram", url: canonicalInstagramUrl(parsed) };
  }

  throw new Error("UNSUPPORTED_PLATFORM");
}

function canonicalInstagramUrl(parsed: URL): string {
  const parts = parsed.pathname.split("/").filter(Boolean);
  const markerIndex = parts.findIndex((part) =>
    ["reel", "reels", "p", "tv"].includes(part.toLowerCase()),
  );
  const shortcode = markerIndex >= 0 ? parts[markerIndex + 1] : "";
  const type = parts[markerIndex]?.toLowerCase() === "reels" ? "reel" : parts[markerIndex];

  if (!type || !shortcode) {
    throw new Error("INVALID_URL");
  }

  return `https://www.instagram.com/${type}/${shortcode}/`;
}
