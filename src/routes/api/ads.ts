import { createFileRoute } from "@tanstack/react-router";
import { ADS_ENABLED } from "@/lib/bot/config.server";

/**
 * Tasteful sponsor/ad creatives for the website.
 * BARQ_ADS_ENABLED default off — demo creatives stay clearly labeled.
 */
export const Route = createFileRoute("/api/ads")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          enabled: ADS_ENABLED,
          label: ADS_ENABLED ? "إعلان" : "إعلان تجريبي",
          env: {
            flag: "BARQ_ADS_ENABLED",
            default: "off",
            note: "Do not flip on production without owner approval",
          },
          creatives: [
            {
              id: ADS_ENABLED ? "live-slot" : "demo-1",
              title: ADS_ENABLED ? "راعٍ مع برق" : "مساحة راعٍ",
              body: ADS_ENABLED
                ? "ادعم منتجًا عربيًا — تواصل @i_2169"
                : "مكان أنيق للرعاة — غير مفعّل للإنتاج حتى BARQ_ADS_ENABLED=on",
              href: "https://t.me/i_2169",
              demo: !ADS_ENABLED,
            },
          ],
        }),
    },
  },
});
