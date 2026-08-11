import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useExceptions, useAddException, useRemoveException } from '../hooks/useExceptions';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface ExceptionsPanelProps {
  projectId: string;
}

export function ExceptionsPanel({ projectId }: ExceptionsPanelProps) {
  const { data: exceptions, isLoading, error } = useExceptions(projectId);
  const addException = useAddException(projectId);
  const removeException = useRemoveException(projectId);
  const [newPath, setNewPath] = useState('');

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = newPath.trim();
    if (!trimmed) return;
    addException.mutate(trimmed, {
      onSuccess: () => setNewPath(''),
    });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading exceptions...</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load exceptions.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Excluded Paths</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Files or folders listed here are never converted to a PDF, even when saved. Use an
          exact file path (e.g. "docs/onepager.md") or a folder prefix (e.g.
          ".specify/templates") to exclude everything under it.
        </p>
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={newPath}
            onChange={(event) => setNewPath(event.target.value)}
            placeholder="e.g. .specify/templates or docs/onepager.md"
            aria-label="Path to exclude"
          />
          <Button type="submit" disabled={!newPath.trim() || addException.isPending}>
            Add
          </Button>
        </form>
        {addException.isError && (
          <p className="text-sm text-destructive mt-2">Failed to add exception. Try again.</p>
        )}
      </div>

      {!exceptions || exceptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No excluded paths yet.</p>
      ) : (
        <ul className="space-y-2">
          {exceptions.map((exception) => (
            <li
              key={exception.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-4 py-2"
            >
              <span className="font-mono text-sm break-all">{exception.source_path}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${exception.source_path}`}
                onClick={() => removeException.mutate(exception.id)}
                disabled={removeException.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
