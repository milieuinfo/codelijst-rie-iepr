import type { JsonSchemaObject, SchemaField } from '../models/index.js'

export interface ConditionBlock {
  triggerProperty: string
  triggerValue: string
  conditionedProperty: string
}

export class ConditionalValidatorGenerator {
  collectConditions(fields: SchemaField[]): ConditionBlock[] {
    const conditions: ConditionBlock[] = []
    this.walkFields(fields, conditions)
    return conditions
  }

  private walkFields(fields: SchemaField[], conditions: ConditionBlock[]): void {
    for (const field of fields) {
      if (field.condition?.values) {
        for (const value of field.condition.values) {
          conditions.push({
            triggerProperty: field.condition.path,
            triggerValue: value,
            conditionedProperty: field.propertyName,
          })
        }
      }
      // Recurse into ALL nested children levels
      if (field.children) {
        this.walkFields(field.children, conditions)
      }
    }
  }

  generateIfThen(condition: ConditionBlock): JsonSchemaObject {
    return {
      if: {
        properties: {
          [condition.triggerProperty]: { const: condition.triggerValue },
        },
      },
      then: {
        properties: {
          [condition.conditionedProperty]: {},
        },
      },
    }
  }

  generateAllConditionals(conditions: ConditionBlock[]): JsonSchemaObject | null {
    if (conditions.length === 0) return null

    const allOfEntries: JsonSchemaObject[] = []
    for (const cond of conditions) {
      allOfEntries.push(this.generateIfThen(cond))
    }

    return { allOf: allOfEntries }
  }
}
