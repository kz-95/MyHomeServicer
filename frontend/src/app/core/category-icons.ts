/**
 * Category icon resolver.
 *
 * Category records store their icon as a Lucide icon NAME string
 * (e.g. "wind", "sparkles", "chef-hat", "wrench"). This project does not
 * bundle an icon-font / Lucide library - the established convention across
 * the app (see the portal sidebars in customer-shell / merchant-shell /
 * admin-shell, which use emoji such as '🔍' '📋' '📅') is to render icons
 * as emoji glyphs. This helper maps a Lucide icon name to its closest emoji
 * so category cards show a glyph instead of the raw icon name as text.
 */

const LUCIDE_ICON_EMOJI: Record<string, string> = {
  wind: '💨',
  sparkles: '✨',
  'chef-hat': '🧑‍🍳',
  wrench: '🔧',
  plug: '🔌',
  zap: '⚡',
  hammer: '🔨',
  'paint-roller': '🎨',
  paintbrush: '🖌️',
  leaf: '🌿',
  sprout: '🌱',
  bug: '🐛',
  truck: '🚚',
  home: '🏠',
  book: '📚',
};

/** Fallback glyph when a category has no icon or an unrecognised one. */
export const DEFAULT_CATEGORY_ICON = '🏠';

/**
 * Resolve a category's stored icon value to a displayable emoji glyph.
 * - Known Lucide icon name → mapped emoji
 * - Any other non-empty value (e.g. an emoji already) → returned unchanged
 * - Empty / undefined → DEFAULT_CATEGORY_ICON
 */
export function categoryIcon(icon: string | null | undefined): string {
  if (!icon) return DEFAULT_CATEGORY_ICON;
  return LUCIDE_ICON_EMOJI[icon] ?? icon;
}
