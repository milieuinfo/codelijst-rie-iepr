import { LitElement, html, css, render, nothing, type TemplateResult } from 'lit'
import { VlRichDataTable } from '@domg-wc/components/block/rich-data-table/vl-rich-data-table.component.js'
import { VlRichDataField } from '@domg-wc/components/block/rich-data-table/vl-rich-data-field.component.js'
import { schemaObject, type JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { SchemaEditor, jsonPointer, type DataPath, type EditorColumn } from '../services/schema-editor.js'

interface Row { path: DataPath; value: unknown }
interface Cell { td: HTMLTableCellElement; row: Row; column?: EditorColumn; unit?: EditorColumn; expand?: boolean }

export class SchemaRichTable extends LitElement {
  static override properties = {
    editor: { attribute: false }, node: { attribute: false }, path: { attribute: false },
    revision: { type: Number }, label: { attribute: false }, disabled: { type: Boolean },
  }
  static override styles = css`
    :host { display: block; }
    .table { overflow-x: auto; margin-block: 0.8rem; }
  `
  editor!: SchemaEditor
  node!: JsonSchemaObject
  path: DataPath = []
  revision = 0
  disabled = false
  label: (value: unknown) => string = String
  private table?: VlRichDataTable
  private cells: Cell[] = []
  private detailColumns: EditorColumn[] = []
  private expanded = new Set<unknown>()
  private details = new Map<HTMLTableRowElement, HTMLTableCellElement>()
  private detailsScheduled = false
  private currentEditor?: SchemaEditor
  private lastDiagnostics?: SchemaEditor['diagnostics']
  private signature = ''
  private rowValues: unknown[] = []
  private failed = false

  override render() {
    if (!this.node || !this.editor) return nothing
    try {
      const schema = this.editor.resolve(this.node)
      const active = !this.disabled && this.editor.isActive(this.path)
      return html`
        <div class="table" id="table"></div>
        ${schema.type === 'array' ? html`<vl-button secondary ?disabled=${!active}
          @click=${() => this.change(() => this.editor.add(this.path, schema))}>Rij toevoegen</vl-button>` : nothing}
      `
    } catch (error) {
      this.reportError(error)
      return nothing
    }
  }

  override updated() {
    if (this.failed) return
    try { this.updateTable() }
    catch (error) { this.reportError(error) }
  }

  private updateTable() {
    if (!this.node || !this.editor) return
    const schema = this.editor.resolve(this.node)
    const signature = JSON.stringify([this.editor.schema.$id, jsonPointer(this.path), schema])
    const raw = this.editor.get(this.path)
    const values = schema.type === 'array' ? (Array.isArray(raw) ? raw : []) : [raw]
    const changedRows = values.length !== this.rowValues.length ||
      values.some((value, index) => value !== null && typeof value === 'object' && value !== this.rowValues[index])
    if (!this.table || signature !== this.signature || this.currentEditor !== this.editor) {
      this.currentEditor = this.editor
      this.expanded.clear()
      this.details.clear()
      this.signature = signature
      this.cells = []
      const table = new VlRichDataTable()
      table.setAttribute('label', schema.title || 'Operationele gegevens')
      table.style.width = '100%'
      const rowSchema = schema.type === 'array' ? schemaObject(schema.items) : schema
      const columns = this.editor.columns(rowSchema)
      const units = new Map<EditorColumn, EditorColumn>()
      for (const unit of columns.filter(column => ['hasUnit', 'unitCode'].includes(column.path.at(-1) ?? ''))) {
        const value = columns.find(column =>
          ['numericValue', 'value'].includes(column.path.at(-1) ?? '') &&
          ['number', 'integer'].includes(column.schema.type ?? '') &&
          jsonPointer(column.path.slice(0, -1)) === jsonPointer(unit.path.slice(0, -1)))
        if (value) units.set(value, unit)
      }
      this.detailColumns = columns.filter(column => this.isNestedTable(column.schema))
      if (this.detailColumns.length) {
        const field = new VlRichDataField()
        field.setAttribute('label', 'Details')
        field.renderer = (td: HTMLTableCellElement, row: Row) => {
          const cell: Cell = { td, row, expand: true }
          this.cells.push(cell)
          this.renderCell(cell)
          // Flux can rebuild its body independently when its fields change.
          this.scheduleDetails()
        }
        table.append(field)
      }
      for (const column of columns.filter(column =>
        !this.detailColumns.includes(column) && ![...units.values()].includes(column))) {
        const field = new VlRichDataField()
        field.setAttribute('name', jsonPointer(column.path))
        // Flux interprets label as HTML; use an actual text node in its label template.
        const template = document.createElement('template')
        template.slot = 'label'
        template.content.append(document.createTextNode(column.title + (column.required && column.schema.const === undefined ? ' *' : '')))
        field.append(template)
        field.renderer = (td: HTMLTableCellElement, row: Row) => {
          const cell = { td, row, column, unit: units.get(column) }
          this.cells.push(cell)
          this.renderCell(cell)
        }
        table.append(field)
      }
      if (schema.type === 'array') {
        const field = new VlRichDataField()
        const template = document.createElement('template')
        template.slot = 'label'
        const label = document.createElement('span')
        label.textContent = 'Acties'
        label.style.cssText = 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;'
        template.content.append(label)
        field.append(template)
        field.renderer = (td: HTMLTableCellElement, row: Row) => {
          const cell = { td, row }
          this.cells.push(cell)
          this.renderCell(cell)
        }
        table.append(field)
      }
      this.renderRoot.querySelector('#table')!.replaceChildren(table)
      this.table = table
      this.rowValues = [...values]
      table.data = { data: values.map((value, index) => ({ value, path: schema.type === 'array' ? [...this.path, index] : this.path })) }
    } else if (changedRows) {
      this.cells = []
      this.rowValues = [...values]
      this.expanded = new Set([...this.expanded].filter(value => values.includes(value)))
      this.table.data = { data: values.map((value, index) => ({ value, path: schema.type === 'array' ? [...this.path, index] : this.path })) }
    } else {
      this.cells = this.cells.filter(cell => cell.td.isConnected)
      for (const cell of this.cells) this.renderCell(cell)
    }
    this.updateDetails()
  }

  private isNestedTable(schema: JsonSchemaObject): boolean {
    if (schema.type !== 'array') return false
    const item = this.editor.resolve(schemaObject(schema.items))
    return !item.enum && item['x-reference-types'] === undefined && item.type !== 'boolean'
  }

  private scheduleDetails() {
    if (this.detailsScheduled) return
    this.detailsScheduled = true
    queueMicrotask(() => {
      this.detailsScheduled = false
      if (!this.isConnected || this.failed) return
      try { this.updateDetails() }
      catch (error) { this.reportError(error) }
    })
  }

  private detailId(row: Row): string {
    return 'details-' + encodeURIComponent(jsonPointer(row.path))
  }

  private updateDetails() {
    const newDiagnostics = this.lastDiagnostics !== this.editor.diagnostics
    this.lastDiagnostics = this.editor.diagnostics
    this.cells = this.cells.filter(cell => cell.td.isConnected)
    for (const [row] of this.details) if (!row.isConnected) this.details.delete(row)
    for (const cell of this.cells.filter(cell => cell.expand)) {
      const { row, td } = cell
      const parent = td.parentElement
      if (!(parent instanceof HTMLTableRowElement)) continue
      const paths = this.detailColumns.map(column => jsonPointer([...row.path, ...column.path]))
      if (newDiagnostics && this.editor.diagnostics.some(error => paths.some(path =>
        error.instancePath === path || error.instancePath.startsWith(path + '/')))) this.expanded.add(row.value)
      const open = this.expanded.has(row.value)
      this.renderCell(cell)
      let detail = this.details.get(parent)
      if (!detail && !open) continue
      if (!detail) {
        const tr = document.createElement('tr')
        tr.setAttribute('data-row-details', jsonPointer(row.path))
        detail = tr.insertCell()
        detail.id = this.detailId(row)
        detail.colSpan = parent.cells.length
        detail.style.padding = '1.2rem 0.8rem'
        detail.style.maxWidth = '0'
        parent.after(tr)
        this.details.set(parent, detail)
      }
      detail.parentElement!.hidden = !open
      render(html`${this.detailColumns.map(column => {
        const path = [...row.path, ...column.path]
        return html`<section aria-label=${column.title} style="margin-block: 0.8rem 1.6rem;">
          <h3 style="margin: 0 0 0.8rem;">${column.title}${column.required ? ' *' : ''}</h3>
          <schema-rich-table .editor=${this.editor} .node=${column.schema} .path=${path}
            .revision=${this.revision} .label=${this.label}
            .disabled=${this.disabled || !this.editor.isActive(path)}></schema-rich-table>
        </section>`
      })}`, detail)
    }
  }

  private change(action: () => void) {
    try {
      action()
      this.dispatchEvent(new CustomEvent('schema-edit', { bubbles: true, composed: true }))
    } catch (error) { this.reportError(error) }
  }

  private reportError(error: unknown) {
    if (this.failed) return
    this.failed = true
    this.dispatchEvent(new CustomEvent('schema-error', {
      bubbles: true, composed: true, detail: error instanceof Error ? error.message : String(error),
    }))
  }

  private renderCell({ td, row, column, unit, expand }: Cell) {
    const path = [...row.path, ...(column?.path ?? [])]
    const active = !this.disabled && this.editor.isActive(path)
    td.setAttribute('aria-disabled', String(!active))
    td.style.backgroundColor = active ? '' : 'var(--vl-color--grey-100, #eee)'
    td.style.padding = '0.6rem 0.8rem'
    td.style.verticalAlign = 'top'
    if (expand) {
      td.setAttribute('data-row-expand', jsonPointer(row.path))
      td.style.width = '1%'
      const open = this.expanded.has(row.value)
      const label = open ? 'Details inklappen' : 'Details uitklappen'
      render(html`<vl-button tertiary icon=${open ? 'arrow-down' : 'arrow-right'} label=${label} title=${label}
        aria-expanded=${String(open)} aria-controls=${this.detailId(row)}
        @click=${() => {
          if (open) this.expanded.delete(row.value)
          else this.expanded.add(row.value)
          this.updateDetails()
        }}></vl-button>`, td)
      return
    }
    if (!column) {
      td.setAttribute('data-row-actions', jsonPointer(row.path))
      td.style.width = '1%'
      td.style.whiteSpace = 'nowrap'
      render(html`<vl-button tertiary icon="bin" label="Rij verwijderen" title="Rij verwijderen"
        ?disabled=${!active}
        @click=${() => this.change(() => this.editor.remove(this.path, Number(row.path.at(-1))))}></vl-button>`, td)
      return
    }
    td.setAttribute('title', active ? column.schema.description || column.title
      : 'Niet van toepassing bij de huidige selectie. De conceptwaarde blijft bewaard.')
    td.setAttribute('data-instance-path', jsonPointer(path))
    render(unit ? html`<div style="display: flex; align-items: flex-start; gap: 0.8rem;">
      <div>${this.renderControl(row, column)}</div>
      <div data-instance-path=${jsonPointer([...row.path, ...unit.path])}
        style="flex-shrink: 0; min-height: 3.5rem; display: flex; align-items: center;">
        ${this.renderControl(row, unit)}
      </div>
    </div>` : this.renderControl(row, column), td)
  }

  private renderControl(row: Row, column: EditorColumn): TemplateResult {
    const path = [...row.path, ...column.path]
    const active = !this.disabled && this.editor.isActive(path)
    const schema = column.schema
    const item = schema.type === 'array' ? this.editor.resolve(schemaObject(schema.items)) : schema
    const references = item['x-reference-types']
    if (references !== undefined && (!Array.isArray(references) || !references.every(type => typeof type === 'string'))) {
      throw new Error('Ongeldige referentietypes in schema.')
    }
    const available: unknown[] | undefined = item.enum ?? (Array.isArray(item['x-reference-options']) ? [] : Array.isArray(references)
      ? this.editor.references.filter(reference => reference.types.some(type => references.includes(type))).map(reference => reference.id)
      : item.type === 'boolean' ? [true, false] : undefined)
    const choices = available && this.editor.referenceChoices(path, available)
    const value = this.editor.get(path)
    const controlId = 'field-' + encodeURIComponent(jsonPointer(path))
    const error = this.editor.diagnostics.find(error => error.instancePath === jsonPointer(path))
    const onInput = (event: CustomEvent<{ value?: unknown }>) => {
      if (!active) return
      const raw = event.detail.value
      let parsed: unknown = raw === '' ? undefined : raw
      if (choices) {
        if (Array.isArray(raw)) parsed = raw.map(key => choices[Number(key)])
        else parsed = raw === '' || raw === undefined ? undefined : choices[Number(raw)]
      } else if ((schema.type === 'number' || schema.type === 'integer') && typeof raw === 'string' && raw.trim() !== '') {
        const numeric = Number(raw)
        if (Number.isFinite(numeric)) parsed = numeric
      } else if (schema.format === 'date-time' && typeof raw === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
        // Flux emits local wall time; JSON Schema requires seconds and a timezone.
        const date = new Date(raw)
        if (Number.isFinite(date.getTime())) parsed = date.toISOString()
      }
      if (Object.is(value, parsed) || (Array.isArray(value) && Array.isArray(parsed) &&
          value.length === parsed.length && value.every((item, index) => Object.is(item, parsed[index])))) return
      this.change(() => this.editor.set(path, parsed))
    }
    let control: TemplateResult
    if (schema.const !== undefined || schema.readOnly) {
      control = html`<span aria-label=${column.title}>${this.label(value === undefined ? schema.const ?? '' : value)}</span>`
    } else if (choices) {
      const options = choices.map((choice, index) => ({
        value: String(index), label: typeof choice === 'boolean' ? choice ? 'Ja' : 'Nee' : this.label(choice),
        selected: schema.type === 'array' ? Array.isArray(value) && value.includes(choice) : Object.is(value, choice),
      }))
      const selected = (choice: unknown) => String(choices.findIndex(candidate => Object.is(candidate, choice)))
      if (schema.type === 'array') {
        control = html`<vl-select-rich id=${controlId} label=${column.title} multiple
          .options=${options} ?disabled=${!active} ?required=${column.required && active}
          ?error=${!!error} @vl-input=${onInput}></vl-select-rich>`
      } else {
        control = html`<vl-select id=${controlId} label=${column.title} placeholder="Maak een keuze"
          .options=${options} .value=${value === undefined ? '' : selected(value)}
          ?disabled=${!active} ?required=${column.required && active} ?error=${!!error}
          @vl-input=${onInput}></vl-select>`
      }
    } else if (schema.format === 'date-time' || schema.format === 'date') {
      control = html`<vl-datepicker id=${controlId} label=${column.title}
        type=${schema.format === 'date-time' ? 'date-time' : 'date'} block
        style=${`display: block; min-width: ${schema.format === 'date-time' ? '22rem' : '16rem'};`}
        .value=${value === undefined ? '' : String(value)} ?disabled=${!active}
        ?required=${column.required && active} ?error=${!!error} @vl-input=${onInput}></vl-datepicker>`
    } else {
      control = html`<vl-input-field id=${controlId} label=${column.title}
        type=${schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'}
        .value=${value === undefined ? '' : String(value)} ?disabled=${!active}
        ?required=${column.required && active}
        min=${schema.minimum ?? nothing} max=${schema.maximum ?? nothing}
        step=${schema.type === 'integer' ? '1' : 'any'}
        placeholder=${schema.format === 'date-time' ? '2026-01-01T10:00:00+01:00' : schema.format === 'duration' ? 'PT1H' : schema.format === 'date' ? 'YYYY-MM-DD' : ''}
        ?error=${!!error} @vl-input=${onInput}></vl-input-field>`
    }
    return html`${control}${error ? html`<span role="alert">${error.message}</span>` : nothing}`
  }
}

customElements.define('schema-rich-table', SchemaRichTable)
