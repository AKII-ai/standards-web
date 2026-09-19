import { expandQuery } from "../src/search/aliases.js";
import { rankLaws } from "../src/search/rank.js";

function entry(id, title) {
  return {
    law_info: { law_id: id, law_type: "Act" },
    current_revision_info: { law_title: title, law_title_kana: "", abbrev: null, repeal_status: "None" },
  };
}

const entries = [
  entry("A", "大気汚染防止法"),
  entry("B", "大気汚染防止法施行令"),
  entry("C", "水質汚濁防止法"),
  entry("D", "土壌汚染対策法"),
];
const queries = expandQuery("大気法");
const ranked = rankLaws(entries, queries);
const top = ranked[0]?.title;
console.log("queries:", queries.join(" / "));
console.log("top:", top);
if (top !== "大気汚染防止法") {
  console.error("NG: 大気法 の先頭が大気汚染防止法ではない");
  process.exit(1);
}
console.log("OK");
