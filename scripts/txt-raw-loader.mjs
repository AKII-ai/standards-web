import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (/\.(txt|md)(\?raw)?$/.test(specifier)) {
    const bare = specifier.replace(/\?raw$/, "");
    const resolved = await nextResolve(bare, context);
    return { url: resolved.url, format: "module", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const file = url.split("?")[0];
  if (file.endsWith(".txt") || file.endsWith(".md")) {
    const source = readFileSync(fileURLToPath(file), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(source)};`,
    };
  }
  return nextLoad(url, context);
}
