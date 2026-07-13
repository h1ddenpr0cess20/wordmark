/**
 * Helpers for rendering reasoning/thinking content.
 */

import { marked } from "marked";
import { sanitizeWithMedia } from "../../utils/sanitize.ts";
import { createMediaPlaceholderRegex } from "../../utils/placeholders.ts";

/**
 * Closes a still-open fenced code block at the end of streamed markdown.
 *
 * @remarks
 * Tracks fences the way CommonMark does — an opening fence is 3+ backticks at
 * the start of a line (up to 3 spaces of indentation) whose info string has no
 * backticks; a closing fence is at least as many backticks with nothing else on
 * the line. Backtick runs elsewhere (inline code, prose, fenced content) don't
 * count, so they can't flip the state the way the old occurrence-parity check
 * could.
 */
function closeDanglingFence(text: string): string {
  let openFence = "";
  for (const line of text.split("\n")) {
    const match = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    if (!openFence) {
      if (!match[2].includes("`")) {
        openFence = match[1];
      }
    } else if (match[1].length >= openFence.length && !match[2].trim()) {
      openFence = "";
    }
  }
  return openFence ? `${text}\n${openFence}` : text;
}

/**
 * Renders streamed markdown to sanitized HTML: closes any dangling code
 * fence/inline-code so partial streams parse, then hides `[[IMAGE: ...]]` and
 * `[[MEDIA: ...]]` placeholders behind a CSS class.
 */
export function processMainContentMarkdown(mainText: string) {
  let html = closeDanglingFence(mainText);

  const backtickCount = (html.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0 && html.endsWith("`")) {
    html += "`";
  }

  let parsedContent = sanitizeWithMedia(marked.parse(html, { async: false }));

  parsedContent = parsedContent.replace(createMediaPlaceholderRegex(), (match) => {
    return `<span class="hidden-image-placeholder">${match}</span>`;
  });

  return parsedContent;
}

/**
 * Splits text into main content and reasoning by extracting `<think>...</think>`
 * segments.
 *
 * @param text - The text to split; may contain `<think>...</think>` segments.
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
