import type { ColumnDefinition, SheetDefinition } from '../models/index.js';

export class SheetSplitter {
  split(columns: ColumnDefinition[], themeName: string): SheetDefinition[] {
    const mainColumns: ColumnDefinition[] = [];
    const nestedGroups = new Map<string, { title: string; columns: ColumnDefinition[]; parentPath: string }>();

    for (const col of columns) {
      const segments = col.jsonPath.split('/').filter(Boolean);

      if (segments.length <= 1) {
        // Top-level property → main sheet
        mainColumns.push(col);
      } else if (segments.length === 2) {
        // /parent/child → "parent" sheet
        const parentKey = segments[0];
        const parentTitle = this.findColumnTitle(columns, `/${parentKey}`) || segments[0];
        let group = nestedGroups.get(parentKey);
        if (!group) {
          group = { title: parentTitle, columns: [], parentPath: `/${parentKey}` };
          nestedGroups.set(parentKey, group);
        }
        group.columns.push(col);
      } else {
        // /parent/child/grandchild → "child" sheet nested under parent
        const parentKey = segments[0];
        const childKey = segments[1];
        const childTitle = this.findColumnTitle(columns, `/${parentKey}/${childKey}`) || childKey;
        const compositeKey = `${parentKey}__${childKey}`;
        let group = nestedGroups.get(compositeKey);
        if (!group) {
          group = { title: childTitle, columns: [], parentPath: `/${parentKey}` };
          nestedGroups.set(compositeKey, group);
        }
        group.columns.push(col);
      }
    }

    // Build final sheets array
    const sheets: SheetDefinition[] = [
      {
        sheetName: this.sanitizeSheetName(themeName),
        columns: mainColumns,
      },
    ];

    for (const group of nestedGroups.values()) {
      sheets.push({
        sheetName: this.sanitizeSheetName(group.title),
        columns: group.columns,
        parentPath: group.parentPath,
      });
    }

    return sheets;
  }

  private findColumnTitle(columns: ColumnDefinition[], path: string): string | null {
    const col = columns.find((c) => c.jsonPath === path);
    return col ? col.title : null;
  }

  private sanitizeSheetName(name: string): string {
    let sanitized = name.replace(/[^a-zA-Z0-9\u00C0-\u024F\s_-]/g, '').trim();
    sanitized = sanitized.substring(0, 31);
    if (!sanitized) sanitized = 'Sheet';
    return sanitized;
  }
}
