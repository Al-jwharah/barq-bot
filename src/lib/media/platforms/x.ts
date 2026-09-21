import { fetchJson, fetchText } from "../http";
import type { ExtractResult, MediaItem, MediaKind, MediaVariant } from "../types";
import {
  originalPhotoUrl,
  parseResFromUrl,
  qualityLabel,
  tweetIdFromUrl,
} from "../urls";

type FxFormat = {
  url?: string;
  bitrate?: number;
  container?: string;
  codec?: string;
  content_type?: string;
};

type FxVideo = {
  url?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  type?: string;
  formats?: FxFormat[];
  variants?: FxFormat[];
};

type FxPhoto = {
  url?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  type?: string;
};

type FxTweet = {
  id?: string;
  url?: string;
  text?: string;
  author?: { name?: string; screen_name?: string };
  media?: {
    all?: Array<FxVideo & FxPhoto>;
    videos?: FxVideo[];
    photos?: FxPhoto[];
    mosaic?: { formats?: { jpeg?: string; webp?: string } };
  };
  quote?: FxTweet;
  retweet?: FxTweet;
};

type FxResponse = { code?: number; tweet?: FxTweet | null };

function isMp4(url: string, contentType?: string): boolean {
  if (contentType?.includes("mpegURL") || url.includes(".m3u8")) return false;
  return (
    url.includes(".mp4") ||
    contentType === "video/mp4" ||
    contentType === "mp4" ||
    false
  );
}

function variantsFromVideo(video: FxVideo): MediaVariant[] {
  const raw = [...(video.formats ?? []), ...(video.variants ?? [])];
  if (video.url) raw.push({ url: video.url, content_type: video.format });
  const byUrl = new Map<string, MediaVariant>();
  for (const f of raw) {
    if (!f.url || !isMp4(f.url, f.content_type ?? f.container)) continue;
    const res = parseResFromUrl(f.url);
    const width = res.width ?? video.width;
    const height = res.height ?? video.height;
    const prev = byUrl.get(f.url);
    const next: MediaVariant = {
      url: f.url,
      quality: qualityLabel(width, height),
      width,
      height,
      bitrate: f.bitrate ?? prev?.bitrate,
      contentType: "video/mp4",
    };
    if (!prev || (next.bitrate ?? 0) >= (prev.bitrate ?? 0)) {
      byUrl.set(f.url, next);
    }
  }
  return [...byUrl.values()].sort(
    (a, b) =>
      (b.bitrate ?? 0) - (a.bitrate ?? 0) ||
      (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  );
}

function videoItem(video: FxVideo): MediaItem | null {
  const kind: MediaKind = video.type === "gif" ? "gif" : "video";
  const variants = variantsFromVideo(video);
  const best = variants[0];
  const url = best?.url ?? video.url;
  if (!url) return null;
  return {
    kind,
    url,
    thumbnail: video.thumbnail_url,
    width: best?.width ?? video.width,
    height: best?.height ?? video.height,
    duration: video.duration,
    variants,
  };
}

function photoItem(photo: FxPhoto): MediaItem | null {
  if (!photo.url) return null;
  const url = originalPhotoUrl(photo.url);
  return {
    kind: "photo",
    url,
    thumbnail: photo.thumbnail_url ?? url,
    width: photo.width,
    height: photo.height,
    variants: [
      {
        url,
        quality: "أصل",
        width: photo.width,
        height: photo.height,
        contentType: "image/jpeg",
      },
    ],
  };
}

function itemsFromTweet(tweet: FxTweet): MediaItem[] {
  const media = tweet.media;
  const items: MediaItem[] = [];
  for (const v of media?.videos ?? []) {
    const item = videoItem(v);
    if (item) items.push(item);
  }
  for (const p of media?.photos ?? []) {
    const item = photoItem(p);
    if (item) items.push(item);
  }
  if (items.length === 0) {
    for (const a of media?.all ?? []) {
      if (a.type === "photo") {
        const item = photoItem(a);
        if (item) items.push(item);
      } else {
        const item = videoItem(a);
        if (item) items.push(item);
      }
    }
  }
  if (items.length === 0 && tweet.quote) {
    items.push(...itemsFromTweet(tweet.quote));
  }
  if (items.length === 0 && tweet.retweet) {
    items.push(...itemsFromTweet(tweet.retweet));
  }
  return items;
}

function resultFromTweet(tweet: FxTweet, sourceUrl: string): ExtractResult {
  return {
    platform: "x",
    id: tweet.id,
    title: tweet.author?.name,
    author: tweet.author?.name,
    authorHandle: tweet.author?.screen_name
      ? `@${tweet.author.screen_name}`
      : undefined,
    text: tweet.text,
    sourceUrl: tweet.url ?? sourceUrl,
    items: itemsFromTweet(tweet),
  };
}

async function fromVx(id: string, sourceUrl: string): Promise<ExtractResult | null> {
  try {
    const data = await fetchJson<{
      text?: string;
      user_name?: string;
      user_screen_name?: string;
      mediaURLs?: string[];
      media_extended?: Array<{
        type?: string;
        url?: string;
        thumbnail_url?: string;
        duration_millis?: number;
        size?: { width?: number; height?: number };
      }>;
    }>(`https://api.vxtwitter.com/Twitter/status/${id}`);
    const items: MediaItem[] = [];
    for (const m of data.media_extended ?? []) {
      if (!m.url) continue;
      if (m.type === "image" || m.type === "photo") {
        const item = photoItem({ url: m.url, thumbnail_url: m.thumbnail_url, width: m.size?.width, height: m.size?.height });
        if (item) items.push(item);
        continue;
      }
      const video = videoItem({
        url: m.url,
        thumbnail_url: m.thumbnail_url,
        width: m.size?.width,
        height: m.size?.height,
        duration: m.duration_millis ? m.duration_millis / 1000 : undefined,
        type: m.type === "gif" ? "gif" : "video",
      });
      if (video) items.push(video);
    }
    if (items.length === 0) {
      for (const url of data.mediaURLs ?? []) {
        if (!url.includes(".mp4") && !/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) continue;
        const isPhoto = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
        if (isPhoto) {
          const item = photoItem({ url });
          if (item) items.push(item);
        } else {
          const video = videoItem({ url, type: "video" });
          if (video) items.push(video);
        }
      }
    }
    if (!items.length) return null;
    return {
      platform: "x",
      id,
      title: data.user_name,
      author: data.user_name,
      authorHandle: data.user_screen_name ? `@${data.user_screen_name}` : undefined,
      text: data.text,
      sourceUrl,
      items,
    };
  } catch {
    return null;
  }
}

async function fromFx(id: string, sourceUrl: string): Promise<ExtractResult | null> {
  const endpoints = [
    `https://api.fxtwitter.com/status/${id}`,
    `https://api.fxtwitter.com/i/status/${id}`,
    `https://api.fxembed.com/status/${id}`,
  ];
  const settled = await Promise.allSettled(
    endpoints.map((endpoint) => fetchJson<FxResponse>(endpoint, undefined, 8000)),
  );
  for (const row of settled) {
    if (row.status !== "fulfilled" || !row.value.tweet) continue;
    const result = resultFromTweet(row.value.tweet, sourceUrl);
    if (result.items.length) return result;
  }
  return null;
}

function decodeEscapedUrl(raw: string): string {
  return raw
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&/g, "&");
}

