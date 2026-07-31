/**
 * Minimal TypeScript declarations for @domg-wc/components vl-* web components.
 * These interfaces are intentionally narrow — they only cover properties and events
 * actually consumed by the codelist POC, not the full component API surface.
 */
declare global {
  interface VlSelectElement extends HTMLElement {
    value: string
    options?: Array<{ value: string; label: string; selected?: boolean }>
    placeholder?: string
  }

  interface VlInputFieldElement extends HTMLElement {
    value: string | null
    type: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url'
    name?: string
    required?: boolean
    pattern?: string
    placeholder?: string
  }

  interface VlCheckboxElement extends HTMLElement {
    checked: boolean
    value: string
    name?: string
    required?: boolean
  }

  interface VlDatepickerElement extends HTMLElement {
    value: string | null
    type?: 'range' | 'date' | 'datetime' | ''
    name?: string
    required?: boolean
    placeholder?: string
  }

  interface VlSelectRichElement extends HTMLElement {
    value: string | string[]
    options?: Array<{ value: string; label: string; selected?: boolean }>
    placeholder?: string
  }

  interface VlInputElementEventDetail {
    value?: unknown
  }

  interface VlChangeEventDetail {
    checked?: boolean
    value?: unknown
  }
}

export {}
