import { createHash } from 'node:crypto';
import { SchemaRegistry, schemaObject, pointerToken, SchemaValidator } from 'codelijst-rie-iepr-poc-json-schema';
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema';
import type { RecordPlan, TabularPlan } from '../models/tabular-plan.js';

export const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export const pointer = (path: string[]): string => path.length ? '/' + path.map(pointerToken).join('/') : '';

export function compileTabularPlan(
  schema: JsonSchemaObject,
  options: { sourceSha256: string; schemaSha256?: string; dependencies?: JsonSchemaObject[] },
): TabularPlan {
  if (!schema.$id || !/^[a-f0-9]{64}$/.test(options.sourceSha256)) throw new Error('A schema identity and source fingerprint are required.');
  const dependencies = options.dependencies ?? [];
  new SchemaValidator().validateInstance(schema, {}, dependencies);
  const registry = new SchemaRegistry(schema, dependencies);
  const records: RecordPlan[] = [];
  const active = new Set<string>();
  const makeRecord = (input: JsonSchemaObject, path: string[], title: string, parent?: RecordPlan): RecordPlan => {
    const node = registry.resolve(input);
    const kind = node.type === 'object' ? 'object' : node.type === 'array' ? 'array' : 'value';
    const location = registry.location(node);
    const definitionId = `${location.documentId}#${location.pointer}`;
    if (active.has(definitionId)) throw new Error('Recursive record definitions cannot be represented by a finite workbook.');
    const ancestry = parent ? [...parent.ancestry, parent.id] : [];
    const id = parent ? 'r_' + hash(JSON.stringify([ancestry, path, location])).slice(0, 24) : 'root';
    const record: RecordPlan = {
      id, parentId: parent?.id, path, ancestry, title, sheetName: '', kind, schema: node,
      schemaPointer: location.pointer, schemaDocumentId: location.documentId, columns: [], containers: [],
    };
    const sheet = input['x-table-sheet'] ?? node['x-table-sheet'];
    if (typeof sheet === 'string') record.sheetName = sheet;
    records.push(record);
    active.add(definitionId);
    const walk = (input: JsonSchemaObject, path: string[], titles: string[], required: boolean, temporalRangePart = false, inheritedOrder?: number): void => {
      const current = registry.resolve(input);
      const order = typeof current['x-table-order'] === 'number' ? current['x-table-order'] : inheritedOrder;
      if (current.oneOf || current.prefixItems || current.patternProperties || current.unevaluatedProperties ||
          Array.isArray(current.type)) throw new Error(`Unsupported tabular schema construct at ${pointer(path)}.`);
      for (const alternative of Array.isArray(current.anyOf) ? current.anyOf : []) {
        const branch = schemaObject(alternative);
        if (branch.type || branch.items || Object.values(branch.properties ?? {}).some(child => {
          const definition = schemaObject(child);
          return !!definition.type || !!definition.properties || !!definition.items;
        })) throw new Error(`Alternative record layouts are not supported at ${pointer(path)}.`);
      }
      if (current.allOf?.some(block => {
        const part = schemaObject(block);
        return !!part.$ref || !!part.properties;
      })) throw new Error(`Structural allOf must be resolved explicitly at ${pointer(path)}.`);
      if (current.type === 'array') {
        if (!current.items) throw new Error(`Array without an item schema at ${pointer(path)}.`);
        const item = registry.resolve(schemaObject(current.items));
        if (typeof current['x-table-sheet'] === 'string' && !['object', 'array'].includes(item.type ?? '')) {
          const location = registry.location(current);
          record.columns.push({
            id: 'c_' + hash(JSON.stringify([id, path])).slice(0, 24), path,
            title: current.title ?? titles.at(-1) ?? 'Waarden',
            schema: { ...current, 'x-inline-array': true },
            schemaPointer: location.pointer, schemaDocumentId: location.documentId, required,
            presentationOrder: order,
          });
        } else {
          record.containers.push({ path, kind: 'array', required });
          const child = makeRecord(item, path, current.title ?? titles.at(-1) ?? 'Waarden', record);
          if (typeof current['x-table-sheet'] === 'string') child.sheetName = current['x-table-sheet'];
        }
      } else if (current.type === 'object') {
        if (current.additionalProperties !== false) {
          throw new Error(`Open-ended objects cannot be represented without losing fields at ${pointer(path)}.`);
        }
        if (path.length) record.containers.push({ path, kind: 'object', required });
        const entries = Object.entries(current.properties ?? {}).map(([key, child]) => [key, registry.resolve(schemaObject(child))] as const);
        const ordered: typeof entries = [];
        const visiting = new Set<string>();
        const done = new Set<string>();
        const append = (entry: typeof entries[number]): void => {
          const [key, child] = entry;
          if (done.has(key)) return;
          if (visiting.has(key)) throw new Error(`Cyclic sibling UI ordering at ${pointer([...path, key])}.`);
          visiting.add(key);
          const previous = child['x-ui-after'];
          if (typeof previous === 'string') {
            const anchor = entries.find(([name]) => name === previous);
            if (!anchor) throw new Error(`Unresolved sibling UI ordering: ${previous}.`);
            append(anchor);
          }
          visiting.delete(key);
          done.add(key);
          ordered.push(entry);
        };
        for (const entry of [...entries.filter(([, child]) => child['x-ui-first']), ...entries]) append(entry);
        for (const [key, child] of ordered) {
          walk(
            child, [...path, key], [...titles, child.title ?? (key === '@id' ? 'Entiteits-ID' : key)],
            required && !!current.required?.includes(key),
            current['x-temporal-range'] === true && ['start', 'end'].includes(key),
            order,
          );
        }
      } else {
        const type = current.type ?? (current.const !== undefined ? typeof current.const : undefined);
        if (!['string', 'number', 'integer', 'boolean'].includes(String(type))) {
          throw new Error(`Unsupported or missing leaf type at ${pointer(path)}.`);
        }
        const location = registry.location(current);
        const parentTitle = titles.at(-2);
        const title = path.at(-1) === 'numericValue' && parentTitle ? current.title ?? parentTitle
          : ['hasUnit', 'unitCode'].includes(path.at(-1) ?? '') ? 'Eenheid'
            : titles.at(-1) ?? record.title;
        record.columns.push({
          id: 'c_' + hash(JSON.stringify([id, path])).slice(0, 24), path, title, schema: current,
          schemaPointer: location.pointer, schemaDocumentId: location.documentId, required,
          presentationOrder: order,
          ...(temporalRangePart ? { temporalRangePart: true } : {}),
        });
      }
    };
    if (kind === 'array') {
      if (!node.items) throw new Error('Array record has no item schema.');
      makeRecord(schemaObject(node.items), [], title, record);
    } else walk(node, [], [title], true);
    active.delete(definitionId);
    return record;
  };
  if (registry.resolve(schema).type !== 'object') throw new Error('A reporting section must have an object root.');
  makeRecord(schema, [], schema.title ?? 'Rapportage');
  const names = new Set(['voorblad', 'keuzelijsten', '_riepr']);
  for (const record of records) {
    const base = record.title.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Gegevens';
    let name = record.id === 'root' ? 'Voorblad' : record.sheetName || base;
    const explicit = !!record.sheetName;
    if (explicit && (name.length > 31 || /[\[\]:*?/\\]/.test(name))) throw new Error(`Invalid declared worksheet name: ${name}`);
    if (explicit && names.has(name.toLocaleLowerCase('nl'))) throw new Error(`Duplicate declared worksheet name: ${name}`);
    if (record.id !== 'root' && names.has(name.toLocaleLowerCase('nl'))) name = base.slice(0, 20) + ' ' + hash(record.id).slice(0, 10);
    if (record.id !== 'root' && names.has(name.toLocaleLowerCase('nl'))) throw new Error(`Worksheet name collision: ${name}`);
    names.add(name.toLocaleLowerCase('nl'));
    record.sheetName = name;
    if (record.columns.some(column => column.presentationOrder !== undefined)) {
      record.columns.sort((a, b) => (a.presentationOrder ?? Infinity) - (b.presentationOrder ?? Infinity));
    }
    const units = record.columns.filter(column => ['hasUnit', 'unitCode'].includes(column.path.at(-1) ?? ''));
    for (const unit of units) {
      const value = record.columns.find(column => ['numericValue', 'value'].includes(column.path.at(-1) ?? '') &&
        pointer(column.path.slice(0, -1)) === pointer(unit.path.slice(0, -1)));
      if (!value) continue;
      record.columns.splice(record.columns.indexOf(unit), 1);
      record.columns.splice(record.columns.indexOf(value) + 1, 0, unit);
    }
  }
  return {
    version: 1, schemaId: schema.$id, schemaSha256: options.schemaSha256 ?? hash(JSON.stringify(schema)),
    sourceSha256: options.sourceSha256, schema, dependencies, records,
  };
}

export function planFingerprint(plan: TabularPlan): string {
  return hash(JSON.stringify(plan.records));
}
