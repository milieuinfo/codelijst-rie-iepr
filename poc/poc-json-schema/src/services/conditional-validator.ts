import type { JsonSchemaObject, SchemaField } from '../models/index.js'

export interface ConditionBlock {
  triggerProperty: string
  triggerValue: string
  conditionedProperty: string
}

export class ConditionalValidatorGenerator {
  collectConditions(fields: SchemaField[]): ConditionBlock[] {
    const conditions: ConditionBlock[] = []
    for (const field of fields) {
      if (field.condition) {
        conditions.push({
          triggerProperty: field.condition.path,
          triggerValue: field.condition.value,
          conditionedProperty: field.propertyName,
        })
      }
      // Recurse into children
      if (field.children) {
        for (const child of field.children) {
          if (child.condition) {
            conditions.push({
              triggerProperty: child.condition.path,
              triggerValue: child.condition.value,
              conditionedProperty: child.propertyName,
            })
          }
        }
      }
    }
    return conditions
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
