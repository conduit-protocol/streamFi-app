/**
 * Minimal CSV serialisation and client-side download.
 *
 * Follows RFC 4180 (double-quote wrapping, `""` escaping, CRLF row endings)
 * and additionally neutralises spreadsheet formula injection: a field that a
 * spreadsheet would try to evaluate (`=`, `@`, or a non-numeric leading `+` /
 * `-`, or a leading tab / carriage return) is prefixed with a single quote.
 */

export type CsvValue = string | number | boolean | null | undefined;

export type DateFormat = 'iso' | 'unix' | 'locale' | 'date-only';

export interface StreamColumnMapping<T = any> {
  /** Property key or identifier on the record. */
  key: string;
  /** Display label for the CSV header row. */
  header: string;
  /** Optional custom formatting function. */
  format?: (value: any, item: T) => CsvValue;
  /** Format applied to numeric epoch timestamps. Defaults to 'iso'. */
  dateFormat?: DateFormat;
}

export interface StreamExportOptions<T = any> {
  /** Optional list of column mappings to export. Defaults to DEFAULT_STREAM_COLUMNS. */
  columnMappings?: readonly StreamColumnMapping<T>[];
  /** Default date formatting applied to all timestamp fields unless overridden. */
  dateFormat?: DateFormat;
}

export const DEFAULT_STREAM_COLUMNS: readonly StreamColumnMapping[] = [
  { key: 'id', header: 'Stream ID' },
  { key: 'sender', header: 'Sender' },
  { key: 'recipient', header: 'Recipient' },
  { key: 'amount', header: 'Amount' },
  { key: 'status', header: 'Status' },
  { key: 'startTime', header: 'Start Time', dateFormat: 'iso' },
  { key: 'endTime', header: 'End Time', dateFormat: 'iso' },
] as const;

function formatTimestamp(value: any, format?: DateFormat): CsvValue {
  if (value == null || value === '') return '';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value);

  // If timestamp is in seconds (< 1e11), convert to milliseconds
  const ms = num < 1e11 ? num * 1000 : num;
  const d = new Date(ms);

  switch (format) {
    case 'unix':
      return num < 1e11 ? num : Math.floor(num / 1000);
    case 'date-only':
      return d.toISOString().slice(0, 10);
    case 'locale':
      return d.toLocaleString();
    case 'iso':
    default:
      return d.toISOString();
  }
}

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
 * Export a list of stream records to CSV supporting customizable column selection,
 * column headers, and timestamp format specifications (e.g. QuickBooks / Xero compatibility).
 */
export function streamsToCsv<T extends Record<string, any>>(
  streams: readonly T[],
  options?: StreamExportOptions<T>,
): string {
  const mappings = options?.columnMappings ?? (DEFAULT_STREAM_COLUMNS as readonly StreamColumnMapping<T>[]);
  const defaultDateFormat = options?.dateFormat ?? 'iso';

  const headers = mappings.map((m) => m.header);

  const rows = streams.map((stream) =>
    mappings.map((m) => {
      const rawValue = stream[m.key];
      if (m.format) {
        return m.format(rawValue, stream);
      }
      if (
        m.dateFormat ||
        (defaultDateFormat && (m.key.toLowerCase().includes('time') || m.key.toLowerCase().includes('date')))
      ) {
        return formatTimestamp(rawValue, m.dateFormat ?? defaultDateFormat);
      }
      return rawValue as CsvValue;
    }),
  );

  return toCsv(headers, rows);
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
