import { randomUUID, equalJson } from './runtime.js';
import { materializeDerivedValues } from 'codelijst-rie-iepr-poc-json-schema/browser';
import type { ReferenceRecord, ReferenceContext } from 'codelijst-rie-iepr-poc-json-schema';
import type { CellValue, ContainerPlan, RecordPlan, TabularColumn, TabularPlan, WorkbookDiagnostic, WorkbookMetadata } from '../models/tabular-plan.js';
import { WorkbookError } from '../models/tabular-plan.js';
import { cellValue, getPath, isObject, recordReference, setPath, validateData } from './record-codec.js';
import { planFingerprint, pointer } from './tabular-plan.js';
import { columnLetter, readOdf } from './odf.js';
import type { OdfCell, OdfTable } from './odf.js';
import { businessLayout, identifierColumn, inputColumns, layoutColumns, parentColumn } from './workbook-layout.js';
import { workbookMetadata } from './workbook-metadata.js';
import { jsonMapping, machineColumns } from './json-mapping.js';

interface ImportedRow {
  id: string;
  parentId?: string;
  hiddenParent?: string;
  reference: string;
  parentReference: string;
  value: unknown;
  sheet: string;
  number: number;
  record: RecordPlan;
  instancePath: string;
  indices: Map<string, number>;
}

const populated = (cell?: OdfCell): boolean => !!cell && (cell.type !== undefined || cell.value !== undefined || !!cell.text || !!cell.formula);
const empty: OdfCell = { text: '' };

function scalar(cell: OdfCell, column: TabularColumn, metadata: WorkbookMetadata): CellValue | undefined {
  if (!populated(cell)) return undefined;
  if (cell.formula) throw new Error('Formula cells are not supported; enter the actual value.');
  const choices = metadata.lookups[column.id];
  if (column.schema['x-inline-array']) {
    if (cell.type && cell.type !== 'string') throw new Error('Expected a choice or a JSON array of choices.');
    const values: unknown = cell.text.startsWith('[') ? JSON.parse(cell.text) : [cell.text];
    if (!Array.isArray(values) || !values.every(cellValue)) throw new Error('Expected a JSON array of scalar values.');
    return JSON.stringify(values.map(value => {
      if (!choices) return value;
      const matches = choices.filter(choice => choice.display === value);
      if (matches.length !== 1) throw new Error('Unknown or ambiguous selection; use choices from Keuzelijsten.');
      return matches[0].value;
    }));
  }
  if (choices) {
    const matches = choices.filter(choice => typeof choice.value === 'boolean' && cell.type === 'boolean'
      ? String(choice.value) === cell.value : choice.display === cell.text);
    if (matches.length !== 1) throw new Error('Unknown or ambiguous selection; use a choice from Keuzelijsten.');
    return matches[0].value;
  }
  const type = column.schema.type ?? (column.schema.const !== undefined ? typeof column.schema.const : undefined);
  if (type === 'number' || type === 'integer') {
    if (cell.type && !['float', 'string'].includes(cell.type)) throw new Error('Expected a numeric cell.');
    const lexical = (cell.type === 'float' ? cell.value : cell.text)?.trim();
    if (!lexical || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(lexical)) {
      throw new Error('Enter a number without thousands separators (decimal comma or point is accepted).');
    }
    const number = Number(lexical.replace(',', '.'));
    if (!Number.isFinite(number) || (type === 'integer' && !Number.isSafeInteger(number))) {
      throw new Error(type === 'integer' ? 'Expected an integer in the exact JSON number range.' : 'Expected a finite number.');
    }
    return number;
  }
  if (type === 'boolean') {
    const value = cell.type === 'boolean' ? cell.value : cell.text;
    if (value !== 'true' && value !== 'false') throw new Error('Expected a boolean cell (true or false).');
    return value === 'true';
  }
  if (['date', 'date-time'].includes(column.schema.format ?? '') || column.temporalRangePart) {
    if (cell.type && !['date', 'string'].includes(cell.type)) throw new Error('Expected an ISO date or date-time cell.');
    return cell.type === 'date' ? cell.value ?? '' : cell.text;
  }
  if (column.schema.format === 'duration') {
    if (cell.type && !['time', 'string'].includes(cell.type)) throw new Error('Expected an ISO 8601 duration.');
    return cell.type === 'time' ? cell.value ?? '' : cell.text;
  }
  if (cell.type && cell.type !== 'string') throw new Error('Expected text; numeric identifiers must be entered as text to preserve leading zeros.');
  return cell.text;
}

