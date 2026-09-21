export type MediaKind = "video" | "photo" | "gif" | "audio";

export type MediaVariant = {
  url: string;
  quality: string;
  width?: number;
  height?: number;
  bitrate?: number;
  size?: number;
  contentType: string;
};

export type MediaItem = {
  kind: MediaKind;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
  variants: MediaVariant[];
};

export type ExtractResult = {
  platform: string;
  id?: string;
  title?: string;
  author?: string;
  authorHandle?: string;
  text?: string;
  sourceUrl: string;
  items: MediaItem[];
};
