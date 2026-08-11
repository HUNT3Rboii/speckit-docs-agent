import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ConvertOutcome, DocumentEntry } from '../../shared/protocol';
import { loadState, on, request, saveState } from './bridge';

type Status =
  | { state: 'idle' }
  | { state: 'converting' }
  | { state: 'done'; outcome: ConvertOutcome }
  | { state: 'failed'; message: string };

interface PersistedState {
  filter: string;
  lastConverted?: string;
}

/**
 * The panel.
 *
 * No router: a webview has no history API, so navigation is component state.
 * The view is deliberately flat for now - one list, one action - because the
 * pipeline behind it is what phase 5 replaces.
 */
export function App() {
  const restored = useMemo(() => loadState<PersistedState>() ?? { filter: '' }, []);

  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [filter, setFilter] = useState(restored.filter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  useEffect(() => {
    saveState<PersistedState>({ filter });
  }, [filter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await request<{ documents: DocumentEntry[] }>('listDocuments');
      setDocuments(result.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return on('documentsChanged', () => void refresh());
  }, [refresh]);

  const convert = useCallback(async (path: string) => {
    setStatuses((current) => ({ ...current, [path]: { state: 'converting' } }));
    try {
      const outcome = await request<ConvertOutcome>('convertDocument', { path });
      setStatuses((current) => ({ ...current, [path]: { state: 'done', outcome } }));
    } catch (err) {
      setStatuses((current) => ({
        ...current,
        [path]: { state: 'failed', message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) {
      return documents;
    }
    return documents.filter(
      (document) =>
        document.label.toLowerCase().includes(needle) || document.directory.toLowerCase().includes(needle)
    );
  }, [documents, filter]);

  return (
    <main className="panel">
      <header className="panel-header">
        <h1>Documents</h1>
        <div className="panel-actions">
          <input
            className="filter"
            type="search"
            placeholder="Filter by name or folder"
            value={filter}
            aria-label="Filter documents"
            onChange={(event) => setFilter(event.target.value)}
          />
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {loading && <p className="muted">Looking for markdown files…</p>}

      {!loading && !visible.length && (
        <p className="muted">
          {documents.length ? 'Nothing matches that filter.' : 'No markdown files in this workspace.'}
        </p>
      )}

      <ul className="documents">
        {visible.map((document) => (
          <DocumentRow
            key={document.path}
            document={document}
            status={statuses[document.path] ?? { state: 'idle' }}
            onConvert={() => void convert(document.path)}
            onOpen={(path) => void request('openPdf', { path })}
          />
        ))}
      </ul>
    </main>
  );
}

function DocumentRow({
  document,
  status,
  onConvert,
  onOpen,
}: {
  document: DocumentEntry;
  status: Status;
  onConvert: () => void;
  onOpen: (path: string) => void;
}) {
  return (
    <li className="document">
      <div className="document-identity">
        <span className="document-label">{document.label}</span>
        <span className="document-directory">{document.directory}</span>
      </div>

      <div className="document-status">
        {status.state === 'converting' && <span className="muted">Building…</span>}
        {status.state === 'failed' && <span className="error">{status.message}</span>}
        {status.state === 'done' && (
          <>
            <span className="muted">
              {status.outcome.diagramCount > 0
                ? `${status.outcome.diagramCount} diagram${status.outcome.diagramCount === 1 ? '' : 's'}`
                : 'Ready'}
              {status.outcome.warnings.length > 0 &&
                ` · ${status.outcome.warnings.length} warning${status.outcome.warnings.length === 1 ? '' : 's'}`}
            </span>
            <button type="button" onClick={() => onOpen(status.outcome.pdfPath)}>
              Open PDF
            </button>
          </>
        )}
        <button type="button" onClick={onConvert} disabled={status.state === 'converting'}>
          {status.state === 'done' ? 'Rebuild' : 'Convert'}
        </button>
      </div>
    </li>
  );
}
