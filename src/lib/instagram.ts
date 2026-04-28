export type InstagramPublicContext = {
  title: string;
  description: string;
};

export async function fetchInstagramPublicContext(
  sourceUrl: string,
): Promise<InstagramPublicContext> {
  const response = await fetch(sourceUrl, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Instagram page returned ${response.status}.`);
  }

  const html = await response.text();

  return {
    title: readMeta(html, "og:title") || readTitle(html),
    description:
      readMeta(html, "og:description") || readMeta(html, "description"),
  };
}

function readTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() : "";
}

function readMeta(html: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexes = [
    new RegExp(
      `<meta[^>]+property=["']${escapedName}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']*)["']`,
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
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
