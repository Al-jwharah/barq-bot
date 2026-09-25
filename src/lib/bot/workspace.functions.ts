import { createServerFn } from "@tanstack/react-start";
import { advertisedLines, entitlementsFor, tierFromMember } from "./premium";

export const workspaceSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const free = entitlementsFor("free");
  return {
    canonicalHint: "barq",
    plans: (["free", "plus", "pro", "max"] as const).map((tier) => {
      const ent = entitlementsFor(tier);
      return { tier, lines: advertisedLines(ent), dailyCap: ent.dailyCap };
    }),
    freeDownload: free.dailyCap > 0,
    signedInTier: tierFromMember(null, false),
  };
});
