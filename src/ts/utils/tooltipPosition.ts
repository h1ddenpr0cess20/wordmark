/**
 * Tooltip placement geometry.
 *
 * @remarks
 * Pure, DOM-free computation of where the shared tooltip should sit relative to
 * its anchor, given the anchor/tooltip rects, viewport size, and scroll offsets.
 * Extracted from {@link ./tooltips.ts}'s `positionTooltip` so the placement math
 * (edge flipping, viewport clamping, help-icon arrow offset) can be reasoned
 * about and tested independently of the DOM it ultimately mutates.
 */

/** Inputs describing the anchor, the tooltip, and the viewport for placement. */
export interface TooltipPlacementInput {
  elementRect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  tooltipRect: { width: number; height: number };
  viewportWidth: number;
  viewportHeight: number;
  scrollX: number;
  scrollY: number;
  /** Whether the anchor is a `tool-help-icon` (placed below, with an arrow offset). */
  isHelpIcon: boolean;
}

/** Computed placement: page coordinates and, for help icons, an optional arrow offset. */
export interface TooltipPlacement {
  left: number;
  top: number;
  /** `--arrow-offset` value in px when the help-icon tooltip was edge-clamped, else `null`. */
  arrowOffset: number | null;
}

/**
 * Computes the tooltip's page position, flipping and clamping it to stay within
 * the viewport and deriving the help-icon arrow offset when needed.
 */
export function computeTooltipPlacement(input: TooltipPlacementInput): TooltipPlacement {
  const { elementRect, tooltipRect, viewportWidth, viewportHeight, scrollX, scrollY, isHelpIcon } = input;

  let left, top;
  let arrowOffset: number | null = null;

  if (isHelpIcon) {
    top = elementRect.bottom + scrollY + 5;
    left = elementRect.left + scrollX - 10;
  } else {
    top = elementRect.top + scrollY - tooltipRect.height - 10;
    left = elementRect.left + scrollX + (elementRect.width / 2) - (tooltipRect.width / 2);
  }

  if (!isHelpIcon && elementRect.top < tooltipRect.height + 10) {
    top = elementRect.bottom + scrollY + 10;
  }

  if (left < scrollX + 10) {
    if (elementRect.left < 50 && !isHelpIcon) {
      left = elementRect.right + scrollX + 10;
      top = elementRect.top + scrollY + (elementRect.height / 2) - (tooltipRect.height / 2);
    } else {
      left = scrollX + 10;
      if (isHelpIcon) {
        const offset = (elementRect.left + scrollX + elementRect.width / 2) - left;
        arrowOffset = Math.max(10, Math.min(offset, tooltipRect.width - 10));
      }
    }
  } else if (left + tooltipRect.width > scrollX + viewportWidth - 10) {
    if (elementRect.right > viewportWidth - 50 && !isHelpIcon) {
      left = elementRect.left + scrollX - tooltipRect.width - 10;
      top = elementRect.top + scrollY + (elementRect.height / 2) - (tooltipRect.height / 2);
    } else {
      left = scrollX + viewportWidth - tooltipRect.width - 10;
      if (isHelpIcon) {
        const offset = (elementRect.left + scrollX + elementRect.width / 2) - left;
        arrowOffset = Math.max(10, Math.min(offset, tooltipRect.width - 10));
      }
    }
  }

  if (top < scrollY + 10) {
    top = scrollY + 10;
  } else if (top + tooltipRect.height > scrollY + viewportHeight - 10) {
    top = scrollY + viewportHeight - tooltipRect.height - 10;
  }

  return { left, top, arrowOffset };
}
