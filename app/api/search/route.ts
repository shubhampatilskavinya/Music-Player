type VideoResult = {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
};

function plainText(value: { runs?: Array<{ text?: string }>; simpleText?: string } | undefined) {
  return value?.simpleText ?? value?.runs?.map((part) => part.text ?? "").join("") ?? "";
}

function collectVideos(value: unknown, results: VideoResult[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectVideos(item, results);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (record.videoRenderer && typeof record.videoRenderer === "object") {
    const video = record.videoRenderer as Record<string, unknown>;
    const videoId = video.videoId;
    if (typeof videoId === "string" && /^[\w-]{11}$/.test(videoId) && !results.some((result) => result.videoId === videoId)) {
      results.push({
        videoId,
        title: plainText(video.title as Parameters<typeof plainText>[0]),
        channel: plainText(video.ownerText as Parameters<typeof plainText>[0]),
        duration: plainText(video.lengthText as Parameters<typeof plainText>[0]),
      });
    }
  }
  for (const child of Object.values(record)) collectVideos(child, results);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) {
    return Response.json({ error: "Enter 2–120 characters to search." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!response.ok) throw new Error("YouTube search did not respond.");

    const html = await response.text();
    const marker = "var ytInitialData = ";
    const start = html.indexOf(marker);
    if (start < 0) throw new Error("YouTube search results are unavailable.");
    const jsonStart = start + marker.length;
    const jsonEnd = html.indexOf(";</script>", jsonStart);
    if (jsonEnd < 0) throw new Error("YouTube search results are unavailable.");

    const data: unknown = JSON.parse(html.slice(jsonStart, jsonEnd));
    const results: VideoResult[] = [];
    collectVideos(data, results);
    return Response.json({ results: results.slice(0, 12) });
  } catch {
    return Response.json({ error: "Search is temporarily unavailable. Try again in a moment." }, { status: 502 });
  }
}
