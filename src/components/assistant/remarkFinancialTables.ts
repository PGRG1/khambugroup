import type { Root, Table } from "mdast";

// Presentation only: preserve cell content and explicit GFM alignment.
function cellText(node: { value?: string; children?: unknown[] }): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(child => cellText(child as Parameters<typeof cellText>[0])).join("");
}

export function remarkFinancialTables() {
  return (tree: Root) => {
    const visit = (node: { type: string; children?: unknown[] }) => {
      if (node.type === "table") {
        const table = node as Table;
        const align = table.align ?? table.children[0]?.children.map(() => null) ?? [];
        table.align = align.map((existing, column) => {
          if (existing) return existing;
          const values = table.children.slice(1).map(row => row.children[column]).filter(Boolean)
            .map(cell => cellText(cell).trim()).filter(value => value && !/^[—–-]$/.test(value));
          return values.length && values.every(value => /^(?:\()?[-+−]?(?:(?:[A-Z]{2,3}\s*)?[$€£¥]\s*)?[-+−]?\d[\d,]*(?:\.\d+)?\s*%?\)?$/.test(value)) ? "right" : null;
        });
      }
      (node.children ?? []).forEach(child => visit(child as Parameters<typeof visit>[0]));
    };
    visit(tree);
  };
}