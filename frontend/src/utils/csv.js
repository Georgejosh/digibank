/**
 * Builds a CSV in the browser and hands it to the user as a download.
 * `rows` is an array of arrays; the first row is the header.
 *
 * Every cell is quoted, and cells starting with = + - @ are prefixed with an
 * apostrophe so a goal named "=HYPERLINK(...)" cannot run as a formula when the
 * statement is opened in Excel (CSV injection).
 */
export function downloadCsv(filename, rows) {
  const escape = (value) => {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const body = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  // BOM so Excel reads the ₹ sign as UTF-8.
  const blob = new Blob([String.fromCharCode(0xfeff), body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** paise -> "1250.00" for a spreadsheet column (no symbol, no grouping). */
export function paiseToCsv(paise) {
  return (Number(paise ?? 0) / 100).toFixed(2);
}

/** ISO timestamp -> "06 Oct 2026, 14:05" */
export function csvDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
