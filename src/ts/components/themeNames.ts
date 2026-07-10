/**
 * Theme name parsing and display formatting.
 *
 * @remarks
 * Pure helpers used by {@link ./theme.ts} to discover theme class names from raw
 * CSS text and to turn a theme id into a human-readable selector label. Kept
 * free of DOM/state so the parsing and naming rules can be tested in isolation.
 */

/** Theme ids whose display name does not follow the title-case-from-slug rule. */
const themeNameOverrides: Record<string, string> = {
  "theme-usa": "USA",
};

/**
 * Extracts the `theme-*` class names (without the leading dot) declared in a
 * stylesheet's raw text, de-duplicated and in source order.
 *
 * @param cssContent - Raw CSS text to scan.
 * @returns The theme class names (e.g. `["theme-dark-red", ...]`), or `[]`.
 */
export function parseThemeClassNames(cssContent: string): string[] {
  const matches = (cssContent || "").match(/^\.theme-[a-zA-Z0-9-]+(?=\s*\{)/gm);
  if (!matches) {
    return [];
  }
  return matches
    .map(match => match.substring(1))
    .filter((theme, index, arr) => arr.indexOf(theme) === index);
}

/**
 * Converts a theme id to its display name.
 *
 * @param themeId - The theme id (e.g., `theme-dark-red`).
 * @returns The display name (e.g., `Dark Red`), honoring {@link themeNameOverrides}.
 */
export function getThemeDisplayName(themeId: string) {
  if (themeNameOverrides[themeId]) {
    return themeNameOverrides[themeId];
  }

  return themeId
    .replace("theme-", "")
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
