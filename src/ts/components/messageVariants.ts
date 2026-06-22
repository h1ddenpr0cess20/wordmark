/**
 * Pure data helpers for assistant-message response versions (variants).
 *
 * @remarks
 * Kept free of DOM and app-state imports so the variant bookkeeping can be unit
 * tested in isolation; the DOM/image-map side of versioning lives in
 * {@link ../components/messageActions.ts}.
 */

import type { Message, MessageVariant } from "../../types/api.ts";

/** Captures the entry's current renderable fields as a variant. */
export function snapshotVariant(entry: Message): MessageVariant {
  return {
    content: typeof entry.content === "string" ? entry.content : "",
    reasoning: entry.reasoning,
    responseId: entry.responseId,
    codeInterpreterOutputs: entry.codeInterpreterOutputs,
    hasImages: entry.hasImages,
    incomplete: entry.incomplete,
  };
}

/** Copies a variant's fields onto the message entry's top-level fields. */
export function applyVariant(entry: Message, variant: MessageVariant): void {
  entry.content = variant.content;
  entry.reasoning = variant.reasoning;
  entry.responseId = variant.responseId;
  entry.codeInterpreterOutputs = variant.codeInterpreterOutputs;
  entry.hasImages = variant.hasImages;
  entry.incomplete = variant.incomplete;
}

/**
 * Lazily initializes an entry's variant list, seeding variant 0 from the
 * entry's current content. Returns `true` when it just created the list (so the
 * caller can snapshot the matching images), `false` when variants already exist.
 */
export function ensureVariants(entry: Message): boolean {
  if (!Array.isArray(entry.variants) || entry.variants.length === 0) {
    entry.variants = [snapshotVariant(entry)];
    entry.activeVariant = 0;
    return true;
  }
  return false;
}

/**
 * Records a freshly regenerated payload as a new variant of an existing
 * assistant entry, preserving the prior content as the first variant. Returns
 * `true` when variant 0 was seeded as part of this call.
 */
export function recordRegeneratedVariant(entry: Message, variant: MessageVariant): boolean {
  const seeded = ensureVariants(entry);
  entry.variants!.push(variant);
  entry.activeVariant = entry.variants!.length - 1;
  return seeded;
}
