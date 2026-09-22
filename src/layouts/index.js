import DOTAI from "./414M60001000029.md?raw";
import { parseLayout } from "./parse.js";

const byId = new Map();

function register(text) {
  const layout = parseLayout(typeof text === "string" ? text : text?.default);
  if (layout?.lawId) byId.set(layout.lawId, layout);
}

register(DOTAI);
const extras = import.meta.glob("./*.md", { query: "?raw", eager: true, import: "default" });
for (const text of Object.values(extras || {})) register(text);

export function getLayout(lawId) {
  return byId.get(lawId) || null;
}
