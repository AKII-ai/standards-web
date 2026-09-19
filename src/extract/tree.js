/** 法令JSONツリー走査。scripts/egov.py の find_all / node_text と同等。 */

export function* findAll(node, tag) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    if (node.tag === tag) yield node;
    for (const child of node.children || []) yield* findAll(child, tag);
  } else if (Array.isArray(node)) {
    for (const child of node) yield* findAll(child, tag);
  }
}

export function nodeText(node) {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && !Array.isArray(node)) {
    if (node.tag === "Rt") return "";
    return (node.children || []).map(nodeText).join("");
  }
  if (Array.isArray(node)) return node.map(nodeText).join("");
  return "";
}
