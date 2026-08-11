import { useMemo, useState } from 'react';
import { EyeOff, FileText } from 'lucide-react';
import { useProjectFiles, useRequestFileTransform } from '../hooks/useProjectFiles';
import { useAddException } from '../hooks/useExceptions';
import { SearchBar } from './SearchBar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import type { ProjectFile } from '../types/api';

interface ContextFilesPanelProps {
  projectId: string;
}

/** Rough size, so a 3-line stub is distinguishable from a full spec. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What the Transform button should say and whether it can be pressed. A
 * file already mid-pipeline or already queued must not be re-queueable -
 * pressing again would do nothing server-side but reads as a dead button.
 */
function transformState(file: ProjectFile): { label: string; disabled: boolean } {
  if (file.artifact_status === 'processing') return { label: 'Processing...', disabled: true };
  if (file.transform_requested) return { label: 'Queued', disabled: true };
  if (file.artifact_id) return { label: 'Regenerate PDF', disabled: false };
  return { label: 'Transform to PDF', disabled: false };
}

export function ContextFilesPanel({ projectId }: ContextFilesPanelProps) {
  const { data: files, isLoading, error } = useProjectFiles(projectId);
  const requestTransform = useRequestFileTransform(projectId);
  const addException = useAddException(projectId);
  const [searchTerm, setSearchTerm] = useState('');

  // Excluded files are deliberately dropped rather than shown greyed out:
  // the Exceptions tab is where they're managed, and leaving them here
  // would make this list a near-duplicate of it.
  const visibleFiles = useMemo(() => {
    const included = (files ?? []).filter((file) => !file.is_excluded);
    if (!searchTerm) return included;
    const needle = searchTerm.toLowerCase();
    return included.filter((file) => file.source_path.toLowerCase().includes(needle));
  }, [files, searchTerm]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[...Array(4)].map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load context files.</p>;
  }

  const hasNoFiles = !files || files.every((file) => file.is_excluded);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every markdown file in this project, whether or not it has been converted yet. Transforming
        runs the file through the same pipeline a save would.
      </p>

      {!hasNoFiles && (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by path..."
              ariaLabel="Search context files"
            />
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {visibleFiles.length} {visibleFiles.length === 1 ? 'file' : 'files'}
          </span>
        </div>
      )}

      {hasNoFiles ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <div className="max-w-md space-y-2">
            <h2 className="text-xl font-semibold text-muted-foreground">No markdown files found</h2>
            <p className="text-muted-foreground">
              This list comes from the VS Code extension. Open this project in VS Code with the
              Speckit extension running and it will appear here.
            </p>
          </div>
        </div>
      ) : visibleFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
          <p className="text-muted-foreground">No files match your search.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleFiles.map((file) => {
            const { label, disabled } = transformState(file);
            const isPendingHere =
              requestTransform.isPending && requestTransform.variables === file.source_path;
            const isExcludingHere =
              addException.isPending && addException.variables === file.source_path;

            return (
              <li
                key={file.source_path}
                className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-mono text-sm break-all">{file.source_path}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(file.size_bytes)}</p>
                  </div>
                  {file.artifact_id && (
                    <Badge variant="secondary" className="shrink-0">
                      PDF
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || isPendingHere}
                    onClick={() => requestTransform.mutate(file.source_path)}
                  >
                    {isPendingHere ? 'Queueing...' : label}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Add ${file.source_path} to exceptions`}
                    title="Never convert this file"
                    disabled={isExcludingHere}
                    onClick={() => addException.mutate(file.source_path)}
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {requestTransform.isError && (
        <p className="text-sm text-destructive">Failed to queue that file. Try again.</p>
      )}
      {addException.isError && (
        <p className="text-sm text-destructive">Failed to add that exception. Try again.</p>
      )}
    </div>
  );
}
