// Brand tokens from Design.md, reduced to what a Discord embed can actually
// use: a state color for the left bar, plus a title treatment.
//
// Design.md is a light, white-canvas system — an embed can't honor its surfaces,
// fonts, 8pt spacing, or radius (Discord controls all of that). What DOES carry
// is the palette on the one colored bar, and clean bold titles. Every value here
// is a real Design.md token — no off-palette colors.

export const BRAND = {
  success: 0x008a00, // $color-success — written
  error: 0xe00000, // $color-error — failure
  accent: 0xff385c, // $color-accent — attention (Airbnb highlight)
  muted: 0x6e6e73, // $text-secondary — neutral / preview (nothing saved yet)
  ink: 0x111111, // $text-primary
};

// Wide-spaced uppercase title, echoing the guild's "G V G   S I G N U P" signup
// embed. (Design.md's own headers are tight — the user deliberately prefers this
// spaced look, so it overrides that.) Achieved with literal spaces since an embed
// title can't set letter-spacing.
export function heading(word) {
  return word.toUpperCase().split("").join(" ");
}
