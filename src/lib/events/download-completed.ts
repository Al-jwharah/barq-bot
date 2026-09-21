import { on } from "./bus";

on("download.completed", async (payload) => {
  const tgId = Number(payload.tgId);
  if (!Number.isFinite(tgId) || tgId <= 0) return;
  const { awardPoints } = await import("../bot/points.server");
  await awardPoints(tgId, "download").catch(() => undefined);
});
