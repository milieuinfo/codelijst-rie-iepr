import type { ColumnDefinition, SheetDefinition } from '../models/index.js';

export class SheetSplitter {
  split(columns: ColumnDefinition[], themeName: string): SheetDefinition[] {
    const mainColumns: ColumnDefinition[] = [];
    const nestedGroups = new Map<string, { title: string; columns: ColumnDefinition[]; parentPath: string }>();

    for (const col of columns) {
      if (!col.parentArray) {
        mainColumns.push(col);
        continue;
      }

      const pathSegments = col.parentArray.split('/').filter(Boolean);
      const topKey = pathSegments[0];
      const topPath = '/' + topKey;
      const title = this.findColumnTitle(columns, topPath) || topKey;

      let group = nestedGroups.get(topKey);
      if (!group) {
        group = { title, columns: [], parentPath: topPath };
        nestedGroups.set(topKey, group);
      }
      group.columns.push(col);
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
