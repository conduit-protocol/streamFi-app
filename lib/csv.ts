/**
 * Minimal CSV serialisation and client-side download.
 *
 * Follows RFC 4180 (double-quote wrapping, `""` escaping, CRLF row endings)
 * and additionally neutralises spreadsheet formula injection: a field that a
 * spreadsheet would try to evaluate (`=`, `@`, or a non-numeric leading `+` /
 * `-`, or a leading tab / carriage return) is prefixed with a single quote.
 */

export type CsvValue = string | number | boolean | null | undefined;

function encodeField(value: CsvValue): string {
  let s = value == null ? '' : String(value);

  // Formula-injection guard. Leave real numbers ("-50.42", "+3") untouched.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d.]/.test(s)) {
    s = `'${s}`;
  }

  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

/** Serialise a header row plus data rows into an RFC 4180 CSV string. */
export function toCsv(headers: readonly CsvValue[], rows: readonly CsvValue[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(encodeField).join(','))
    .join('\r\n');
}

/**
 * Trigger a browser download of `csv` as `filename`. No-op outside the browser.
 * A UTF-8 BOM is prepended so Excel reads non-ASCII characters correctly.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }

  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
