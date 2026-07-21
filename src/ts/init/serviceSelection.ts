/**
 * Pure, side-effect-free helpers for choosing the default service at startup.
 *
 * @remarks
 * Kept separate from `services.ts` (which pulls in UI modules) so the decision
 * logic can be unit-tested without a DOM.
 */

import type { ServiceConfig } from "../../types/config.ts";
import { isCloudService } from "../services/providers.ts";

function serviceHasKey(services: Record<string, ServiceConfig>, key: string) {
  const svc = services && services[key];
  return Boolean(svc && typeof svc.apiKey === "string" && svc.apiKey.trim() !== "");
}

/**
 * Picks another cloud provider that has an API key when the current default is
 * a keyless cloud provider.
 *
 * @param services - The `config.services` map.
 * @param current - The current default service key.
 * @returns The cloud service key to switch to, or `null`.
 */
export function pickCloudFallback(services: Record<string, ServiceConfig>, current: string) {
  const currentIsCloud = isCloudService(current);
  if (!currentIsCloud || serviceHasKey(services, current)) {
    return null;
  }
  for (const cloud of ["openai", "xai", "openrouter"]) {
    if (cloud !== current && serviceHasKey(services, cloud)) {
      return cloud;
    }
  }
  return null;
}
