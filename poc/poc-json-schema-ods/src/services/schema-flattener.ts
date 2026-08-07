import { readFileSync, existsSync } from 'fs';
import type { ColumnDefinition } from '../models/index.js';

interface JsonSchemaObject {
  $schema?: string;
  $id?: string;
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaObject>;
  allOf?: JsonSchemaObject[];
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchemaObject;
  if?: JsonSchemaObject;
  then?: JsonSchemaObject;
  xUiFirst?: boolean;
  xUiAfter?: string;
}

/**
 * Parses a JSON Schema (theme + optional base) into flat column definitions.
 *
 * Resolves allOf compositions, extracts nested properties as flat paths,
 * and maps JSON Schema types → ODS UI types.
 */
export class SchemaFlattener {
  private baseProperties?: Record<string, JsonSchemaObject>;

  constructor() {}

  /**
   * Load the base observatie.json schema for property resolution.
   * @param basePath - path to observatie.json
   */
  loadBaseSchema(basePath: string): void {
    if (!existsSync(basePath)) {
      console.warn(`Base schema not found at: ${basePath}`);
      return;
    }

    const raw = readFileSync(basePath, 'utf-8');
    const schema = JSON.parse(raw) as JsonSchemaObject;
    this.baseProperties = this.resolveAllOfProperties(schema);
  }

  /**
   * Flatten a theme schema into column definitions.
   * @param schemaJson - theme schema object or file path
   * @returns array of flat ColumnDefinition entries
   */
  flatten(schemaInput: JsonSchemaObject | string): ColumnDefinition[] {
    const schema = typeof schemaInput === 'string' ? this.loadFile(schemaInput) : schemaInput;
    const columns: ColumnDefinition[] = [];

    // Get top-level properties (resolve allOf)
    const topLevel = this.resolveTopLevelProperties(schema);
    const requiredSet = new Set(schema.required || []);

    // Process each top-level property
    this.processProperties(topLevel, '/', requiredSet, columns);

    // Also process if/then blocks for conditional properties
    this.processConditionalProperties(schema, requiredSet, columns);

    return this.deduplicate(columns);
  }

  // ----- Internal helpers -----

  private loadFile(path: string): JsonSchemaObject {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as JsonSchemaObject;
  }

