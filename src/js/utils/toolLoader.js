/**
 * Tool loader stub for template mode.
 */

window.toolScriptsLoaded = true;

window.loadToolScripts = function() {
  console.info("Tool scripts are not loaded in template mode.");
  return Promise.resolve();
};
