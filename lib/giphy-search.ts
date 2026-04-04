export type GiphySanitizedItem = {
  id: string;
  title: string;
  previewUrl: string;
  sendUrl: string;
  width: number;
  height: number;
};

type GiphyImageBlock = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyGif = {
  id?: string;
  title?: string;
  images?: Record<string, GiphyImageBlock | undefined>;
};

function pickUrl(block: GiphyImageBlock | undefined): string {
  return typeof block?.url === "string" ? block.url.trim() : "";
}

function mapOne(g: GiphyGif): GiphySanitizedItem | null {
  const images = g.images ?? {};
  const preview =
    images.fixed_width_small ?? images.fixed_width ?? images.preview_gif;
  const send = images.downsized ?? images.fixed_width ?? preview;
  const previewUrl = pickUrl(preview);
  const sendUrl = pickUrl(send) || previewUrl;
  if (!sendUrl) return null;
  const w = Number(send?.width ?? preview?.width) || 200;
  const h = Number(send?.height ?? preview?.height) || 200;
  return {
    id: typeof g.id === "string" ? g.id : "",
    title: typeof g.title === "string" ? g.title : "",
    previewUrl: previewUrl || sendUrl,
    sendUrl,
    width: w,
    height: h,
  };
}

/**
 * Server-only: Giphy Search when `query` is non-empty, otherwise Trending.
 */
export async function fetchGiphySearchOrTrending(
  query: string | undefined,
): Promise<GiphySanitizedItem[]> {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    throw new Error("GIPHY_API_KEY is not configured.");
  }

  const limit = "24";
  const rating = "g";
  const base = "https://api.giphy.com/v1/gifs";
  const q = query?.trim() ?? "";
  const url =
    q.length > 0
      ? `${base}/search?${new URLSearchParams({
          api_key: key,
          q,
          limit,
          rating,
        })}`
      : `${base}/trending?${new URLSearchParams({
          api_key: key,
          limit,
          rating,
        })}`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Giphy HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: GiphyGif[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  const out: GiphySanitizedItem[] = [];
  for (const g of rows) {
    const item = mapOne(g);
    if (item && item.id && item.sendUrl) out.push(item);
  }
  return out;
}
