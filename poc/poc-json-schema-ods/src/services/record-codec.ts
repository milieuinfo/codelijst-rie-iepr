import { randomUUID } from './runtime.js';
import { SchemaValidator, SemanticValidator, pointerToken, schemaObject, materializeDerivedValues, transformMemberData, canonicalDataPath, referenceSnapshot } from 'codelijst-rie-iepr-poc-json-schema/browser';
import type { ReferenceRecord, ReferenceContext } from 'codelijst-rie-iepr-poc-json-schema';
import type { CellValue, LookupChoice, RecordPlan, TabularPlan, WorkbookMetadata, WorkbookRow } from '../models/tabular-plan.js';
import { WorkbookError } from '../models/tabular-plan.js';
import { planFingerprint, pointer } from './tabular-plan.js';
import { referenceData } from './workbook-metadata.js';
import { businessLayout, identifierColumn } from './workbook-layout.js';
import { jsonMapping } from './json-mapping.js';

export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getPath(value: unknown, path: string[]): { present: boolean; value?: unknown } {
  for (const key of path) {
    if (!isObject(value) || !Object.hasOwn(value, key)) return { present: false };
    value = value[key];
  }
  return { present: true, value };
}

export function setPath(target: unknown, path: string[], value: unknown): unknown {
  if (!path.length) return value;
  if (!isObject(target)) throw new Error(`Cannot assign ${pointer(path)} outside an object.`);
  let owner = target;
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(owner, key)) Object.defineProperty(owner, key, { value: {}, writable: true, enumerable: true, configurable: true });
    const child = owner[key];
    if (!isObject(child)) throw new Error(`Non-object container at ${pointer(path)}.`);
    owner = child;
  }
  Object.defineProperty(owner, path.at(-1)!, { value, writable: true, enumerable: true, configurable: true });
  return target;
}

