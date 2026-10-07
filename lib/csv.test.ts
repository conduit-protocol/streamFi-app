import { describe, it, expect, vi, afterEach } from 'vitest';
import { toCsv, downloadCsv, streamsToCsv, DEFAULT_STREAM_COLUMNS } from './csv';

describe('toCsv', () => {
  it('joins a header row and data rows with CRLF', () => {
    const csv = toCsv(['a', 'b'], [
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('quotes fields containing commas, quotes or newlines', () => {
    const csv = toCsv(['x'], [
      ['a,b'],
      ['he said "hi"'],
      ['line1\nline2'],
    ]);
    expect(csv).toBe('x\r\n"a,b"\r\n"he said ""hi"""\r\n"line1\nline2"');
  });

  it('renders null / undefined as empty fields', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0');
  });

  it('neutralises spreadsheet formula injection with a leading quote', () => {
    const csv = toCsv(['v'], [
      ['=SUM(A1:A2)'],
      ['@foo'],
      ['-cmd'],
    ]);
    expect(csv).toBe("v\r\n'=SUM(A1:A2)\r\n'@foo\r\n'-cmd");
  });

  it('quotes AND escapes a formula-like field that also contains a comma', () => {
    expect(toCsv(['v'], [['=1,2']])).toBe('v\r\n"\'=1,2"');
  });

  it('leaves real numbers (including negatives) untouched', () => {
    expect(toCsv(['n'], [['-50.42'], ['+3'], ['1000.00']])).toBe(
      'n\r\n-50.42\r\n+3\r\n1000.00',
    );
  });
});

describe('streamsToCsv', () => {
  const sampleStreams = [
    {
      id: 'stream-1',
      sender: 'G_ALICE',
      recipient: 'G_BOB',
      amount: '500.00',
      status: 'Active',
      startTime: 1700000000,
      endTime: 1705000000,
    },
    {
      id: 'stream-2',
      sender: 'G_CHARLIE',
      recipient: 'G_DAVE',
      amount: '1200.50',
      status: 'Completed',
      startTime: 1701000000,
      endTime: 1706000000,
    },
  ];

  it('exports with default column mapping', () => {
    const csv = streamsToCsv(sampleStreams);
    const headers = DEFAULT_STREAM_COLUMNS.map((c) => c.header).join(',');
    expect(csv.startsWith(headers)).toBe(true);
    expect(csv).toContain('stream-1,G_ALICE,G_BOB,500.00,Active');
    expect(csv).toContain('stream-2,G_CHARLIE,G_DAVE,1200.50,Completed');
  });

  it('supports custom column selection and custom headers for accounting software', () => {
    const customMappings = [
      { key: 'id', header: 'Reference ID' },
      { key: 'recipient', header: 'Payee Account' },
      { key: 'amount', header: 'Gross Amount' },
      { key: 'startTime', header: 'Start Date', dateFormat: 'date-only' as const },
    ];

    const csv = streamsToCsv(sampleStreams, { columnMappings: customMappings });
    expect(csv).toContain('Reference ID,Payee Account,Gross Amount,Start Date');
    expect(csv).toContain('stream-1,G_BOB,500.00,2023-11-14');
    expect(csv).toContain('stream-2,G_DAVE,1200.50,2023-11-26');
  });

  it('supports custom formatters for columns', () => {
    const customMappings = [
      { key: 'id', header: 'ID' },
      {
        key: 'amount',
        header: 'Formatted Amount',
        format: (val: any) => `$${val}`,
      },
    ];

    const csv = streamsToCsv(sampleStreams, { columnMappings: customMappings });
    expect(csv).toContain('ID,Formatted Amount');
    expect(csv).toContain('stream-1,$500.00');
  });

  it('supports unix timestamp format', () => {
    const customMappings = [
      { key: 'id', header: 'ID' },
      { key: 'startTime', header: 'Epoch', dateFormat: 'unix' as const },
    ];

    const csv = streamsToCsv(sampleStreams, { columnMappings: customMappings });
    expect(csv).toContain('stream-1,1700000000');
  });
});

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (URL as any).createObjectURL;
    delete (URL as any).revokeObjectURL;
  });

  it('creates an anchor, clicks it, and revokes the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    downloadCsv('report.csv', 'a,b\r\n1,2');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(document.querySelector('a[download]')).toBeNull(); // cleaned up
  });

  it('is a no-op when object URLs are unavailable', () => {
    expect(() => downloadCsv('report.csv', 'a,b')).not.toThrow();
  });
});
