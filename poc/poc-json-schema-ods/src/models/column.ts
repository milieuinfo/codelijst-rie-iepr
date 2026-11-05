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