  /** Get effective top-level properties by merging allOf blocks and direct properties. */
  private resolveTopLevelProperties(schema: JsonSchemaObject): Record<string, JsonSchemaObject> {
    const merged: Record<string, JsonSchemaObject> = {};

    // First: merge base refs from allOf
    if (schema.allOf) {
      for (const block of schema.allOf) {
        if (block.$ref && block.$ref.includes('observatie.json') && this.baseProperties) {
          Object.assign(merged, this.baseProperties);
          continue;
        }
        // Direct properties in allOf blocks
        if (block.properties) {
          Object.assign(merged, block.properties);
        }
        // allOf within allOf (e.g., hasResult with nested constraints)
        if (block.properties) {
          for (const [key, prop] of Object.entries(block.properties)) {
            if (!merged[key]) {
              merged[key] = prop;
            } else {
              merged[key] = this.mergePropertySchemas(merged[key], prop);
            }
          }
        }
      }
    }

    // Then: overlay direct properties (these take precedence)
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (!merged[key]) {
          merged[key] = prop;
        } else {
          merged[key] = this.mergePropertySchemas(merged[key], prop);
        }
      }
    }

    return merged;
  }

  /** Merge two property schemas (base ref + theme override). */
  private mergePropertySchemas(base: JsonSchemaObject, override: JsonSchemaObject): JsonSchemaObject {
    // Build merged schema
    const result: JsonSchemaObject = { ...override };

    // If base has a $ref and override has allOf with $ref, keep both
    if (base.$ref && override.allOf) {
      // Check if the base $ref is already in the override's allOf
      const hasRefInAllOf = override.allOf.some((block) => block.$ref === base.$ref);
      if (!hasRefInAllOf) {
        result.allOf = [{ $ref: base.$ref }, ...(override.allOf || [])];
      }
    }

    // Use override type/format/title/description, fall back to base
    if (!result.type) result.type = base.type;
    if (!result.format) result.format = base.format;
    if (!result.title) result.title = base.title;
    if (!result.description) result.description = base.description;
    if (!result.enum && base.enum) result.enum = base.enum;

    // Merge nested properties from allOf blocks
    if (override.allOf) {
      for (const block of override.allOf) {
        if (block.properties) {
          if (!result.properties) {
            result.properties = {};
          }
          for (const [k, v] of Object.entries(block.properties)) {
            if (!result.properties![k]) {
              result.properties![k] = v;
            } else {
              result.properties![k] = this.mergePropertySchemas(result.properties![k], v);
            }
          }
        }
        // Pull in items schema from allOf
        if (block.items && !result.items) {
          result.items = block.items;
        }
      }
    }

    return result;
  }

  /** Recursively process properties into flat column definitions. */
  private processProperties(
    properties: Record<string, JsonSchemaObject>,
    prefix: string,
    requiredSet: Set<string>,
    columns: ColumnDefinition[],
  ): void {
    for (const [key, prop] of Object.entries(properties)) {
      const path = `${prefix}${key}`;
      this.processSingleProperty(key, prop, path, requiredSet, columns);
    }
  }

  /** Process a single property, recursing into nested objects. */
  private processSingleProperty(
    key: string,
    prop: JsonSchemaObject,
    path: string,
    requiredSet: Set<string>,
    columns: ColumnDefinition[],
  ): void {
    // Resolve refs to get effective schema
    const resolved = this.resolveRef(prop);

    // Determine the actual type (filter out undefined)
    const rawTypes = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
    const types = rawTypes.filter((t): t is string => !!t);

    // Skip pure ref placeholders with no type info
    if (types.length === 0) return;
    if (types.length === 1 && types[0] === 'null') return;

    // Handle object with nested properties — recurse
    if (resolved.properties && !this.isLeafType(types)) {
      const childRequired = new Set(resolved.required || []);
      this.processProperties(resolved.properties, `${path}/`, childRequired, columns);
      return;
    }

    // Handle array — process items
    if (resolved.items) {
      const itemsResolved = this.resolveRef(resolved.items);
      if (itemsResolved.properties && !this.isLeafType(['object'])) {
        const childRequired = new Set(itemsResolved.required || []);
        this.processProperties(itemsResolved.properties, `${path}/`, childRequired, columns);
        return;
      }
    }

    // This is a leaf property — create column definition
    // Check if it has an enum for dropdown
    let dropdownUris: string[] | undefined;
    const allEnums = this.collectEnumsFromAllOf(prop);
    if (allEnums.length > 0) {
      dropdownUris = allEnums.filter((v) => typeof v === 'string');
    }

    const uiType = this.mapToUiType(resolved, dropdownUris || []);

    columns.push({
      jsonPath: path,
      title: resolved.title || key,
      description: resolved.description,
      uiType,
      dropdownUris: dropdownUris && dropdownUris.length > 0 ? dropdownUris : undefined,
      required: requiredSet.has(key),
      readonlyValue: resolved.const !== undefined ? String(resolved.const) : undefined,
      xUiFirst: resolved.xUiFirst || false,
      xUiAfter: resolved.xUiAfter,
    });
  }

  /** Process if/then conditional blocks to extract additional properties. */
  private processConditionalProperties(
    schema: JsonSchemaObject,
    requiredSet: Set<string>,
    columns: ColumnDefinition[],
  ): void {
    if (!schema.allOf) return;

    for (const block of schema.allOf) {
      if (block.if && block.then && block.then.properties) {
        // Merge the "then" properties with existing columns
        const thenProps = block.then.properties;
        for (const [key, prop] of Object.entries(thenProps)) {
          // Check if we already have this property; merge if needed
          const existing = columns.find((c) => c.jsonPath === `/${key}`);
          if (!existing) {
            columns.push({
              jsonPath: `/${key}`,
              title: prop.title || key,
              description: prop.description,
              uiType: this.mapToUiType(prop, []),
              required: false,
            });
          } else if (prop.const !== undefined && !existing.readonlyValue) {
            existing.readonlyValue = String(prop.const);
            existing.uiType = 'readonly';
          } else if (prop.properties) {
            for (const [subKey, subProp] of Object.entries(prop.properties)) {
              const subPath = `/${key}/${subKey}`;
              const subExisting = columns.find((c) => c.jsonPath === subPath);
              if (!subExisting) {
                columns.push({
                  jsonPath: subPath,
                  title: subProp.title || subKey,
                  description: subProp.description,
                  uiType: this.mapToUiType(subProp, []),
                  readonlyValue: subProp.const !== undefined ? String(subProp.const) : undefined,
                  required: false,
                });
              }
            }
          }
        }
      }
    }
  }

  /** Collect enum values from an allOf composition. */
  private collectEnumsFromAllOf(prop: JsonSchemaObject): unknown[] {
    const enums: unknown[] = [];

    // Direct enum
    if (prop.enum) {
      return prop.enum;
    }

    // Enum in allOf blocks
    if (prop.allOf) {
      for (const block of prop.allOf) {
        if (block.enum) {
          return block.enum;
        }
        // Nested allOf
        if (block.allOf) {
          for (const nested of block.allOf) {
            if (nested.enum) {
              return nested.enum;
            }
          }
        }
        // Properties with nested enums
        if (block.properties) {
          for (const subProp of Object.values(block.properties)) {
            const found = this.collectEnumsFromAllOf(subProp as JsonSchemaObject);
            if (found.length > 0) {
              enums.push(...found);
            }
          }
        }
      }
    }

    return enums;
  }

  /** Resolve a $ref to base schema properties, returning resolved property. */
  private resolveRef(prop: JsonSchemaObject): JsonSchemaObject {
    if (!prop.$ref || !this.baseProperties) return prop;

    // Extract property name from ref fragment
    const match = prop.$ref.match(/#\/properties\/([^/]+)/);
    if (match && match[1]) {
      const baseProp = this.baseProperties[match[1]];
      if (baseProp) {
        // Merge base properties into result
        const merged = { ...prop };
        if (!merged.title) merged.title = baseProp.title;
        if (!merged.description) merged.description = baseProp.description;
        if (!merged.type) merged.type = baseProp.type;
        if (!merged.format) merged.format = baseProp.format;
        if (!merged.required) merged.required = baseProp.required;
        if (!merged.properties && baseProp.properties) merged.properties = baseProp.properties;
        if (baseProp.xUiFirst !== undefined) merged.xUiFirst = baseProp.xUiFirst;
        if (baseProp.xUiAfter) merged.xUiAfter = baseProp.xUiAfter;
        return merged;
      }
    }

    return prop;
  }

  /** Resolve all properties including from allOf $refs. */
  private resolveAllOfProperties(schema: JsonSchemaObject): Record<string, JsonSchemaObject> {
    if (!schema.properties) return {};

    const result: Record<string, JsonSchemaObject> = {};

    for (const [key, prop] of Object.entries(schema.properties)) {
      let resolved = { ...prop };

      // Flatten allOf to extract title, description, type, format, nested properties
      if (prop.allOf) {
        for (const block of prop.allOf) {
          if (block.title) resolved.title = block.title;
          if (block.description) resolved.description = block.description;
          if (block.type) resolved.type = block.type;
          if (block.format) resolved.format = block.format;
          if (block.required) resolved.required = block.required;
          if (block.properties && !resolved.properties) {
            resolved.properties = block.properties;
          } else if (block.properties) {
            if (!resolved.properties) resolved.properties = {};
            for (const [k, v] of Object.entries(block.properties)) {
              if (!(k in resolved.properties!)) {
                resolved.properties![k] = v;
              }
            }
          }
        }
      }

      result[key] = resolved;
    }

    return result;
  }

  /** Map JSON Schema type/format + enum presence → ODS UI type. */
  private mapToUiType(prop: JsonSchemaObject, dropdownUris: string[]): ColumnDefinition['uiType'] {
    if (prop.const !== undefined) return 'readonly';
    if (dropdownUris.length > 0) return 'dropdown';

    const types = Array.isArray(prop.type) ? prop.type : [prop.type];

    if (types.includes('number')) return 'number';
    if (types.includes('boolean')) return 'text'; // booleans as text for now

    if (prop.format === 'date-time') return 'datetime';
    if (prop.format === 'date') return 'date';

    return 'text';
  }

  /** Check if a type represents a leaf value (not an object to recurse into). */
  private isLeafType(types: string[]): boolean {
    const leafTypes = new Set([
      'string',
      'number',
      'integer',
      'boolean',
      'null',
    ]);
    return types.every((t) => leafTypes.has(t));
  }

  /** Remove duplicate columns keeping the one with more complete info. */
  private deduplicate(columns: ColumnDefinition[]): ColumnDefinition[] {
    const seen = new Map<string, ColumnDefinition>();

    for (const col of columns) {
      const existing = seen.get(col.jsonPath);
      if (!existing) {
        seen.set(col.jsonPath, col);
      } else {
        // Keep the one with more defined fields
        const existingCount = Object.values(existing).filter((v) => v !== undefined).length;
        const currentCount = Object.values(col).filter((v) => v !== undefined).length;
        if (currentCount > existingCount) {
          seen.set(col.jsonPath, col);
        }
      }
    }

    return [...seen.values()];
  }
}
