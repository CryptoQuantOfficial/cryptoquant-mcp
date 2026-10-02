export function parseMetricIds(toon: string): string[] {
  const lines = toon.split("\n");
  const headerIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("metrics[") && trimmed.includes("{") && trimmed.includes("}:");
  });
  if (headerIndex === -1) throw new Error("metrics.toon header line not found");

  const fieldCount = lines[headerIndex].match(/\{([^}]+)\}/)![1].split(",").length;
  const ids = new Set<string>();
  for (const raw of lines.slice(headerIndex + 1)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const values = line.split(",").map((value) => value.trim());
    if (values.length >= fieldCount && values[0]) ids.add(values[0]);
  }
  return [...ids].sort();
}
