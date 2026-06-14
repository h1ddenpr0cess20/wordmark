/** Rendering options for {@link icon}. */
interface IconOptions {
  width?: number | string;
  height?: number | string;
  className?: string;
  color?: string;
  style?: string;
}

/**
 * Builds an inline `<svg>` markup string that references a centralized icon from
 * `/icons.svg` by `name`.
 *
 * @example icon("settings", { width: 16, height: 16, className: "my-class" })
 */
export function icon(name: string, opts: IconOptions = {}) {
  const width = opts.width ?? 16;
  const height = opts.height ?? 16;
  const className = opts.className ? ` class="${opts.className}"` : "";
  const style = opts.color ? ` style="color: ${opts.color}"` : (opts.style ? ` style="${opts.style}"` : "");
  return `\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${className}${style}>\n  <use href="/icons.svg#${name}"></use>\n</svg>`;
}
