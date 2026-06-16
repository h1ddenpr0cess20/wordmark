/**
 * Assistant-file list row markup.
 *
 * @remarks
 * Pure helpers that render an `assistants`-purpose file record into the HTML
 * shown by the file manager. Extracted from {@link ./filesManager.ts} so the
 * markup (and its escaping) is testable in isolation, separate from the
 * fetch/delete event wiring.
 */

import { escapeHtml } from "../utils/sanitize.ts";

/** A subset of an assistant file record used to render a list row. */
export interface AssistantFileLike {
  id?: string;
  filename?: string;
  name?: string;
  created_at?: number;
}

/**
 * Formats an assistant file's `created_at` (Unix seconds) as a locale date.
 *
 * @param createdAt - Creation time in seconds since the epoch, if known.
 * @returns The localized date string, or `"Unknown"` when absent.
 */
export function formatAssistantFileDate(createdAt?: number): string {
  return createdAt ? new Date(createdAt * 1000).toLocaleDateString() : "Unknown";
}

/**
 * Builds the HTML for a single assistant-file list item.
 *
 * @param file - The file record; name falls back through `filename`, `name`,
 * then `(no name)`, and all interpolated values are HTML-escaped.
 * @returns The list-item markup string.
 */
export function buildAssistantFileItemHtml(file: AssistantFileLike): string {
  const createdDate = formatAssistantFileDate(file.created_at);
  const name = escapeHtml(file.filename || file.name || "(no name)");
  const id = escapeHtml(file.id || "");
  return `
        <div class="assistant-file-item" data-file-id="${id}">
          <div class="assistant-file-row">
            <div class="assistant-file-info">
              <strong>${name}</strong>
              <div class="assistant-file-meta">
                <span class="meta-item"><strong>ID:</strong> ${id}</span>
                <span class="meta-item"><strong>Created:</strong> ${createdDate}</span>
              </div>
            </div>
            <div class="assistant-file-actions">
              <button class="btn-small btn-delete-file" data-file-id="${id}" title="Delete this file">Delete</button>
            </div>
          </div>
        </div>
      `;
}
