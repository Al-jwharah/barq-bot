import { FEATURES, resolveFeature, type FeatureName } from "./features";

export async function featureOn(name: FeatureName): Promise<boolean> {
  try {
    const { getSettings } = await import("./store.server");
    return resolveFeature(name, await getSettings());
  } catch {
    return resolveFeature(name, {});
  }
}

export async function allFeatures(): Promise<Record<FeatureName, boolean>> {
  let settings: Record<string, string> = {};
  try {
    settings = await (await import("./store.server")).getSettings();
  } catch {
    settings = {};
  }
  const out = {} as Record<FeatureName, boolean>;
  for (const name of Object.keys(FEATURES) as FeatureName[]) out[name] = resolveFeature(name, settings);
  return out;
}

export async function toggleFeature(name: FeatureName): Promise<boolean> {
  const store = await import("./store.server");
  const next = !resolveFeature(name, await store.getSettings());
  await store.setSetting(FEATURES[name].key, next ? "on" : "off");
  return next;
}
