import { LitElement, html, css, nothing } from 'lit'
import layoutStyle from '@domg/govflanders-style/common/layout.css.js'
import { schemaObject, type SchemaIndexEntry, type JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { CodelistService } from '../services/codelist-service.js'
import { loadSchemaSnapshot, type SchemaSnapshot } from '../services/schema-snapshot.js'
import { SchemaEditor } from '../services/schema-editor.js'
import { SchemaLookups } from '../services/schema-lookups.js'
import './schema-rich-table.js'

export class CodelijstApp extends LitElement {
  static override styles = [layoutStyle, css`
    :host { display: block; }
    section { margin-block: 2rem; }
    h1 { margin-block: 0 2rem; }
    h2 { margin-block: 0 1rem; }
    vl-form-label { display: block; margin-block: 1.2rem 0.4rem; }
    vl-alert { display: block; margin-block: 1.6rem; }
    p { margin-block: 1.2rem; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    .downloads { display: flex; flex-wrap: wrap; gap: 1.2rem; margin-block: 1.6rem; }
    .ods-import { margin-block: 1.6rem; }
    .ods-import label { display: block; margin-block-end: 0.8rem; font-weight: bold; }
    .ods-import input { max-width: 100%; font: inherit; }
  `]
  private snapshot?: SchemaSnapshot
  private lookups?: SchemaLookups
  private error?: string
  private year?: number
  private theme = ''
  private section = ''
  private editors = new Map<string, SchemaEditor>()
  private validatedJson?: string
  private validated = false
  private revision = 0
  private uploading = false
  private uploadError?: string
  private uploadMessage?: string
  private uploadOpen = false

  override firstUpdated() { void this.load() }

  private async load() {
    try {
      const base = new URL('./', document.baseURI)
      const [snapshot, codelist] = await Promise.all([loadSchemaSnapshot(base), new CodelistService().loadCodelist()])
      this.snapshot = snapshot
      this.lookups = new SchemaLookups(codelist)
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    this.requestUpdate()
  }

  private get entries(): SchemaIndexEntry[] {
    return this.snapshot?.index.files.filter(entry => entry.kind === 'section' && entry.themeConceptId === this.theme) ?? []
  }

  get editor(): SchemaEditor | undefined {
    return this.editors.get(`${this.year}:${this.section}`)
  }

  private prepareEditor(): void {
    if (!this.year || !this.section || !this.snapshot || !this.lookups) return
    const key = `${this.year}:${this.section}`
    if (!this.editors.has(key)) {
      const schema = this.snapshot.schemas.get(this.section)
      if (!schema) throw new Error('Geselecteerd schema ontbreekt in de snapshot.')
      const dependencies = [...this.snapshot.schemas.values()]
      const editor = new SchemaEditor(schema, dependencies, this.lookups.references(schema, dependencies, this.year), { year: this.year })
      this.editors.set(key, editor)
    }
  }

  private selectionChanged() {
    this.uploadError = undefined
    this.uploadMessage = undefined
    this.validatedJson = undefined
    this.validated = false
    try { this.prepareEditor() }
    catch (error) { this.error = error instanceof Error ? error.message : String(error) }
    this.requestUpdate()
  }

  private edited(event: Event) {
    event.stopPropagation()
    this.revision++
    this.selectionChanged()
  }

  private validate() {
    try {
      const result = this.editor?.validate()
      this.validated = true
      this.validatedJson = result && !result.diagnostics.length ? JSON.stringify(result.data, null, 2) : undefined
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    this.revision++
    this.requestUpdate()
  }

  private async uploadOds(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    const editor = this.editor
    const entry = this.entries.find(entry => entry.id === this.section)
    const snapshot = this.snapshot
    const year = this.year
    if (!file || !editor || !entry || !snapshot || !year || this.uploading) return
    const key = `${year}:${this.section}`
    this.uploading = true
    this.uploadError = undefined
    this.uploadMessage = undefined
    this.requestUpdate()
    try {
      if (!file.name.toLowerCase().endsWith('.ods')) throw new Error('Selecteer een ODS-bestand.')
      if (file.size > 20 * 1024 * 1024) throw new Error('Het ODS-bestand mag maximaal 20 MB groot zijn.')
      const { uploadOds } = await import('../services/ods-upload.js')
      const imported = await uploadOds(new Uint8Array(await file.arrayBuffer()), {
        schema: editor.schema, dependencies: [...snapshot.schemas.values()],
        sourceSha256: snapshot.index.sourceSha256, schemaSha256: entry.sha256,
        year, references: editor.references,
      })
      if (key !== `${this.year}:${this.section}` || editor !== this.editor) {
        throw new Error('De selectie is gewijzigd tijdens de upload. Selecteer de juiste doorsnede en upload opnieuw.')
      }
      if (Object.keys(editor.draft).length &&
          !window.confirm('De ODS vervangt alle huidige invoer voor deze doorsnede en dit productiejaar. Doorgaan?')) return
      this.editors.set(key, imported)
      this.validatedJson = undefined
      this.validated = false
      this.revision++
      this.uploadMessage = `${file.name} is ingelezen. De gegevens staan in het formulier.`
    } catch (error) {
      this.uploadError = error instanceof Error ? error.message : String(error)
    } finally {
      this.uploading = false
      this.requestUpdate()
    }
  }

  private fieldLabel = (value: unknown): string =>
    this.editor?.references.find(reference => reference.id === value)?.label ?? this.lookups?.label(value) ?? String(value)

  private isTable(node: JsonSchemaObject): boolean {
    const schema = this.editor!.resolve(node)
    if (schema.type !== 'array') return false
    const item = this.editor!.resolve(schemaObject(schema.items))
    return !item.enum && !item['x-reference-types']
  }

  private renderDownloads() {
    const entry = this.entries.find(entry => entry.id === this.section)
    if (!entry || !this.editor) return nothing
    const workbook = this.editor.schema['x-table-workbook']
    const directory = entry.path.split('/').slice(0, -1)
    const resourceUrl = (parts: string[]) =>
      new URL(parts.map(encodeURIComponent).join('/'), document.baseURI).href
    const schemaName = typeof workbook === 'string'
      ? workbook.replace(/\.ods$/, '.schema.json') : `${directory.at(-1)}.schema.json`
    return html`<div class="downloads" role="group" aria-label="Downloads voor deze doorsnede">
      ${typeof workbook === 'string' ? html`<vl-button secondary icon="file-download"
        cta-link=${resourceUrl(['templates', ...directory, workbook])}
        download=${workbook}>ODS-sjabloon downloaden</vl-button>` : nothing}
      <vl-button secondary icon="file-download"
        cta-link=${resourceUrl(['schema', ...entry.path.split('/')])}
        download=${schemaName}>JSON-schema downloaden</vl-button>
    </div>`
  }

  private renderEditor() {
    const editor = this.editor
    if (!editor || !this.lookups) return nothing
    const properties = Object.entries(editor.resolve(editor.schema).properties ?? {})
    const context = properties.filter(([, node]) => !this.isTable(schemaObject(node)))
    return html`
      ${this.renderDownloads()}
      <vl-button secondary type="button" aria-expanded=${this.uploadOpen}
        aria-controls="ods-import-form" ?disabled=${this.uploading}
        @click=${() => {
          this.uploadOpen = !this.uploadOpen
          this.requestUpdate()
        }}>Ingevulde ODS importeren</vl-button>
      <div id="ods-import-form" class="ods-import" role="group" aria-label="ODS importeren"
        aria-busy=${this.uploading} ?hidden=${!this.uploadOpen}>
        <label for="ods-upload">Ingevulde ODS uploaden</label>
        <input id="ods-upload" type="file" accept=".ods,application/vnd.oasis.opendocument.spreadsheet"
          ?disabled=${this.uploading} @change=${this.uploadOds}>
        <p>Upload een ingevuld sjabloon voor deze doorsnede en dit productiejaar. Na controle vervangt het de huidige invoer.</p>
        ${this.uploading ? html`<p role="status">ODS wordt gecontroleerd...</p>` : nothing}
        ${this.uploadMessage ? html`<p role="status">${this.uploadMessage}</p>` : nothing}
        ${this.uploadError ? html`<vl-alert type="error" title="ODS kon niet worden ingelezen"
          message=${this.uploadError}></vl-alert>` : nothing}
      </div>
      <vl-alert type="info" title="Fictieve structurele referenties"
        message="De keuzelijsten van installaties en meetpunten bevatten demonstratiegegevens. Er is geen backend of permanente opslag."></vl-alert>
      ${context.length ? html`<section aria-label="Rapporteringscontext">
        <h2>Rapporteringscontext</h2>
        <schema-rich-table .editor=${editor}
          .node=${{ ...editor.schema, properties: Object.fromEntries(context) }}
          .revision=${this.revision} .label=${this.fieldLabel} @schema-edit=${this.edited}></schema-rich-table>
      </section>` : nothing}
      ${properties.filter(([, node]) => this.isTable(schemaObject(node))).map(([name, node]) => html`
        <section>
          <h2>${schemaObject(node).title || name}</h2>
          <schema-rich-table .editor=${editor} .node=${schemaObject(node)} .path=${[name]}
            .revision=${this.revision} .label=${this.fieldLabel} @schema-edit=${this.edited}></schema-rich-table>
        </section>`)}
      <p>Grijze velden zijn niet van toepassing. Hun conceptwaarden blijven bewaard, maar komen niet in de gevalideerde JSON.</p>
      <vl-button @click=${this.validate}>Valideren en JSON tonen</vl-button>
      ${this.validated && editor.diagnostics.length ? html`<vl-alert type="error" title="Gegevens zijn niet geldig"></vl-alert>
        <ul aria-label="Validatiefouten">${editor.diagnostics.map(error => html`<li>${error.instancePath || '/'}: ${error.message}</li>`)}</ul>` : nothing}
      ${this.validatedJson !== undefined ? html`<section><h2>Gevalideerde JSON</h2><pre id="validated-json">${this.validatedJson}</pre></section>` : nothing}
    `
  }

  override render() {
    const report = this.snapshot?.index.generation
    const themes = new Map<string, string>()
    for (const entry of this.snapshot?.index.files ?? []) {
      if (entry.kind === 'section' && entry.themeConceptId) {
        const label = this.snapshot?.schemas.get(entry.id)?.['x-theme-label']
        themes.set(entry.themeConceptId, typeof label === 'string' ? label : this.lookups?.label(entry.themeConceptId) || entry.theme!)
      }
    }
    for (const blocked of report?.blockedSections ?? []) themes.set(blocked.themeConceptId, blocked.theme)
    const blocked = report?.blockedSections.filter(section => section.themeConceptId === this.theme) ?? []
    const years = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 5 + index)
    return html`<div class="vl-page" @schema-error=${(event: CustomEvent<string>) => {
      event.stopPropagation()
      this.error = event.detail
      this.requestUpdate()
    }}><main class="vl-main-content"><div class="vl-region"><div class="vl-layout">
      <h1>RIE-IEPR Codelijst POC</h1>
      ${this.error ? html`<vl-alert type="error" title="Schemaformulier niet beschikbaar" message=${this.error}></vl-alert>`
        : !this.snapshot ? html`<p>Schema's laden...</p>` : html`
          ${report && !report.complete ? html`<vl-alert type="warning" title="Onvolledige schemasnapshot"
            message="${report.blockedSections.length} doorsneden zijn geblokkeerd door ontbrekende bronmetadata. Alleen geldige doorsneden zijn bewerkbaar."></vl-alert>` : nothing}
          <vl-form-label for="productie-jaar" label="Productiejaar" block></vl-form-label>
          <vl-select id="productie-jaar" label="Productiejaar" placeholder="Selecteer een productiejaar"
            .options=${years.map(year => ({ value: String(year), label: String(year), selected: year === this.year }))}
            .value=${this.year ? String(this.year) : ''}
            @vl-input=${(event: CustomEvent<{ value: string }>) => {
              this.year = event.detail.value ? Number(event.detail.value) : undefined
              this.selectionChanged()
            }}></vl-select>
          ${this.year ? html`
            <vl-form-label for="thema" label="Thema" block></vl-form-label>
            <vl-select id="thema" label="Thema" placeholder="Selecteer een thema"
              .options=${[...themes].map(([value, label]) => ({ value, label, selected: value === this.theme }))} .value=${this.theme}
              @vl-input=${(event: CustomEvent<{ value: string }>) => {
                this.theme = event.detail.value
                this.section = this.entries[0]?.id ?? ''
                this.selectionChanged()
              }}></vl-select>
            ${this.entries.length ? html`
              <vl-form-label for="doorsnede" label="Doorsnede" block></vl-form-label>
              <vl-select id="doorsnede" label="Doorsnede" .options=${this.entries.map(entry => ({
                value: entry.id, label: this.snapshot!.schemas.get(entry.id)?.title || entry.path, selected: entry.id === this.section,
              }))} .value=${this.section} @vl-input=${(event: CustomEvent<{ value: string }>) => {
                this.section = event.detail.value
                this.selectionChanged()
              }}></vl-select>` : this.theme ? html`<p>Voor dit thema zijn nog geen geldige rapportageschema's beschikbaar.</p>` : nothing}
            ${blocked.length ? html`<details><summary>Geblokkeerde doorsneden (${blocked.length})</summary>
              <ul>${blocked.map(section => html`<li>${section.sectionLabel}
                <ul>${section.issues.map(issue => html`<li>${issue.message}</li>`)}</ul></li>`)}</ul></details>` : nothing}
            ${this.renderEditor()}
          ` : nothing}
        `}
    </div></div></main></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap { 'codelijst-app': CodelijstApp }
}
customElements.define('codelijst-app', CodelijstApp)
