/**
 * Pure, side-effect-free helpers for choosing the default service at startup.
 * Kept separate from services.js (which pulls in UI modules) so the decision
 * logic can be unit-tested without a DOM.
 */

function serviceHasKey(services, key) {
  const svc = services && services[key];
  return Boolean(svc && typeof svc.apiKey === "string" && svc.apiKey.trim() !== "");
}

/**
 * Given the configured services and the current default, return another cloud
 * provider that has an API key when the current default is a keyless cloud
 * provider, otherwise null.
 * @param {object} services - config.services map
 * @param {string} current - current default service key
 * @returns {string|null} the cloud service key to switch to, or null
 */
export function pickCloudFallback(services, current) {
  const currentIsCloud = current === "openai" || current === "xai";
  if (!currentIsCloud || serviceHasKey(services, current)) {
    return null;
  }
  for (const cloud of ["openai", "xai"]) {
    if (cloud !== current && serviceHasKey(services, cloud)) {
      return cloud;
    }
  }
  return null;
}