async function fromPageHtml(
  id: string,
  sourceUrl: string,
): Promise<ExtractResult | null> {
  const pageUrl = `https://x.com/i/status/${id}`;
  try {
    const { text } = await fetchText(pageUrl, undefined, 12000);
    const mp4s = [
      ...text.matchAll(/https:\/\/video\.twimg\.com[^"'\\\s]+?\.mp4[^"'\\\s]*/g),
    ]
      .map((m) => decodeEscapedUrl(m[0]))
      .filter((u, i, arr) => arr.indexOf(u) === i);
    if (mp4s.length === 0) return null;

    const thumbs = [
      ...text.matchAll(/https:\/\/pbs\.twimg\.com\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)[^"'\\\s]+/g),
    ].map((m) => decodeEscapedUrl(m[0]));

    const byGroup = new Map<string, MediaVariant[]>();
    for (const url of mp4s) {
      const group =
        url.match(/\/(?:amplify_video|ext_tw_video|tweet_video)\/(\d+)\//)?.[1] ??
        "default";
      const res = parseResFromUrl(url);
      const list = byGroup.get(group) ?? [];
      list.push({
        url,
        quality: qualityLabel(res.width, res.height),
        width: res.width,
        height: res.height,
        contentType: "video/mp4",
      });
      byGroup.set(group, list);
    }

    const items: MediaItem[] = [];
    for (const variants of byGroup.values()) {
      variants.sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
      );
      const best = variants[0];
      if (!best) continue;
      items.push({
        kind: "video",
        url: best.url,
        thumbnail: thumbs[0],
        width: best.width,
        height: best.height,
        variants,
      });
    }
    if (items.length === 0) return null;
    return {
      platform: "x",
      id,
      sourceUrl,
      items,
    };
  } catch {
    return null;
  }
}

export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

type SyndVariant = { url?: string; content_type?: string; bitrate?: number };
type SyndMedia = {
  type?: string;
  media_url_https?: string;
  video_info?: { duration_millis?: number; variants?: SyndVariant[] };
};

function itemsFromSyndicationMedia(media: SyndMedia[]): MediaItem[] {
  const items: MediaItem[] = [];
  for (const m of media) {
    if (m.type === "photo" && m.media_url_https) {
      const item = photoItem({ url: m.media_url_https, thumbnail_url: m.media_url_https });
      if (item) items.push(item);
      continue;
    }
    const variants = (m.video_info?.variants ?? [])
      .filter((v) => v.url && isMp4(v.url, v.content_type))
      .map((v) => {
        const res = parseResFromUrl(v.url!);
        return {
          url: v.url!,
          quality: qualityLabel(res.width, res.height),
          width: res.width,
          height: res.height,
          bitrate: v.bitrate,
          contentType: "video/mp4" as const,
        };
      })
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0) || (b.height ?? 0) - (a.height ?? 0));
    const best = variants[0];
    if (!best) continue;
    items.push({
      kind: m.type === "animated_gif" ? "gif" : "video",
      url: best.url,
      thumbnail: m.media_url_https,
      width: best.width,
      height: best.height,
      duration: m.video_info?.duration_millis ? m.video_info.duration_millis / 1000 : undefined,
      variants,
    });
  }
  return items;
}

async function fromSyndication(id: string, sourceUrl: string): Promise<ExtractResult | null> {
  try {
    const token = syndicationToken(id);
    const data = await fetchJson<{
      __typename?: string;
      text?: string;
      user?: { name?: string; screen_name?: string };
      mediaDetails?: SyndMedia[];
      quoted_tweet?: { mediaDetails?: SyndMedia[] };
    }>(
      `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`,
      { headers: { "User-Agent": "Googlebot", Accept: "application/json", Referer: "https://platform.twitter.com/" } },
      12000,
    );
    if (!data || data.__typename === "TweetTombstone" || data.__typename === "TweetUnavailable") return null;
    const media = [...(data.mediaDetails ?? []), ...(data.quoted_tweet?.mediaDetails ?? [])];
    const items = itemsFromSyndicationMedia(media);
    if (!items.length) return null;
    return {
      platform: "x",
      id,
      title: data.user?.name,
      author: data.user?.name,
      authorHandle: data.user?.screen_name ? `@${data.user.screen_name}` : undefined,
      text: data.text,
      sourceUrl,
      items,
    };
  } catch {
    return null;
  }
}

const X_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

type GqlTweet = {
  __typename?: string;
  reason?: string;
  legacy?: { extended_entities?: { media?: SyndMedia[] }; full_text?: string };
  tweet?: GqlTweet;
  core?: { user_results?: { result?: { legacy?: { name?: string; screen_name?: string } } } };
};

export function unwrapGqlTweet(result: GqlTweet | undefined): GqlTweet | null {
  if (!result) return null;
  if (result.legacy?.extended_entities?.media?.length) return result;
  if (result.tweet) return unwrapGqlTweet(result.tweet);
  return result.legacy ? result : null;
}

async function fromGuestGraphql(id: string, sourceUrl: string): Promise<ExtractResult | null> {
  try {
    const guest = await fetchJson<{ guest_token?: string }>(
      "https://api.twitter.com/1.1/guest/activate.json",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${X_BEARER}`, "User-Agent": "Mozilla/5.0" },
      },
      8000,
    );
    if (!guest.guest_token) return null;
    const variables = JSON.stringify({
      tweetId: id,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false,
    });
    const features = JSON.stringify({
      creator_subscriptions_tweet_preview_api_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: false,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_media_download_video_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    });
    const gql = await fetchJson<{
      data?: { tweetResult?: { result?: GqlTweet } };
    }>(
      `https://x.com/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`,
      {
        headers: {
          Authorization: `Bearer ${X_BEARER}`,
          "x-guest-token": guest.guest_token,
          "User-Agent": "Mozilla/5.0",
        },
      },
      10000,
    );
    const result = unwrapGqlTweet(gql.data?.tweetResult?.result);
    if (!result) return null;
    const legacy = result.legacy;
    const media = legacy?.extended_entities?.media ?? [];
    const items = itemsFromSyndicationMedia(media);
    if (!items.length) return null;
    const user = result.core?.user_results?.result?.legacy;
    return {
      platform: "x",
      id,
      title: user?.name,
      author: user?.name,
      authorHandle: user?.screen_name ? `@${user.screen_name}` : undefined,
      text: legacy?.full_text,
      sourceUrl,
      items,
    };
  } catch {
    return null;
  }
}

export async function extractX(url: string): Promise<ExtractResult> {
  const id = tweetIdFromUrl(url);
  if (!id) {
    throw new Error("هذا مو رابط منشور من إكس");
  }
  const source = `https://x.com/i/status/${id}`;
  const settled = await Promise.allSettled([
    fromFx(id, source),
    fromSyndication(id, source),
    fromGuestGraphql(id, source),
    fromVx(id, source),
  ]);
  for (const row of settled) {
    if (row.status === "fulfilled" && row.value && row.value.items.length > 0) return row.value;
  }
  const html = await fromPageHtml(id, source);
  if (html && html.items.length > 0) return html;
  throw new Error("تعذر قراءة هذا المقطع من إكس. أرسل الملف نفسه من التطبيق.");
}
