/**
 * Tool loader stub for template mode.
 */

/**
 * No-op tool-script loader retained for API compatibility in template mode.
 *
 * @returns A resolved promise.
 */
export function loadToolScripts() {
  console.info("Tool scripts are not loaded in template mode.");
  return Promise.resolve();
}
