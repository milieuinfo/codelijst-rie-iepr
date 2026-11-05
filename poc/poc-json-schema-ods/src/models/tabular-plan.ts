import type { JsonSchemaObject, ReferenceRecord, ReferenceContext } from 'codelijst-rie-iepr-poc-json-schema';

export type CellValue = string | number | boolean;

export interface TabularColumn {
  id: string;
  path: string[];
  title: string;
  schema: JsonSchemaObject;
  schemaPointer: string;
  schemaDocumentId: string;
  required: boolean;
  temporalRangePart?: boolean;
  presentationOrder?: number;
}

export interface ContainerPlan {
  path: string[];
  kind: 'object' | 'array';
  required: boolean;
}

export interface RecordPlan {
  id: string;
  parentId?: string;
  path: string[];
  ancestry: string[];
  title: string;
  sheetName: string;
  kind: 'object' | 'value' | 'array';
  schema: JsonSchemaObject;
  schemaPointer: string;
  schemaDocumentId: string;
  columns: TabularColumn[];
  containers: ContainerPlan[];
}

export interface TabularPlan {
  version: 1;
  schemaId: string;
  schemaSha256: string;
  sourceSha256: string;
  schema: JsonSchemaObject;
  dependencies: JsonSchemaObject[];
  records: RecordPlan[];
}

export interface LookupChoice {
  value: CellValue;
  display: string;
}

export interface WorkbookRow {
  id: string;
  parentId?: string;
  reference: string;
  parentReference?: string;
  containers: ContainerPlan[];
  values: Record<string, CellValue>;
}

export interface WorkbookMetadata {
  version: 1;
  schemaId: string;
  schemaSha256: string;
  sourceSha256: string;
  planSha256: string;
  lookups: Record<string, LookupChoice[]>;
  rows: Record<string, { recordId: string; parentId?: string; reference: string; parentReference?: string }>;
  references: ReferenceRecord[];
  referenceContext?: ReferenceContext;
  layout?: 'business-v1';
  businessRows?: Record<string, { values: Record<string, CellValue>; containers: ContainerPlan[] }>;
}

export interface WorkbookDiagnostic {
  sheet: string;
  row?: number;
  column?: string;
  instancePath?: string;
  schemaPath?: string;
  message: string;
}

export class WorkbookError extends Error {
  constructor(public readonly diagnostics: WorkbookDiagnostic[]) {
    super(diagnostics.map(error => `${error.sheet}${error.row ? `!${error.column ?? ''}${error.row}` : ''}: ${error.message}`).join('\n'));
    this.name = 'WorkbookError';
  }
}
