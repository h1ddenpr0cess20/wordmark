/**
 * Markdown (marked) initialization for the chatbot application
 */

import { marked } from "marked";

/**
 * Initialize the marked library with custom configuration
 */
export function initializeMarked() {
  // Configure marked. Marked v16+ passes a single token object to renderer
  // methods, so the link renderer reads { href, title, tokens } and renders the
  // inline text via the bound parser, adding target/rel for safety.
  marked.use({
    gfm: true,
    breaks: true, // Keep this change as it helps with line breaks
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
