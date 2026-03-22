import { parse } from "csv-parse/sync";

export function parseCsvBuffer(buffer) {
  return parse(buffer, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

export function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const sanitizeForSpreadsheet = (value) => {
    if (/^\s*[=+\-@]/.test(value)) {
      return `'${value}`;
    }

    return value;
  };

  const escape = (value) => {
    if (value == null) {
      return "";
    }

    const stringValue = sanitizeForSpreadsheet(String(value));
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }

  return `${lines.join("\n")}\n`;
}