export function cellValue(value: unknown): value is CellValue {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

export function recordReference(record: RecordPlan, values: Record<string, CellValue>, id: string): string {
  const relations = [
    'http://purl.org/dc/terms/identifier', 'https://schema.org/identifier',
    'http://schema.org/identifier', 'http://www.w3.org/2000/01/rdf-schema#label',
  ];
  const candidates = record.columns.filter(column => relations.includes(String(column.schema['x-jsonld-id'])) &&
    Object.hasOwn(values, column.id) && String(values[column.id]).length);
  candidates.sort((a, b) => relations.indexOf(String(a.schema['x-jsonld-id'])) - relations.indexOf(String(b.schema['x-jsonld-id'])) ||
    a.path.length - b.path.length);
  const first = candidates[0];
  const peers = first ? candidates.filter(column => column.schema['x-jsonld-id'] === first.schema['x-jsonld-id'] && column.path.length === first.path.length) : [];
  return record.id === 'root' ? 'Rapportage' : peers.length === 1 ? String(values[first.id]) : id;
}

export function validateData(plan: TabularPlan, data: unknown, references: ReferenceRecord[], referenceContext?: ReferenceContext): void {
  const structural = new SchemaValidator().validateInstance(plan.schema, data, plan.dependencies);
  if (!structural.valid) throw new WorkbookError(structural.errors.map(error => ({
    sheet: 'JSON', instancePath: error.instancePath + (error.property ? '/' + pointerToken(error.property) : ''), schemaPath: error.schemaPath,
    message: `${error.instancePath || '/'}: ${error.message}${error.property ? ` (${error.property})` : ''}`,
  })));
  const semantic = new SemanticValidator().validate(plan.schema, data, { dependencies: plan.dependencies, references, referenceContext });
  if (semantic.length) throw new WorkbookError(semantic.map(error => ({
    sheet: 'JSON', instancePath: error.instancePath, message: `${error.instancePath || '/'}: ${error.message}`,
  })));
}

export function choices(
  values: CellValue[], label: (value: CellValue) => string,
): LookupChoice[] {
  const labels = values.map(label);
  const counts = new Map<string, number>();
  labels.forEach(label => counts.set(label, (counts.get(label) ?? 0) + 1));
  const result = values.map((value, index) => ({
    value,
    display: (counts.get(labels[index]) ?? 0) > 1 ? `${labels[index]} [${typeof value}:${JSON.stringify(value)}]` : labels[index],
  }));
  if (new Set(result.map(choice => choice.display)).size !== result.length) throw new Error('Ambiguous lookup display values.');
  return result;
}

export function workbookRows(
  plan: TabularPlan,
  options: { data?: unknown; references?: ReferenceRecord[]; referenceContext?: ReferenceContext; label?: (value: string) => string },
): { tables: Map<string, WorkbookRow[]>; metadata: WorkbookMetadata } {
  const snapshot = referenceSnapshot(plan.schema);
  const references = referenceData(options.references ?? snapshot?.references ?? []);
  options = { ...options, referenceContext: options.referenceContext ?? snapshot?.referenceContext };
  if (options.data !== undefined) options = {
    ...options, data: materializeDerivedValues(plan.schema, options.data, plan.dependencies),
  };
  if (options.data !== undefined) validateData(plan, options.data, references, options.referenceContext);
  const tables = new Map(plan.records.map(record => [record.id, [] as WorkbookRow[]]));
  const entities = new Map<string, WorkbookRow>();
  const paths = new Map<string, string>();
  const inputData = options.data === undefined ? {} : transformMemberData(plan.schema, options.data, 'presentation');
  const extract = (record: RecordPlan, value: unknown, parent?: WorkbookRow, dataPath: (string | number)[] = []): void => {
    const values: Record<string, CellValue> = {};
    for (const column of record.columns) {
      const current = getPath(value, column.path);
      if (!current.present) continue;
      if (column.schema['x-inline-array']) {
        if (!Array.isArray(current.value) || !current.value.every(cellValue)) throw new Error(`Expected scalar array at ${pointer(column.path)}.`);
        values[column.id] = JSON.stringify(current.value);
        continue;
      }
      if (!cellValue(current.value)) throw new Error(`Unsupported JSON cell value at ${pointer(column.path)}.`);
      if (column.schema.type === 'integer' && !Number.isSafeInteger(current.value)) {
        throw new Error(`Integer outside the exact JSON number range at ${pointer(column.path)}.`);
      }
      values[column.id] = current.value;
    }
    const row: WorkbookRow = {
      id: randomUUID(), parentId: parent?.id, reference: '', values,
      containers: record.containers.filter(container => {
        const found = getPath(value, container.path);
        return found.present && (container.kind === 'array' ? Array.isArray(found.value) : isObject(found.value));
      }),
    };
    row.reference = recordReference(record, values, row.id);
    tables.get(record.id)!.push(row);
    entities.set(row.id, row);
    paths.set(row.id, pointer(canonicalDataPath(plan.schema, inputData, dataPath).map(String)));
    for (const child of plan.records.filter(candidate => candidate.parentId === record.id)) {
      const found = getPath(value, child.path);
      if (!found.present) continue;
      if (!Array.isArray(found.value)) throw new Error(`Expected a record array at ${pointer(child.path)}.`);
      found.value.forEach((item, index) => extract(child, item, row, [...dataPath, ...child.path, index]));
    }
  };
  extract(plan.records[0], inputData);
  const metadata: WorkbookMetadata = {
    version: 2, schemaId: plan.schemaId, schemaSha256: plan.schemaSha256, sourceSha256: plan.sourceSha256,
    planSha256: planFingerprint(plan), lookups: {}, rows: {}, references, referenceContext: options.referenceContext,
    jsonMapping: jsonMapping(plan),
  };
  if (businessLayout(plan)) {
    metadata.layout = 'business-v1';
    metadata.businessRows = {};
    for (const record of plan.records.filter(record => plan.records.some(child => child.parentId === record.id && record.id !== 'root'))) {
      const identifier = identifierColumn(record);
      if (!identifier) throw new Error(`${record.sheetName}: a business identifier is required to link detail sheets.`);
      const seen = new Set<string>();
      for (const row of tables.get(record.id)!) {
        const value = row.values[identifier.id];
        const linked = [...tables.values()].some(children => children.some(child => child.parentId === row.id));
        if (value === undefined || String(value).trim() === '') {
          if (!linked) continue;
          throw new Error(`${record.sheetName}: ${identifier.title} must be filled and unique to link detail sheets.`);
        }
        if (seen.has(String(value))) throw new Error(`${record.sheetName}: ${identifier.title} must be filled and unique to link detail sheets.`);
        row.reference = String(value);
        seen.add(row.reference);
      }
    }
  }
  for (const record of plan.records) {
    const rows = tables.get(record.id)!;
    const counts = new Map<string, number>();
    rows.forEach(row => counts.set(row.reference, (counts.get(row.reference) ?? 0) + 1));
    rows.forEach(row => {
      if ((counts.get(row.reference) ?? 0) > 1) row.reference += ` [${row.id}]`;
    });
    if (new Set(rows.map(row => row.reference)).size !== rows.length) throw new Error('Ambiguous record references.');
    for (const column of record.columns) {
      const definition = column.schema['x-inline-array'] ? schemaObject(column.schema.items) : column.schema;
      const enumValues = definition.enum;
      const expectedTypes = definition['x-reference-types'];
      let values: CellValue[] | undefined;
      if (cellValue(column.schema.const)) {
        values = [column.schema.const];
      } else if (enumValues) {
        if (!enumValues.every(cellValue)) throw new Error('Lookup enums must contain scalar values.');
        values = enumValues;
      } else if (definition.type === 'boolean') {
        values = [true, false];
      } else if (Array.isArray(expectedTypes)) {
        if (Array.isArray(definition['x-reference-options']) && !definition['x-reference-options'].length) {
          throw new Error(`No permitted references for ${record.title}: ${column.title}.`);
        }
        values = references.filter(reference => reference.types.some(type => expectedTypes.includes(type))).map(reference => reference.id);
        if (!values.length) throw new Error(`Reference data is required for ${record.title}: ${column.title}.`);
      }
      if (values) metadata.lookups[column.id] = choices(values, value => {
        const reference = references.find(reference => reference.id === value);
        return reference?.label ?? (typeof value === 'boolean' ? value ? 'Ja' : 'Nee'
          : typeof value === 'string' ? options.label?.(value) ?? value : String(value));
      });
    }
  }
  for (const [recordId, rows] of tables) for (const row of rows) {
    row.parentReference = row.parentId ? entities.get(row.parentId)!.reference : undefined;
    metadata.rows[row.id] = {
      recordId, parentId: row.parentId, reference: row.reference, parentReference: row.parentReference,
      instancePath: paths.get(row.id)!,
      ...(row.parentId ? { parentInstancePath: paths.get(row.parentId)! } : {}),
    };
    if (metadata.businessRows) metadata.businessRows[row.id] = { values: row.values, containers: row.containers };
  }
  return { tables, metadata };
}
