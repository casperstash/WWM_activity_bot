import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

let ai = null;
function getAi() {
  if (!config.gemini.apiKey) throw new Error("GEMINI_API_KEY not set — cannot use Gemini fallback");
  if (!ai) ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return ai;
}

const PROMPT = `This is a screenshot of a game guild member roster table. Columns are, left to
right: Member Name, Positions (a role badge like "Members" / "Sinners" /
"Peerless Victor"), Level (e.g. 95), Online Status (e.g. "Online" / "Offline 1d"),
and the rightmost column "Week Activity" — a number.

Extract EVERY member row fully visible in the image. For each row return:
- "name": the Member Name EXACTLY as displayed, preserving all unicode — CJK
  characters, diacritics, decorative bullets/dots (e.g. "• Gluttony •"), spacing.
  Do NOT include the Position badge, Level, or Online Status in the name.
- "points": the number in the "Week Activity" column, as an integer. This is the
  RIGHTMOST number in the row. Do NOT use the Level (95) or any other number.
- "uid": the member's numeric UID if one is visible in the row, else omit.

Return ONLY a JSON array. Do not skip rows that are partially styled or have
unusual characters. Do not invent rows that are cut off at the top/bottom edges.`;

const SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      points: { type: "integer" },
      uid: { type: "string" },
    },
    required: ["name", "points"],
  },
};

/** Extract member rows from one image buffer via Gemini vision. */
export async function geminiImage(buffer, mimeType = "image/png") {
  const res = await getAi().models.generateContent({
    model: config.gemini.model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buffer.toString("base64") } },
          { text: PROMPT },
        ],
      },
    ],
    config: { responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  const rows = JSON.parse(res.text);
  if (!Array.isArray(rows)) throw new Error("Gemini returned non-array");
  return rows.map((r) => ({ name: r.name, points: r.points, uid: r.uid, confidence: 100 }));
}
