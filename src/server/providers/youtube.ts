import "server-only";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
type ApiResponse = { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } }>; error?: { message?: string } };
export type YouTubeDiscoveryResult = { source: "youtube"; videoId: string; title: string; channelTitle: string; publishedAt: string | null; thumbnailUrl: string | null; watchUrl: string };

export async function searchYouTubeMusic(query: string): Promise<YouTubeDiscoveryResult[]> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_NOT_CONFIGURED");
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", videoEmbeddable: "true", safeSearch: "moderate", maxResults: "8", q: query, key: apiKey }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json() as ApiResponse;
  if (!response.ok) throw new Error(payload.error?.message || `YOUTUBE_HTTP_${response.status}`);
  return (payload.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title;
    if (!videoId || !title) return [];
    return [{ source: "youtube" as const, videoId, title, channelTitle: item.snippet?.channelTitle ?? "Canal de YouTube", publishedAt: item.snippet?.publishedAt ?? null, thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null, watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` }];
  });
}
