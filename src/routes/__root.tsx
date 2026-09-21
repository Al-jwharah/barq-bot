import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { getPublicOrigin, publicUrl } from "@/lib/bot/origin";

const APP_NAME = "برق ⚡️";
const PUBLIC_ORIGIN = getPublicOrigin();

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#07070a" },
      {
        name: "description",
        content:
          "برق ⚡️ حمّل أي فيديو. Barq AI يفهمك. مجاني — كوب قهوة إن أحببت. الدعم @i_2169 · info@aljwharah.ai",
      },
      ...(PUBLIC_ORIGIN
        ? [
            { property: "og:url", content: PUBLIC_ORIGIN },
            { property: "og:title", content: APP_NAME },
            { property: "og:image", content: publicUrl("/og.jpg") },
            { property: "og:type", content: "website" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      ...(PUBLIC_ORIGIN ? [{ rel: "canonical", href: PUBLIC_ORIGIN }] : []),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="ar" dir="rtl" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{
              style: {
                background: "#121614",
                color: "#f2efe8",
                border: "1px solid color-mix(in oklab, #f2efe8 12%, transparent)",
                fontFamily: "IBM Plex Sans Arabic, sans-serif",
              },
            }}
          />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