function containers(value: string, record: RecordPlan): ContainerPlan[] {
  const raw: unknown = value ? JSON.parse(value) : [];
  if (!Array.isArray(raw)) throw new Error('Lost or invalid container metadata.');
  return raw.map(item => {
    if (!isObject(item) || !Array.isArray(item.path) || !item.path.every(part => typeof part === 'string')) {
      throw new Error('Invalid container path metadata.');
    }
    const expected = record.containers.find(container => container.kind === item.kind && pointer(container.path) === pointer(item.path as string[]));
    if (!expected) throw new Error('Container metadata does not match the schema.');
    return expected;
  });
}

export class ODSImporter {
  async import(input: Uint8Array, plan: TabularPlan, options: { references?: ReferenceRecord[]; referenceContext?: ReferenceContext } = {}): Promise<unknown> {
    const tables = await readOdf(input);
    const formulas = tables.flatMap(table => table.rows.flatMap(row => row.cells.flatMap((cell, index) =>
      cell.formula ? [{ sheet: table.name, row: row.number, column: columnLetter(index), message: 'Formula cells are not supported.' }] : [])));
    if (formulas.length) throw new WorkbookError(formulas);
    const marker = (table: OdfTable): string | undefined =>
      table.rows.find(row => row.number === 1)?.cells.find(cell => cell.text.startsWith('@'))?.text;
    const metaTables = tables.filter(table => marker(table) === '@metadata:v2');
    if (metaTables.length !== 1) throw new WorkbookError([{ sheet: '_riepr', message: 'Required workbook metadata is missing or duplicated; legacy workbooks cannot be imported. Regenerate the workbook.' }]);
    const metaTable = metaTables[0];
    let metadata: WorkbookMetadata;
    try {
      const json = metaTable.rows.filter(row => row.number > 1).map(row => row.cells[0]?.text ?? '').join('');
      metadata = workbookMetadata(JSON.parse(json));
    } catch (error) {
      throw new WorkbookError([{ sheet: metaTable.name, message: error instanceof Error ? error.message : String(error) }]);
    }
    if (metadata.schemaId !== plan.schemaId || metadata.schemaSha256 !== plan.schemaSha256 ||
        metadata.sourceSha256 !== plan.sourceSha256 || metadata.planSha256 !== planFingerprint(plan)) {
      throw new WorkbookError([{ sheet: metaTable.name, message: 'Workbook schema/source version differs from the selected generated schema. Regenerate the workbook.' }]);
    }
    const business = businessLayout(plan);
    if (!equalJson(metadata.jsonMapping, jsonMapping(plan))) {
      throw new WorkbookError([{ sheet: metaTable.name, message: 'Workbook JSON path mapping differs from the selected schema. Regenerate the workbook.' }]);
    }
    const seenPaths = new Set<string>();
    for (const baseline of Object.values(metadata.rows)) {
      const record = plan.records.find(record => record.id === baseline.recordId);
      const parent = baseline.parentId ? metadata.rows[baseline.parentId] : undefined;
      const prefix = parent && record ? `${parent.instancePath}${pointer(record.path)}/` : undefined;
      const valid = record && (record.id === 'root'
        ? !baseline.parentId && baseline.instancePath === '' && baseline.parentInstancePath === undefined
        : parent !== undefined && parent.recordId === record.parentId && baseline.parentInstancePath === parent.instancePath &&
          prefix !== undefined && baseline.instancePath.startsWith(prefix) &&
          /^(0|[1-9]\d*)$/.test(baseline.instancePath.slice(prefix.length)));
      if (!valid || seenPaths.has(baseline.instancePath)) {
        throw new WorkbookError([{ sheet: metaTable.name, message: 'Invalid or duplicate JSON row/parent path mapping.' }]);
      }
      seenPaths.add(baseline.instancePath);
    }
    if (business !== (metadata.layout === 'business-v1') || (business && !metadata.businessRows)) {
      throw new WorkbookError([{ sheet: metaTable.name, message: 'Workbook layout differs from the selected schema. Regenerate the workbook.' }]);
    }
    const lookupTables = tables.filter(table => marker(table) === '@lookups:v1');
    if (lookupTables.length !== 1) throw new WorkbookError([{ sheet: 'Keuzelijsten', message: 'Required lookup metadata is missing or duplicated.' }]);
    const displayed = new Set(plan.records.flatMap(record => inputColumns(record).map(column => column.id)));
    const expectedChoices = Object.entries(metadata.lookups).filter(([id]) => !business || displayed.has(id)).flatMap(([id, choices]) =>
      choices.map(choice => JSON.stringify([id, choice.display, String(choice.value), typeof choice.value]))).sort();
    const actualChoices = lookupTables[0].rows.filter(row => row.number > 2).map(row =>
      JSON.stringify([row.cells[0]?.text, row.cells[2]?.text, row.cells[3]?.text, row.cells[4]?.text])).sort();
    if (JSON.stringify(expectedChoices) !== JSON.stringify(actualChoices)) {
      throw new WorkbookError([{ sheet: lookupTables[0].name, message: 'Lookup values were changed or lost; use the generated lookup snapshot.' }]);
    }
    const diagnostics: WorkbookDiagnostic[] = [];
    const parsed: ImportedRow[] = [];
    const byId = new Map<string, ImportedRow>();
    const used = new Set([metaTable, lookupTables[0]]);
    const matched = new Set<string>();
    for (const record of plan.records) {
      const matching = tables.filter(table =>
        table.rows.find(row => row.number === 1)?.cells[0]?.text === metadata.jsonMapping[record.id].pathTemplate);
      if (matching.length !== 1) throw new WorkbookError([{ sheet: record.sheetName, message: 'Required record sheet metadata is missing or duplicated.' }]);
      const table = matching[0];
      used.add(table);
      const expected = layoutColumns(plan, record);
      const paths = machineColumns(plan, record.id);
      const machineRow = table.rows.find(row => row.number === 2) ?? (business && !expected.length ? { number: 2, cells: [] } : undefined);
      const header = table.rows.find(row => row.number === 3) ?? (business && !expected.length ? { number: 3, cells: [] } : undefined);
      if (!machineRow || !header) throw new WorkbookError([{ sheet: table.name, message: 'Required column metadata/header rows were lost.' }]);
      const indices = new Map<string, number>();
      machineRow.cells.forEach((cell, index) => {
        if (!cell.text && !paths.includes('')) return;
        const id = expected[paths.indexOf(cell.text)];
        if (id === undefined || indices.has(id)) {
          diagnostics.push({ sheet: table.name, row: 2, column: columnLetter(index), message: 'Unexpected or duplicate column identity.' });
        }
        if (id !== undefined) indices.set(id, index);
      });
      if (expected.some(id => !indices.has(id))) {
        throw new WorkbookError([{ sheet: table.name, row: 2, message: 'Required column metadata was lost. Regenerate the workbook.' }]);
      }
      const dataRows = table.rows.filter(row => row.number >= 4);
      if (business && record.id === 'root' && !dataRows.length) dataRows.push({ number: 4, cells: [] });
      for (const data of dataRows) {
        const physical = (id: string): OdfCell => data.cells[indices.get(id)!] ?? empty;
        const issue = (message: string, index?: number) => diagnostics.push({
          sheet: table.name, row: data.number, column: index === undefined ? undefined : columnLetter(index), message,
        });
        const active = business ? record.id === 'root' || !!physical('_parent_ref').text ||
          inputColumns(record).some(column => column.schema.const === undefined && populated(physical(column.id))) ||
          data.cells.some((cell, index) => populated(cell) && ![...indices.values()].includes(index)) : true;
        if (!active) continue;
        let matchedId: string | undefined;
        if (business) {
          const values: Record<string, CellValue> = {};
          for (const column of inputColumns(record)) {
            try {
              const value = scalar(physical(column.id), column, metadata);
              if (value !== undefined) values[column.id] = value;
            } catch (error) { issue(error instanceof Error ? error.message : String(error), indices.get(column.id)); }
          }
          const identifier = identifierColumn(record);
          const candidates = Object.entries(metadata.rows).filter(([id, baseline]) => {
            if (baseline.recordId !== record.id || matched.has(id)) return false;
            if (record.id === 'root') return true;
            const snapshot = metadata.businessRows![id];
            if (!snapshot) return false;
            if (identifier && values[identifier.id] !== undefined) return snapshot.values[identifier.id] === values[identifier.id];
            if (parentColumn(plan, record) && baseline.parentReference !== physical('_parent_ref').text) return false;
            return inputColumns(record).filter(column => column.schema.const === undefined)
              .every(column => snapshot.values[column.id] === values[column.id]);
          });
          if (candidates.length > 1) {
            const snapshots = candidates.map(([id]) => JSON.stringify(metadata.businessRows![id]));
            if (snapshots.some(snapshot => snapshot !== snapshots[0])) {
              issue('Ambiguous business row; hidden data cannot be assigned safely.');
              continue;
            }
          }
          matchedId = candidates[0]?.[0];
          if (matchedId) matched.add(matchedId);
          // Non-constant hidden data cannot follow an edited unidentified row safely.
          if (!matchedId && Object.entries(metadata.rows).some(([id, baseline]) =>
            baseline.recordId === record.id && !matched.has(id) && record.columns.some(column =>
              !displayed.has(column.id) && column.schema.const === undefined &&
              !column.schema['x-derived-from-source'] && metadata.businessRows![id]?.values[column.id] !== undefined))) {
            issue('Cannot identify the edited row carrying hidden entity data. Keep its business identifier unchanged.');
            continue;
          }
        }
        const snapshot = matchedId ? metadata.businessRows![matchedId] : undefined;
        const original = matchedId ? metadata.rows[matchedId] : undefined;
        const get = (id: string): OdfCell => {
          if (!business || indices.has(id)) return physical(id);
          const definition = record.columns.find(column => column.id === id);
          if (definition?.schema.const !== undefined || definition?.schema['x-derived-from-source']) return empty;
          const value = id === '_row_id' ? matchedId : id === '_parent_id' ? original?.parentId
            : id === '_containers' ? snapshot && JSON.stringify(snapshot.containers)
              : id === '_ref' ? original?.reference
                : id === '_parent_ref' ? original?.parentReference : snapshot?.values[id];
          if (value === undefined) return empty;
          const choice = metadata.lookups[id]?.find(choice => choice.value === value);
          return { text: choice?.display ?? String(value) };
        };
        const rawId = get('_row_id').text;
        const baseline = rawId ? metadata.rows[rawId] : undefined;
        const populatedRow = !!rawId || !!get('_ref').text || !!get('_parent_ref').text || !!get('_containers').text ||
          record.columns.some(column => column.schema.const === undefined && populated(get(column.id))) ||
          data.cells.some((cell, index) => populated(cell) && ![...indices.values()].includes(index));
        if (!populatedRow) continue;
        for (let index = 0; index < data.cells.length; index++) {
          if (populated(data.cells[index]) && ![...indices.values()].includes(index)) issue('Unexpected populated data column.', index);
          if (data.cells[index].formula) issue('Formula cells are not supported.', index);
        }
        if (rawId && (!baseline || baseline.recordId !== record.id)) issue('Unknown technical row ID or row moved into a different record sheet.');
        const id = rawId || randomUUID();
        if (byId.has(id)) issue('Duplicate technical row ID.', indices.get('_row_id'));
        let value: unknown = record.kind === 'array' ? [] : record.kind === 'object' ? {} : undefined;
        try {
          const present = containers(get('_containers').text, record);
          for (const container of [...present, ...record.containers.filter(container => container.required)]) {
            if (!getPath(value, container.path).present) value = setPath(value, container.path, container.kind === 'array' ? [] : {});
          }
        } catch (error) { issue(error instanceof Error ? error.message : String(error), indices.get('_containers')); }
        const constants: { column: TabularColumn; value: CellValue }[] = [];
        const decoded: Record<string, CellValue> = {};
        for (const column of record.columns) {
          try {
            const current = scalar(get(column.id), column, metadata);
            if (current !== undefined) decoded[column.id] = current;
            if (column.schema.const !== undefined) {
              if (current !== undefined && current !== column.schema.const) throw new Error('A constant value cannot be changed.');
              if (!cellValue(column.schema.const)) throw new Error('Unsupported constant value.');
              constants.push({ column, value: column.schema.const });
            } else if (current !== undefined) value = setPath(value, column.path,
              column.schema['x-inline-array'] ? JSON.parse(String(current)) : current);
          } catch (error) { issue(error instanceof Error ? error.message : String(error), indices.get(column.id)); }
        }
        const reference = business && identifierColumn(record)
          ? String(decoded[identifierColumn(record)!.id] ?? '')
          : get('_ref').text || recordReference(record, decoded, id);
        if (!business && !rawId && Object.values(metadata.rows).some(row => row.recordId === record.id && row.reference === reference)) {
          issue('An existing row lost its technical ID; new rows must use a distinct reference.');
        }
        for (const { column, value: constant } of constants) {
          if (!column.path.length || getPath(value, column.path.slice(0, -1)).present) value = setPath(value, column.path, constant);
        }
        if (record.kind === 'value' && value === undefined) issue('A scalar-array row requires a value.');
        const row: ImportedRow = {
          id, reference, hiddenParent: get('_parent_id').text || undefined, parentReference: get('_parent_ref').text,
          value, sheet: table.name, number: data.number, record, instancePath: '', indices,
        };
        parsed.push(row);
        byId.set(id, row);
      }
    }
    for (const table of tables) if (!used.has(table)) diagnostics.push({ sheet: table.name, message: 'Unexpected worksheet; it cannot be imported without losing data.' });
    const rootRows = parsed.filter(row => row.record.id === 'root');
    if (rootRows.length !== 1 || !metadata.rows[rootRows[0]?.id]) {
      diagnostics.push({ sheet: 'Voorblad', message: 'Exactly one original reporting-context row is required.' });
    }
    if (business) for (const record of plan.records.filter(record => record.id !== 'root' && plan.records.some(child => child.parentId === record.id))) {
      const references = parsed.filter(row => row.record.id === record.id && row.reference.trim()).map(row => row.reference);
      if (new Set(references).size !== references.length) {
        diagnostics.push({ sheet: record.sheetName, message: 'Ambiguous parent reference; business identifiers must be unique.' });
      }
    }
    for (const row of parsed) {
      if (!row.record.parentId) continue;
      const baseline = metadata.rows[row.id];
      const parents = parsed.filter(parent => parent.record.id === row.record.parentId);
      const candidates = row.parentReference ? parents.filter(parent =>
        parent.reference === row.parentReference || metadata.rows[parent.id]?.reference === row.parentReference) :
        row.record.parentId === 'root' ? rootRows : [];
      if (candidates.length !== 1) {
        diagnostics.push({ sheet: row.sheet, row: row.number, column: columnLetter(row.indices.get('_parent_ref')!),
          message: candidates.length ? 'Ambiguous parent reference; give parent rows distinct references.' : 'Missing/orphan parent reference.' });
        continue;
      }
      const parent = candidates[0];
      if (baseline && (!row.hiddenParent || (row.hiddenParent !== baseline.parentId && row.hiddenParent !== parent.id) ||
          (row.parentReference === baseline.parentReference && row.hiddenParent !== baseline.parentId))) {
        diagnostics.push({ sheet: row.sheet, row: row.number, column: columnLetter(row.indices.get('_parent_id')!),
          message: 'Visible and hidden parent links are inconsistent.' });
      } else if (!baseline && row.hiddenParent && row.hiddenParent !== parent.id) {
        diagnostics.push({ sheet: row.sheet, row: row.number, message: 'A new row has an inconsistent hidden parent link; leave technical IDs blank.' });
      }
      row.parentId = parent.id;
    }
    if (diagnostics.length) throw new WorkbookError(diagnostics);
    for (const record of plan.records.filter(record => record.parentId)) {
      for (const row of parsed.filter(row => row.record.id === record.id)) {
        const parent = byId.get(row.parentId!)!;
        let found = getPath(parent.value, record.path);
        if (!found.present) {
          parent.value = setPath(parent.value, record.path, []);
          found = getPath(parent.value, record.path);
        }
        if (!Array.isArray(found.value)) throw new Error('Record relationship does not target an array.');
        row.instancePath = `${parent.instancePath}${pointer(record.path)}/${found.value.length}`;
        found.value.push(row.value);
      }
    }
    const data = materializeDerivedValues(plan.schema, rootRows[0].value, plan.dependencies);
    try { validateData(plan, data, options.references ?? metadata.references, options.referenceContext ?? metadata.referenceContext); }
    catch (error) {
      if (!(error instanceof WorkbookError)) throw error;
      throw new WorkbookError(error.diagnostics.map(diagnostic => {
        const path = diagnostic.instancePath ?? '';
        const row = parsed.filter(row => path === row.instancePath || path.startsWith(row.instancePath + '/'))
          .sort((a, b) => b.instancePath.length - a.instancePath.length)[0] ?? rootRows[0];
        const relative = path.slice(row.instancePath.length);
        const column = row.record.columns.find(column => pointer(column.path) === relative) ??
          row.record.columns.find(column => relative.startsWith(pointer(column.path) + '/')) ??
          row.record.columns.find(column => pointer(column.path).startsWith(relative + '/') &&
            column.schema.const === undefined && getPath(row.value, column.path).present) ??
          row.record.columns.find(column => pointer(column.path).startsWith(relative + '/') && column.schema.const === undefined);
        return {
          ...diagnostic, sheet: row.sheet, row: row.number,
          column: columnLetter(row.indices.get(column?.id ?? '_ref')!),
        };
      }));
    }
    return data;
  }
}
