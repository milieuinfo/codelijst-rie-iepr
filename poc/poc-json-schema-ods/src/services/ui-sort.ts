import type { ColumnDefinition } from '../models/column.js';

/**
 * Sort column definitions by relative UI ordering annotations (uiFirst, uiAfter).
 * Columns with _uiFirst come first, then topologically sorted columns,
 * then remaining unconstrained columns in original order.
 */
export function sortColumnsByUiOrder(columns: ColumnDefinition[]): ColumnDefinition[] {
  if (columns.length <= 1) return [...columns];

  const byJsonPath = new Map(columns.map(c => [c.jsonPath, c]));
  const jsonPaths = new Set(columns.map(c => c.jsonPath));

  // Normalize: use xUi* or ui* fields as source of truth
  const isFirst = (c: ColumnDefinition): boolean =>
    !!c.uiFirst || !!c.xUiFirst;

  const getAfterRef = (c: ColumnDefinition): string | undefined =>
    c.uiAfter ?? c.xUiAfter;

  // Resolve a uiAfter ref (jsonPath, bare property name, or title) to a column jsonPath
  const propToPath = new Map(columns.map(c => [c.title, c.jsonPath]));
  for (const c of columns) {
    propToPath.set(c.jsonPath.slice(1), c.jsonPath);
    propToPath.set(c.jsonPath, c.jsonPath);
  }

  const resolveRef = (ref: string): string | undefined => {
    if (jsonPaths.has(ref)) return ref;
    if (propToPath.has(ref)) return propToPath.get(ref);
    return undefined;
  };

  // Collect jsonPaths that are referenced by another column's uiAfter, so that
  // unannotated anchor columns are still included in the ordered group.
  const referencedPaths = new Set<string>();
  for (const c of columns) {
    const after = getAfterRef(c);
    if (!after) continue;
    const target = resolveRef(after);
    if (target && target !== c.jsonPath) referencedPaths.add(target);
  }

  const firstCols: ColumnDefinition[] = [];
  const orderedCols: ColumnDefinition[] = [];
  const freeCols: ColumnDefinition[] = [];

  for (const c of columns) {
    const after = getAfterRef(c);
    if (isFirst(c)) {
      firstCols.push(c);
    } else if ((after && resolveRef(after)) || referencedPaths.has(c.jsonPath)) {
      orderedCols.push(c);
    } else {
      freeCols.push(c);
    }
  }

  const sorted = topologicalSort(orderedCols, byJsonPath, resolveRef);
  return [...firstCols, ...sorted, ...freeCols];
}

function topologicalSort(
  columns: ColumnDefinition[],
  byPath: Map<string, ColumnDefinition>,
  resolveRef: (ref: string) => string | undefined,
): ColumnDefinition[] {
  if (columns.length === 0) return [];

  const result: ColumnDefinition[] = [];
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const c of columns) {
    inDegree.set(c.jsonPath, 0);
    if (!dependents.has(c.jsonPath)) dependents.set(c.jsonPath, []);
  }

  for (const c of columns) {
    const afterRaw = c.uiAfter ?? c.xUiAfter;
    if (!afterRaw) continue;
    const targetPath = resolveRef(afterRaw);
    if (!targetPath || !inDegree.has(targetPath)) continue;

    inDegree.set(c.jsonPath, (inDegree.get(c.jsonPath) ?? 0) + 1);
    dependents.get(targetPath)?.push(c.jsonPath);
  }

  const originalOrder = new Map(columns.map((c, i) => [c.jsonPath, i]));
  let queue: ColumnDefinition[] = [];
  for (const c of columns) {
    if ((inDegree.get(c.jsonPath) ?? 0) === 0) queue.push(c);
  }
  queue.sort((a, b) => (originalOrder.get(a.jsonPath) ?? 0) - (originalOrder.get(b.jsonPath) ?? 0));

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    const deps = dependents.get(current.jsonPath) ?? [];
    for (const depPath of deps) {
      inDegree.set(depPath, (inDegree.get(depPath) ?? 1) - 1);
      if (inDegree.get(depPath) === 0) {
        const depCol = byPath.get(depPath);
        if (depCol) queue.push(depCol);
      }
    }
    queue.sort((a, b) => (originalOrder.get(a.jsonPath) ?? 0) - (originalOrder.get(b.jsonPath) ?? 0));
  }

  if (result.length < columns.length) {
    const sortedPaths = new Set(result.map(c => c.jsonPath));
    const cycled = columns.filter(c => !sortedPaths.has(c.jsonPath));
    console.warn(`Circular uiAfter dependency detected among: ${cycled.map(c => c.jsonPath).join(', ')}`);
    result.push(...cycled);
  }

  return result;
}
