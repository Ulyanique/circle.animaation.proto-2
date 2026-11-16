// How one line of the final title's text is spaced. A plain function with no three.js in it, so that it can be
// checked on its own (tools/captiontest.mjs).

/**
 * Everything in the font's own units:
 *   natural   width of the line as the font sets it;  gaps = letters − 1;  cap = height of a capital letter
 *   target    the width the line should have;  most = the width it may have at the very most
 *   track     [least, most] letter-spacing, in cap heights; null = whatever it takes to reach `target`
 * The line is spread (or squeezed) to `target` by letter-spacing as long as the spacing stays within `track`: a short
 * line then comes out narrower than `target`, a long one wider — up to `most`, past which the letters get smaller.
 * Returns { tracking, width, shrink, fitted }: the spacing, the width of the line, the factor (≤ 1) to scale it by,
 * and whether the width is exactly `target`.
 */
export function fitLine({ natural, gaps, cap, target, most = Infinity, track = null }) {
  if (gaps < 1) return { tracking: 0, width: natural, shrink: Math.min(1, most / natural), fitted: false };
  const wanted = (target - natural) / gaps;
  const lo = track ? track[0] * cap : -Infinity, hi = track ? track[1] * cap : Infinity;
  if (wanted >= lo && wanted <= hi) return { tracking: wanted, width: target, shrink: Math.min(1, most / target), fitted: true };
  const tracking = Math.min(Math.max(wanted, lo), hi), width = natural + tracking * gaps;
  return { tracking, width, shrink: Math.min(1, most / width), fitted: false };
}
