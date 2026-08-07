/** Represents a single column in an ODS sheet. */
export interface ColumnDefinition {
  /** JSON path in the observation object, e.g. "/observedProperty" or "/hasResult/numericValue" */
  jsonPath: string;
  /** Dutch title from schema "title" field, used as header label */
  title: string;
  /** Tooltip/help text from schema "description" field */
  description?: string;
  /** UI type for the cell input */
  uiType: 'text' | 'date' | 'datetime' | 'number' | 'dropdown' | 'readonly';
  /** Raw URI values from schema enum (for dropdowns), to be enriched by codelist */
  dropdownUris?: string[];
  /** Human-readable labels resolved from codelist prefLabel/code (populated after enrichment) */
  dropdownLabels?: string[];
  /** Whether this property is required in the schema */
  required: boolean;
  /** Read-only / pre-filled value */
  readonlyValue?: string;
  /** UI ordering annotation from x-ui-first */
  xUiFirst?: boolean;
  /** UI ordering annotation from x-ui-after: property name to place after */
  xUiAfter?: string;
}

/** A single sheet in a multi-sheet ODS document. */
export interface SheetDefinition {
  /** Sheet name visible in LibreOffice tabs */
  sheetName: string;
  /** Columns for this sheet */
  columns: ColumnDefinition[];
  /** If nested sheet, the JSON path in the parent sheet that groups to this sheet */
  parentPath?: string;
}

/** Result of enriching a URI with codelist data. */
export interface EnrichedValue {
  /** The original URI */
  rawUri: string;
  /** Display label: prefLabel for concepts, code for units, or fallback */
  displayLabel: string;
  /** Definition/tooltip text from codelist */
  definition?: string;
  /** Whether this was resolved from the codelist vs. fallback */
  resolved: boolean;
}
