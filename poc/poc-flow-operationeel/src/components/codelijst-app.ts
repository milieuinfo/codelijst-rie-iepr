import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import layoutStyle from '@domg/govflanders-style/common/layout.css.js'
import { schemaObject, type SchemaIndexEntry, type JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser'
import { CodelistService } from '../services/codelist-service.js'
import { loadSchemaSnapshot, type SchemaSnapshot } from '../services/schema-snapshot.js'
import { SchemaEditor } from '../services/schema-editor.js'
import { SchemaLookups } from '../services/schema-lookups.js'
import { uploadOds } from '../services/ods-upload.js'
import { demonstrationProcessGraph } from '../services/demo-process-graph.js'
import { exportTurtle } from '../services/turtle-export.js'
import './schema-rich-table.js'

/**
 * Highlight JSON without changing its text or interpreting it as HTML.
 * @param json - Formatted JSON.
 * @returns Escaped text and highlighted tokens.
 */
function highlightJson(json: string): Array<string | TemplateResult> {
  const parts: Array<string | TemplateResult> = []
  const tokens = /"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g
  let end = 0
  for (const match of json.matchAll(tokens)) {
    const start = match.index
    const value = match[0]
    parts.push(json.slice(end, start))
    const kind = value.startsWith('"')
      ? (/^\s*:/.test(json.slice(start + value.length)) ? 'key' : 'string')
      : /^(true|false|null)$/.test(value) ? 'literal' : 'number'
    parts.push(html`<span class=${`json-${kind}`}>${value}</span>`)
    end = start + value.length
  }
  parts.push(json.slice(end))
  return parts
}

export class CodelijstApp extends LitElement {
  static override styles = [layoutStyle, css`
    :host { display: block; }
    section { margin-block: 2rem; }
    h1 { margin-block: 0 2rem; }
    h2 { margin-block: 0 1rem; }
    vl-form-label { display: block; margin-block: 1.2rem 0.4rem; }
    vl-alert { display: block; margin-block: 1.6rem; }
    p { margin-block: 1.2rem; }
    .output-tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid #cbd2d5; }
    .output-tab {
      padding: 0.8rem 1.4rem; border: 0; border-bottom: 3px solid transparent;
      background: none; color: #333; font: inherit; font-weight: 600; cursor: pointer;
    }
    .output-tab[aria-selected="true"] { border-bottom-color: #0055cc; color: #0055cc; }
    .output-tab:focus-visible { outline: 2px solid #0055cc; outline-offset: -2px; }
    .output-panel { padding-block: 1rem; }
    .output-panel pre {
      max-height: 36rem; overflow: auto; margin-block: 1rem 0; padding: 1.2rem;
      border: 1px solid #d7dce0; background: #f7f9fa; white-space: pre;
    }
    .json-key { color: #174b8a; }
    .json-string { color: #23734c; }
    .json-number { color: #8a4511; }
    .json-literal { color: #743b9b; }
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
  private validatedTurtle?: string
  private outputTab: 'json' | 'turtle' = 'json'
  private turtleUrl?: string
  private turtleError?: string
  private validated = false
  private revision = 0
  private uploading = false
  private uploadError?: string
  private uploadMessage?: string
  private uploadOpen = false
  private personalizedDownload?: { editor: SchemaEditor; url: string }

  override firstUpdated() { void this.load() }

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (this.personalizedDownload) URL.revokeObjectURL(this.personalizedDownload.url)
    if (this.turtleUrl) URL.revokeObjectURL(this.turtleUrl)
    this.personalizedDownload = undefined
    this.turtleUrl = undefined
  }

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
    this.clearOutput()
    this.validated = false
    try { this.prepareEditor() }
    catch (error) { this.error = error instanceof Error ? error.message : String(error) }
    this.requestUpdate()
  }

  private clearOutput() {
    this.validatedJson = undefined
    this.validatedTurtle = undefined
    this.turtleError = undefined
    this.outputTab = 'json'
    if (this.turtleUrl) URL.revokeObjectURL(this.turtleUrl)
    this.turtleUrl = undefined
  }

  private edited(event: Event) {
    event.stopPropagation()
    this.revision++
    this.selectionChanged()
  }

  private validate() {
    this.clearOutput()
    try {
      const result = this.editor?.validate()
      this.validated = true
      this.validatedJson = result && !result.diagnostics.length ? JSON.stringify(result.data, null, 2) : undefined
      if (this.validatedJson && result && this.editor && this.snapshot && this.year) {
        try {
          const now = new Date(Date.now()).toISOString()
          this.validatedTurtle = exportTurtle(this.editor.schema, result.data, {
            year: this.year, created: now, issued: now,
            processes: demonstrationProcessGraph(), dependencies: [...this.snapshot.schemas.values()],
          })
          this.turtleUrl = URL.createObjectURL(new Blob([this.validatedTurtle], { type: 'text/turtle' }))
        } catch (error) {
          this.turtleError = error instanceof Error ? error.message : String(error)
        }
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    this.revision++
    this.requestUpdate()
  }

  private selectOutputTab(tab: 'json' | 'turtle') {
    this.outputTab = tab
    this.requestUpdate()
  }

  private async outputTabKeydown(event: KeyboardEvent) {
    let tab: 'json' | 'turtle'
    if (event.key === 'Home') tab = 'json'
    else if (event.key === 'End') tab = 'turtle'
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') tab = this.outputTab === 'json' ? 'turtle' : 'json'
    else return
    event.preventDefault()
    this.selectOutputTab(tab)
    await this.updateComplete
    this.renderRoot.querySelector<HTMLButtonElement>(`#output-tab-${tab}`)?.focus()
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
      const imported = await uploadOds(new Uint8Array(await file.arrayBuffer()), {
        schema: editor.schema, dependencies: [...snapshot.schemas.values()],
        sourceSha256: snapshot.index.sourceSha256, schemaSha256: entry.sha256,
        year, references: editor.references,
      })
      if (key !== `${this.year}:${this.section}` || editor !== this.editor) {
        throw new Error('De selectie is gewijzigd tijdens de upload. Selecteer het juiste rapporteringsonderdeel en upload opnieuw.')
      }
      if (Object.keys(editor.draft).length &&
          !window.confirm('De ODS vervangt alle huidige invoer voor dit rapporteringsonderdeel en dit productiejaar. Doorgaan?')) return
      this.editors.set(key, imported)
      this.clearOutput()
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
    if (this.personalizedDownload?.editor !== this.editor) {
      if (this.personalizedDownload) URL.revokeObjectURL(this.personalizedDownload.url)
      const blob = new Blob([JSON.stringify(this.editor.personalizedSchema, null, 2) + '\n'], { type: 'application/schema+json' })
      this.personalizedDownload = { editor: this.editor, url: URL.createObjectURL(blob) }
    }
    return html`<div class="downloads" role="group" aria-label="Downloads voor dit rapporteringsonderdeel">
      ${typeof workbook === 'string' ? html`<vl-button secondary icon="file-download"
        cta-link=${resourceUrl(['templates', ...directory, workbook])}
        download=${workbook}>ODS-sjabloon downloaden</vl-button>` : nothing}
      <vl-button secondary icon="file-download"
        cta-link=${resourceUrl(['schema', ...entry.path.split('/')])}
        download=${schemaName}>Generiek JSON-schema downloaden</vl-button>
      <vl-button secondary icon="file-download"
        cta-link=${this.personalizedDownload.url}
        download=${schemaName.replace(/\.schema\.json$/, `.personalized.${this.year}.schema.json`)}
        >Persoonlijk JSON-schema downloaden</vl-button>
    </div>`
  }

  private renderEditor() {
    const editor = this.editor
    if (!editor || !this.lookups) return nothing
    const properties = Object.entries(editor.resolve(editor.inputSchema).properties ?? {})
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
        <p>Upload een ingevuld sjabloon voor dit rapporteringsonderdeel en dit productiejaar. Na controle vervangt het de huidige invoer.</p>
        ${this.uploading ? html`<p role="status">ODS wordt gecontroleerd...</p>` : nothing}
        ${this.uploadMessage ? html`<p role="status">${this.uploadMessage}</p>` : nothing}
        ${this.uploadError ? html`<vl-alert type="error" title="ODS kon niet worden ingelezen"
          message=${this.uploadError}></vl-alert>` : nothing}
      </div>
      <vl-alert type="info" title="Fictieve structurele referenties"
        message="De keuzelijsten, procesverbindingen en indieningstijd bevatten fictieve demonstratiegegevens. Er is geen backend of permanente opslag."></vl-alert>
      ${context.length ? html`<section aria-label="Rapporteringscontext">
        <h2>Rapporteringscontext</h2>
        <schema-rich-table .editor=${editor}
          .node=${{ ...editor.inputSchema, properties: Object.fromEntries(context) }}
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
      ${this.turtleError ? html`<vl-alert type="error" title="Turtle kon niet worden gemaakt" message=${this.turtleError}></vl-alert>` : nothing}
      ${this.validatedJson !== undefined ? html`<section>
        <h2>Gevalideerde uitvoer</h2>
        <div class="output-tabs" role="tablist" aria-label="Uitvoerformaat" @keydown=${this.outputTabKeydown}>
          <button type="button" class="output-tab" id="output-tab-json" role="tab"
            aria-selected=${this.outputTab === 'json'} aria-controls="output-panel-json"
            tabindex=${this.outputTab === 'json' ? 0 : -1} @click=${() => this.selectOutputTab('json')}>JSON</button>
          <button type="button" class="output-tab" id="output-tab-turtle" role="tab"
            aria-selected=${this.outputTab === 'turtle'} aria-controls="output-panel-turtle"
            tabindex=${this.outputTab === 'turtle' ? 0 : -1} @click=${() => this.selectOutputTab('turtle')}>Turtle</button>
        </div>
        <div class="output-panel" id="output-panel-json" role="tabpanel" aria-labelledby="output-tab-json"
          tabindex="0" ?hidden=${this.outputTab !== 'json'}><pre id="validated-json">${highlightJson(this.validatedJson)}</pre></div>
        <div class="output-panel" id="output-panel-turtle" role="tabpanel" aria-labelledby="output-tab-turtle"
          tabindex="0" ?hidden=${this.outputTab !== 'turtle'}>
          ${this.validatedTurtle !== undefined ? html`
            <vl-button secondary icon="file-download" cta-link=${this.turtleUrl} download="rapport.ttl">Turtle downloaden</vl-button>
            <pre id="validated-turtle">${this.validatedTurtle}</pre>` : html`<p>Turtle is niet beschikbaar.</p>`}
        </div>
      </section>` : nothing}
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
            message="${report.blockedSections.length} rapporteringsonderdelen zijn geblokkeerd door ontbrekende bronmetadata. Alleen geldige rapporteringsonderdelen zijn bewerkbaar."></vl-alert>` : nothing}
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
              <vl-form-label for="doorsnede" label="Rapporteringsonderdeel" block></vl-form-label>
              <vl-select id="doorsnede" label="Rapporteringsonderdeel" .options=${this.entries.map(entry => ({
                value: entry.id, label: this.snapshot!.schemas.get(entry.id)?.title || entry.path, selected: entry.id === this.section,
              }))} .value=${this.section} @vl-input=${(event: CustomEvent<{ value: string }>) => {
                this.section = event.detail.value
                this.selectionChanged()
              }}></vl-select>` : this.theme ? html`<p>Voor dit thema zijn nog geen geldige rapportageschema's beschikbaar.</p>` : nothing}
            ${blocked.length ? html`<details><summary>Geblokkeerde rapporteringsonderdelen (${blocked.length})</summary>
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
