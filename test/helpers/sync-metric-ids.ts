import { readFileSync, writeFileSync } from "node:fs";

import { parseMetricIds } from "./metric-ids.js";

const source = process.argv[2] ?? "../cryptoquant-mcp-server/data/metrics.toon";
const target = new URL("../fixtures/metric-ids.txt", import.meta.url);

const ids = parseMetricIds(readFileSync(source, "utf-8"));
writeFileSync(target, ids.join("\n") + "\n");
console.log(`Wrote ${ids.length} metric ids from ${source}`);
