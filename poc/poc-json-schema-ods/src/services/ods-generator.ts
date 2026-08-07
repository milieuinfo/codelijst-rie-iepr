import JSZip from 'jszip';
import type { ColumnDefinition } from '../models/index.js';

export interface SheetConfig {
  /** Sheet tab name */
  sheetName: string;
  /** Columns for this sheet */
  columns: ColumnDefinition[];
}

export interface ODSOptions {
  /** Document title for metadata */
  documentTitle: string;
  /** One or more sheets to include */
  sheets: SheetConfig[];
}

/**
 * Generates an OpenDocument Spreadsheet (.ods) file.
 *
 * Produces per-sheet:
 *   Row 1 (hidden): JSON-LD path references
 *   Row 2 (header): Dutch labels, ▾ for dropdown columns
 *   Row 3+: Empty data rows with content validations for dropdowns
 */
export class ODSGenerator {
  async generate(options: ODSOptions): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });

    const contentXml = this.buildContentXml(options);

    zip.file('content.xml', contentXml);
    zip.file('styles.xml', this.STYLES_XML);
    zip.file('meta.xml', this.buildMetaXml(options.documentTitle));
    zip.file('META-INF/manifest.xml', this.MANIFEST_XML);

    return (await zip.generateAsync({ type: 'arraybuffer' })) as unknown as ArrayBuffer;
  }

  private buildContentXml(options: ODSOptions): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" office:version="1.3">\n';
    xml += '<office:scripts/><office:font-face-decls><style:font-face style:name="FreeSans" svg:font-family="FreeSans" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"/></office:font-face-decls>\n';

    // Automatic styles
    xml += '<office:automatic-styles>';
    xml += this.STYLES_INLINE;
    xml += '</office:automatic-styles>\n';

    // Content validations — iterate per sheet for correct base-cell-address
    const validations = this.buildContentValidations(options.sheets);
    if (validations.length > 0) {
      xml += `<table:content-validations>\n${validations.join('\n')}\n</table:content-validations>\n`;
    } else {
      xml += '<table:content-validations/>\n';
    }

    // Body with spreadsheet and tables
    xml += '<office:body>\n<office:spreadsheet>\n';
    for (const sheet of options.sheets) {
      xml += this.buildTableXml(sheet);
    }
    xml += '</office:spreadsheet>\n</office:body>\n';
    xml += '</office:document-content>';

    return xml;
  }

  private buildTableXml(sheet: SheetConfig): string {
    let xml = '';
    const name = this.sanitizeSheetName(sheet.sheetName);
    const colCount = sheet.columns.length;

    xml += `<table:table table:name="${this.xmlEscape(name)}" table:style-name="tableStyle">\n`;

    // Column definitions
    for (let i = 0; i < colCount; i++) {
      xml += '  <table:table-column table:default-cell-style-name="Default"/>\n';
    }

    // Hidden path row
    xml += '  <table:table-row table:style-name="pathRow" table:visibility="collapse">\n';
    for (const col of sheet.columns) {
      xml += `    <table:table-cell table:style-name="pathCellStyle" office:value-type="string" calcext:value-type="string"><text:p>${this.xmlEscape(col.jsonPath)}</text:p></table:table-cell>\n`;
    }
    xml += '  </table:table-row>\n';

    // Header row
    xml += '  <table:table-row table:style-name="headerRow">\n';
    for (const col of sheet.columns) {
      xml += `    <table:table-cell table:style-name="headerCellStyle" office:value-type="string" calcext:value-type="string"><text:p>${this.xmlEscape(this.getHeaderLabel(col))}</text:p></table:table-cell>\n`;
    }
    xml += '  </table:table-row>\n';

    // Data rows (10 empty)
    for (let r = 0; r < 10; r++) {
      xml += '  <table:table-row table:style-name="dataRowStyle">\n';
      for (let i = 0; i < sheet.columns.length; i++) {
        const col = sheet.columns[i];
        const isDropdown = col.uiType === 'dropdown' && col.dropdownLabels && col.dropdownLabels.length > 0;
        const isDate = col.uiType === 'date' || col.uiType === 'datetime';
        const isNumber = col.uiType === 'number';
        const styleName = isDate ? 'dateCellStyle' : isNumber ? 'numberCellStyle' : 'dataCellStyle';

        if (isDropdown) {
          xml += `    <table:table-cell table:style-name="${styleName}" table:content-validation-name="val_${name}_${i}"/>\n`;
        } else {
          xml += `    <table:table-cell table:style-name="${styleName}"/>\n`;
        }
      }
      xml += '  </table:table-row>\n';
    }

    xml += '</table:table>\n';
    return xml;
  }

  private buildContentValidations(sheets: SheetConfig[]): string[] {
    const validations: string[] = [];

    for (const sheet of sheets) {
      const sanitizedName = this.sanitizeSheetName(sheet.sheetName);
      for (let i = 0; i < sheet.columns.length; i++) {
        const col = sheet.columns[i];
        if (col.uiType !== 'dropdown' || !col.dropdownLabels || col.dropdownLabels.length === 0) continue;

        const labels = col.dropdownLabels.map((l) => `"${this.xmlEscape(l)}"`).join(';');
        const helpText = col.description || 'Selecteer een waarde uit de lijst.';
        const cellRef = `${sanitizedName}.B3`; // B3 = first data row, column 2 (A is index 0)
        const validationName = `val_${sanitizedName}_${i}`;

        validations.push(
          `<table:content-validation table:name="${validationName}" table:condition="of:cell-content-is-in-list(${labels})" table:allow-empty-cell="true" table:base-cell-address="${cellRef}">` +
            `<table:help-message table:title="${this.xmlEscape(this.getHeaderLabel(col))}" table:display="true"><text:p>${this.xmlEscape(helpText)}</text:p></table:help-message>` +
            `<table:error-message table:message-type="stop" table:title="Ongeldige invoer" table:display="true"><text:p>De ingevoerde waarde staat niet in de lijst met toegestane waardes.</text:p></table:error-message>` +
          `</table:content-validation>`,
        );
      }
    }

    return validations;
  }

  // ----- Constants -----

  private readonly STYLES_INLINE = `
<style:style style:name="headerCellStyle" style:family="table-cell">
  <style:table-cell-properties fo:background-color="#447a6d" fo:border="0.51pt solid #6c5a44" style:vertical-align="middle"/>
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:color="#ffffff" style:font-name="FreeSans" fo:font-size="10pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="pathCellStyle" style:family="table-cell">
  <style:table-cell-properties fo:background-color="#f6f5ee" fo:border="0.51pt solid #6c5a44" style:vertical-align="middle"/>
  <style:text-properties fo:color="#6c5a44" style:font-name="FreeSans" fo:font-size="9pt"/>
</style:style>
<style:style style:name="dataCellStyle" style:family="table-cell">
  <style:table-cell-properties fo:background-color="#f6f5ee" fo:border="0.51pt solid #6c5a44" style:vertical-align="middle"/>
  <style:text-properties fo:color="#6c5a44" style:font-name="FreeSans" fo:font-size="9pt"/>
</style:style>
<style:style style:name="dateCellStyle" style:family="table-cell">
  <style:table-cell-properties fo:background-color="#f6f5ee" fo:border="0.51pt solid #6c5a44" style:vertical-align="middle"/>
  <style:paragraph-properties fo:text-align="center"/>
  <style:text-properties fo:color="#6c5a44" style:font-name="FreeSans" fo:font-size="9pt"/>
</style:style>
<style:style style:name="numberCellStyle" style:family="table-cell" style:data-style-name="N20000">
  <style:table-cell-properties fo:background-color="#f6f5ee" fo:border="0.51pt solid #6c5a44" style:vertical-align="middle"/>
  <style:text-properties fo:color="#6c5a44" style:font-name="FreeSans" fo:font-size="9pt"/>
</style:style>
<number:number-style style:name="N20000" number:language="nl" number:country="BE">
  <number:number number:min-integer-digits="1" number:decimal-places="2" number:min-decimal-places="2"/>
</number:number-style>
<style:style style:name="headerRow" style:family="table-row">
  <style:table-row-properties style:row-height="0.35in" fo:break-before="auto" style:use-optimal-row-height="false"/>
</style:style>
<style:style style:name="pathRow" style:family="table-row">
  <style:table-row-properties style:row-height="0.18in" fo:break-before="auto" style:use-optimal-row-height="true"/>
</style:style>
<style:style style:name="dataRowStyle" style:family="table-row">
  <style:table-row-properties style:row-height="0.2in" fo:break-before="auto" style:use-optimal-row-height="false"/>
</style:style>
<style:style style:name="tableStyle" style:family="table" style:master-page-name="Default">
  <style:table-properties table:display="true" style:writing-mode="lr-tb"/>
</style:style>`;

  private readonly STYLES_XML = '<?xml version="1.0"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.3"/>';

  private readonly MANIFEST_XML = '<?xml version="1.0"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">\n<manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/>\n<manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>\n<manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>\n<manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>\n</manifest:manifest>';

  // ----- Helpers -----

  private buildMetaXml(title: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">\n<office:meta>\n<dc:title>${this.xmlEscape(title)}</dc:title>\n<meta:generator>poc-json-schema-ods</meta:generator>\n</office:meta>\n</office:document-meta>`;
  }

  private getHeaderLabel(col: ColumnDefinition): string {
    return col.uiType === 'dropdown' ? `${col.title} ▾` : col.title;
  }

  private sanitizeSheetName(name: string): string {
    let s = name.replace(/[^a-zA-Z0-9\u00C0-\u024F\s_-]/g, '').trim();
    s = s.substring(0, 31);
    if (!s) s = 'Sheet';
    return s;
  }

  private xmlEscape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
