type JsonType = "string" | "number" | "boolean" | "null" | "array" | "object";

export interface ShapeNode {
  type: JsonType | JsonType[];
  fields?: Record<string, ShapeNode>;
  elementShape?: ShapeNode;
}

export interface ShapeDiff {
  path: string;
  kind: "added" | "removed" | "type_changed";
  baselineType?: string;
  liveType?: string;
}

function getJsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return t;
  if (t === "object") return "object";
  return "string"; // fallback for undefined etc.
}

function normalizeType(types: JsonType[]): JsonType | JsonType[] {
  const unique = [...new Set(types)];
  unique.sort();
  return unique.length === 1 ? unique[0] : unique;
}

export function mergeShapes(a: ShapeNode, b: ShapeNode): ShapeNode {
  const aTypes = Array.isArray(a.type) ? a.type : [a.type];
  const bTypes = Array.isArray(b.type) ? b.type : [b.type];
  const mergedType = normalizeType([...aTypes, ...bTypes]);

  const result: ShapeNode = { type: mergedType };

  // Merge object fields
  if (a.fields || b.fields) {
    result.fields = { ...a.fields };
    for (const [key, bShape] of Object.entries(b.fields ?? {})) {
      if (result.fields[key]) {
        result.fields[key] = mergeShapes(result.fields[key], bShape);
      } else {
        result.fields[key] = bShape;
      }
    }
  }

  // Merge array element shapes
  if (a.elementShape && b.elementShape) {
    result.elementShape = mergeShapes(a.elementShape, b.elementShape);
  } else {
    result.elementShape = a.elementShape ?? b.elementShape;
  }

  return result;
}

export function extractShape(value: unknown): ShapeNode {
  const type = getJsonType(value);

  if (type === "array") {
    const arr = value as unknown[];
    if (arr.length === 0) {
      return { type: "array" };
    }
    let elementShape = extractShape(arr[0]);
    for (let i = 1; i < arr.length; i++) {
      elementShape = mergeShapes(elementShape, extractShape(arr[i]));
    }
    return { type: "array", elementShape };
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const fields: Record<string, ShapeNode> = {};
    for (const [key, val] of Object.entries(obj)) {
      fields[key] = extractShape(val);
    }
    return { type: "object", fields };
  }

  return { type };
}

function typeToString(type: JsonType | JsonType[]): string {
  return Array.isArray(type) ? type.join(" | ") : type;
}

export function diffShapes(
  baseline: ShapeNode,
  live: ShapeNode,
  path: string = "$",
): ShapeDiff[] {
  const diffs: ShapeDiff[] = [];

  const baseType = typeToString(baseline.type);
  const liveType = typeToString(live.type);

  if (baseType !== liveType) {
    diffs.push({
      path,
      kind: "type_changed",
      baselineType: baseType,
      liveType: liveType,
    });
    // If top-level types differ fundamentally, don't recurse
    return diffs;
  }

  // Compare object fields
  if (baseline.fields || live.fields) {
    const baseFields = baseline.fields ?? {};
    const liveFields = live.fields ?? {};
    const allKeys = new Set([...Object.keys(baseFields), ...Object.keys(liveFields)]);

    for (const key of allKeys) {
      const childPath = `${path}.${key}`;
      if (!(key in baseFields)) {
        diffs.push({ path: childPath, kind: "added", liveType: typeToString(liveFields[key].type) });
      } else if (!(key in liveFields)) {
        diffs.push({ path: childPath, kind: "removed", baselineType: typeToString(baseFields[key].type) });
      } else {
        diffs.push(...diffShapes(baseFields[key], liveFields[key], childPath));
      }
    }
  }

  // Compare array element shapes
  if (baseline.elementShape && live.elementShape) {
    diffs.push(...diffShapes(baseline.elementShape, live.elementShape, `${path}[]`));
  } else if (!baseline.elementShape && live.elementShape) {
    // Baseline had empty array, live has elements — report element shape as new
    diffs.push({ path: `${path}[]`, kind: "added", liveType: typeToString(live.elementShape.type) });
  } else if (baseline.elementShape && !live.elementShape) {
    // Live has empty array, baseline had elements
    // Not necessarily a removal — just no data. Skip.
  }

  return diffs;
}

export function shapeToString(node: ShapeNode, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  const typeStr = typeToString(node.type);

  if (node.fields) {
    const fieldLines = Object.entries(node.fields)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${pad}  ${key}: ${shapeToString(child, indent + 1)}`);
    return `${typeStr} {\n${fieldLines.join("\n")}\n${pad}}`;
  }

  if (node.elementShape) {
    return `${typeStr}[${shapeToString(node.elementShape, indent)}]`;
  }

  return typeStr;
}
