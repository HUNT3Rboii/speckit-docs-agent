import { buildPdfUrl, pdfTempFileName, fetchPdf } from './pdfDownloadService';

describe('buildPdfUrl', () => {
  it('builds the doc-version download URL', () => {
    expect(buildPdfUrl('http://localhost:8000', 'version-148-2')).toBe(
      'http://localhost:8000/api/doc-versions/version-148-2/pdf'
    );
  });

  it('does not double the slash when the backend URL has a trailing one', () => {
    expect(buildPdfUrl('http://localhost:8000/', 'version-1-1')).toBe(
      'http://localhost:8000/api/doc-versions/version-1-1/pdf'
    );
  });

  it('encodes version ids so an odd one cannot alter the path', () => {
    expect(buildPdfUrl('http://localhost:8000', 'version/../health')).toBe(
      'http://localhost:8000/api/doc-versions/version%2F..%2Fhealth/pdf'
    );
  });
});

describe('pdfTempFileName', () => {
  it('keeps a normal version id recognisable', () => {
    expect(pdfTempFileName('version-148-2')).toBe('version-148-2.pdf');
  });

  it('replaces characters that are illegal in a filename', () => {
    expect(pdfTempFileName('version:148/2')).toBe('version_148_2.pdf');
  });
});

describe('fetchPdf', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  function mockFetch(impl: jest.Mock) {
    global.fetch = impl as any;
    return impl;
  }

  it('sends the API key as a bearer token and returns the bytes', async () => {
    const body = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => body.buffer
      })
    );

    const result = await fetchPdf('http://localhost:8000', 'dev-key', 'version-148-2');

    expect(result).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/doc-versions/version-148-2/pdf');
    expect(init.headers).toEqual({ Authorization: 'Bearer dev-key' });
  });

  it('omits the Authorization header when no key is configured', async () => {
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1]).buffer
      })
    );

    await fetchPdf('http://localhost:8000', '', 'version-1-1');

    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it('throws with the status code on a non-2xx response', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchPdf('http://localhost:8000', 'dev-key', 'version-9-9')).rejects.toThrow(
      /404/
    );
  });

  it('propagates a network failure so the caller can fall back', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(fetchPdf('http://localhost:8000', 'dev-key', 'version-1-1')).rejects.toThrow(
      'ECONNREFUSED'
    );
  });

  it('reports a timeout distinctly from other failures', async () => {
    mockFetch(
      jest.fn().mockImplementation((_url: string, init: any) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      })
    );

    await expect(
      fetchPdf('http://localhost:8000', 'dev-key', 'version-1-1', 5)
    ).rejects.toThrow(/timed out after 5ms/);
  });
});
