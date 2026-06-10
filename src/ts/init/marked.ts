/**
 * Markdown (marked) initialization.
 */

import { marked } from "marked";

/**
 * Initializes the marked library with custom configuration.
 *
 * @remarks
 * marked v16+ passes a single token object to renderer methods, so the link
 * renderer reads `{ href, title, tokens }` and renders the inline text via the
 * bound parser, adding `target`/`rel` for safety.
 */
export function initializeMarked() {
  marked.use({
    gfm: true,
    breaks: true,
    pedantic: false,
    renderer: {
      link(token) {
        const { href, title, tokens } = token;
        const text = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${title}"` : "";
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
    },
  });
}
