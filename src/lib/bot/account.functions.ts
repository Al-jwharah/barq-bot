import { createServerFn } from "@tanstack/react-start";

export const loadAccountPage = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    t: typeof data === "object" && data && "t" in data ? String((data as { t: unknown }).t ?? "") : "",
  }))
  .handler(async ({ data }) => {
    const t = data.t.trim();
    if (!t) {
      return { account: null as Awaited<ReturnType<typeof import("./account.server").loadAccount>>, missing: true };
    }
    const { loadAccount } = await import("./account.server");
    return { account: await loadAccount(t), missing: false };
  });
