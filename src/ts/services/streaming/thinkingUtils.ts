/**
 * Helpers for rendering reasoning/thinking content.
 */

import { marked } from "marked";
import { sanitizeWithMedia } from "../../utils/sanitize.ts";

/**
 * Renders streamed markdown to sanitized HTML: closes any dangling code
 * fence/inline-code so partial streams parse, then hides `[[IMAGE: ...]]`
 * placeholders behind a CSS class.
 */
export function processMainContentMarkdown(mainText: string) {
  let html = mainText;

  if (html.split("```").length % 2 === 0) {
    html += "\n```";
  }

  const backtickCount = (html.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0 && html.endsWith("`")) {
    html += "`";
  }

  let parsedContent = sanitizeWithMedia(marked.parse(html, { async: false }));

  parsedContent = parsedContent.replace(/\[\[IMAGE: ([^\]]+)\]\]/g, (match) => {
    return `<span class="hidden-image-placeholder">${match}</span>`;
  });

  return parsedContent;
}

/**
 * Splits text into main content and reasoning by extracting `<think>...</think>`
 * segments.
 *
 * @returns `{ content, reasoning }` with the reasoning segments removed from content.
 */
export function separateThinkingSegments(text: string) {
  if (typeof text !== "string" || !text) {
    return { content: text || "", reasoning: "" };
  }

  const lower = text.toLowerCase();
  const openTag = "<think>";
  const closeTag = "</think>";
  const contentParts: string[] = [];
  const reasoningParts: string[] = [];
  let cursor = 0;
  let inThinking = false;

  while (cursor < text.length) {
    if (!inThinking) {
      const openIndex = lower.indexOf(openTag, cursor);
      if (openIndex === -1) {
        contentParts.push(text.slice(cursor));
        break;
      }
      if (openIndex > cursor) {
        contentParts.push(text.slice(cursor, openIndex));
      }
      cursor = openIndex + openTag.length;
      inThinking = true;
    } else {
      const closeIndex = lower.indexOf(closeTag, cursor);
      if (closeIndex === -1) {
        reasoningParts.push(text.slice(cursor));
        cursor = text.length;
        break;
      }
      if (closeIndex > cursor) {
        reasoningParts.push(text.slice(cursor, closeIndex));
      }
      cursor = closeIndex + closeTag.length;
      inThinking = false;
    }
  }

  return {
    content: contentParts.join(""),
    reasoning: reasoningParts.join(""),
  };
}
