const PAGE = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>برق</title><body style="margin:0;background:#07070a;color:#f2efe8;font-family:sans-serif"><main style="max-width:28rem;margin:18vh auto;padding:24px;text-align:center"><p style="font-size:1.4rem">برق ⚡️</p><p>تعذر فتح الصفحة. ارجع للموقع وحاول مرة ثانية.</p><p><a href="https://abdulrhman.ai" style="color:#e8c547">abdulrhman.ai</a></p></main></body></html>`;

export default function errorHandler() {
  return new Response(PAGE, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
