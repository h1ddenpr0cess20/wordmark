/**
 * Rebuilding a message's generated-media thumbnails from its own text.
 *
 * @remarks
 * The `[[MEDIA: filename]]`/`[[IMAGE: filename]]` placeholders inside an
 * assistant message are the only durable record of which media belongs to which
 * message: the rendered thumbnail markup in `state.messageImages` is a runtime
 * cache that does not survive a reload, and the per-variant snapshots kept for
 * response versions are runtime-only too. Resolving placeholders back to
 * thumbnails lets every re-render path (history replay, variant switching)
 * recover a message's images instead of dropping them.
 */

import { state } from "../init/state.ts";
import { buildMediaRecordHtml } from "./mediaType.ts";
import { createMediaPlaceholderRegex } from "../utils/placeholders.ts";
import type { GeneratedImage } from "../../types/common.ts";

/**
 * Returns the media filenames referenced by a message's content, in the order
 * they appear and with duplicates removed.
 */
export function extractMediaFilenames(content: string): string[] {
  if (typeof content !== "string" || !content) {
    return [];
  }

  const filenames: string[] = [];
  const seen = new Set<string>();
  const regex = createMediaPlaceholderRegex();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const filename = match[1].trim();
    if (filename && !seen.has(filename)) {
      seen.add(filename);
      filenames.push(filename);
    }
  }

  return filenames;
}

/** Resolves a displayable source for a media record, preferring its own url. */
function resolveRecordUrl(record: GeneratedImage, filename: string): string {
  if (typeof record.url === "string" && record.url.trim()) {
    return record.url;
  }
  return state.imageDataCache?.get(filename) || "";
}

/**
 * Rebuilds the thumbnail markup for every media placeholder in `content` that
 * resolves to a known generated-media record with a displayable source.
 * Placeholders whose media is missing are skipped.
 */
export function buildMessageMediaHtml(content: string): string[] {
  const filenames = extractMediaFilenames(content);
  if (!filenames.length) {
    return [];
  }

  const images = Array.isArray(state.generatedImages) ? state.generatedImages : [];

  return filenames
    .map(filename => {
      const record = images.find(img => img && img.filename === filename);
      if (!record) {
        return null;
      }
      const url = resolveRecordUrl(record, filename);
      return url ? buildMediaRecordHtml({ ...record, url }) : null;
    })
    .filter((html): html is string => Boolean(html));
}
