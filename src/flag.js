// Activity-point color flags applied to each member's cell in the new week
// column. The cutoffs and tier names live in grading.js (set with /grade):
//
//   0 < points < lurkerUnder      → red   "Lurker"     (very low activity)
//   lurkerUnder ≤ p < developingUnder → yellow "Developing"
//   points ≥ developingUnder      → no fill "Pillar"   (healthy — just counted)
//   points = 0 / blank            → no fill (0 is a hiatus/human-judgment value)
//
// Internal keys stay red/yellow (they map to the cell colors); the display
// names come from grading.js.
import { getGrading } from "./grading.js";

// Backgrounds tuned to Google Sheets' light palette (readable with black text).
export const FLAG_COLORS = {
  red: { red: 0.957, green: 0.780, blue: 0.780 }, // light red
  yellow: { red: 1.0, green: 0.898, blue: 0.6 }, // light amber
};

/** @returns {'red'|'yellow'|null} */
export function activityFlag(points) {
  const n = typeof points === "number" ? points : Number(points);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null; // 0 and blanks are human-judged, not auto-flagged
  const { lurkerUnder, developingUnder } = getGrading();
  if (n < lurkerUnder) return "red";
  if (n < developingUnder) return "yellow";
  return null;
}
