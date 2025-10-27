// Simple helper to reference centralized SVG icons
// Usage: window.icon('settings', { width: 16, height: 16, className: 'my-class' })
window.icon = function(name, opts = {}) {
  const width = opts.width ?? 16;
  const height = opts.height ?? 16;
  const className = opts.className ? ` class="${opts.className}"` : "";
  const style = opts.color ? ` style="color: ${opts.color}"` : (opts.style ? ` style="${opts.style}"` : "");
  // stroke/fill attributes are defined inside the symbol paths. Keep outer SVG generic.
  return `\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${className}${style}>\n  <use href="src/assets/icons.svg#${name}"></use>\n</svg>`;
};
