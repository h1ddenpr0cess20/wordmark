/**
 * Shared attachment chip markup.
 *
 * @remarks
 * Single source of truth for the file/directory chips used in three places: the
 * pending-upload previews above the composer ({@link ./attachmentPreviews.ts}),
 * the chips baked into an outgoing user message
 * ({@link ./outgoingAttachments.ts}), and the chips rebuilt from a message's
 * stored attachment records when a conversation is loaded from history
 * ({@link ../../services/history/render.ts}). Keeping the markup here is what
 * stops the send path and the history path from drifting apart.
 *
 * Chip icons are CSS masks (see `src/css/components/ui/file-attachments.css`)
 * rather than inline `<svg>` markup, because message HTML is run through
 * DOMPurify, whose allowlist drops `<svg>` elements — an inline icon would
 * render in the composer preview and then vanish inside the message bubble.
 */

import { escapeHtml } from "../../utils/sanitize.ts";
import { formatFileSize } from "../../utils/utils.ts";
import type { Attachment } from "../../../types/api.ts";

/** Display data for a single attachment chip. */
export interface AttachmentChip {
  /** Filename, or directory name for a directory upload. */
  name: string;
  /** Secondary text: a formatted size, or a file count and total size. */
  meta: string;
  /** True when the chip stands for a directory upload rather than one file. */
  isDirectory?: boolean;
}

/**
 * Formats a directory chip's secondary text, e.g. `3 files (1.2 MB)`.
 *
 * @param fileCount - Number of files the directory contributed.
 * @param totalSize - Combined size of those files, in bytes.
 */
export function formatDirectoryMeta(fileCount: number, totalSize: number): string {
  return `${fileCount} file${fileCount !== 1 ? "s" : ""} (${formatFileSize(totalSize)})`;
}

/**
 * Builds the icon/name/meta markup shared by every attachment chip, with the
 * name and meta text HTML-escaped.
 */
export function chipContentMarkup(chip: AttachmentChip): string {
  const iconClass = chip.isDirectory ? "chip-icon chip-icon-directory" : "chip-icon chip-icon-file";
  const name = escapeHtml(chip.name);
  const parts = [
    `<span class="${iconClass}" aria-hidden="true"></span>`,
    `<span class="chip-name" title="${name}">${name}</span>`,
  ];
  if (chip.meta) {
    parts.push(`<span class="chip-meta">${escapeHtml(chip.meta)}</span>`);
  }
  return parts.join("");
}

/** Builds one chip's markup as rendered inside a user message bubble. */
export function documentChipMarkup(chip: AttachmentChip): string {
  return `<div class="attachment-chip attached-document">${chipContentMarkup(chip)}</div>`;
}

/**
 * Builds the `.attached-documents` block wrapping a message's document chips.
 *
 * @param chips - Chips to render; an empty list yields an empty string so the
 * caller can skip the wrapper entirely.
 */
export function attachedDocumentsMarkup(chips: AttachmentChip[]): string {
  if (chips.length === 0) {
    return "";
  }
  return `<div class="attached-documents">${chips.map(documentChipMarkup).join("")}</div>`;
}

/**
 * Turns a message's stored attachment records back into chips, re-grouping
 * entries that share a `directory` into a single directory chip carrying the
 * file count and total size — the same shape the send path renders.
 *
 * @param attachments - The message's stored attachments; image records and
 * unnamed entries are ignored (images are restored from their
 * `[[IMAGE: ...]]` placeholders instead).
 * @returns One chip per standalone document, plus one per source directory.
 */
export function documentChipsFromAttachments(attachments?: Attachment[]): AttachmentChip[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  const chips: AttachmentChip[] = [];
  const directories = new Map<string, { chip: AttachmentChip; fileCount: number; totalSize: number }>();

  attachments.forEach((attachment) => {
    if (!attachment || attachment.type !== "document") {
      return;
    }

    const size = typeof attachment.size === "number" ? attachment.size : 0;
    const directory = typeof attachment.directory === "string" ? attachment.directory : "";

    if (directory) {
      let group = directories.get(directory);
      if (!group) {
        group = { chip: { name: directory, meta: "", isDirectory: true }, fileCount: 0, totalSize: 0 };
        directories.set(directory, group);
        chips.push(group.chip);
      }
      group.fileCount += 1;
      group.totalSize += size;
      group.chip.meta = formatDirectoryMeta(group.fileCount, group.totalSize);
      return;
    }

    const filename = typeof attachment.filename === "string" ? attachment.filename : "";
    if (!filename) {
      return;
    }
    chips.push({ name: filename, meta: formatFileSize(size) });
  });

  return chips;
}
