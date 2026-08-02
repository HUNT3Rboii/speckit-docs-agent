import { useEffect } from 'react';
import { useVersions } from '../hooks/useVersions';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';

interface VersionListProps {
  artifactId: string;
  currentVersionId: string;
  onVersionSelect: (versionId: string) => void;
  /** While true, poll for a new version - the artifact is still being processed. */
  isProcessing?: boolean;
}

export function VersionList({ artifactId, currentVersionId, onVersionSelect, isProcessing }: VersionListProps) {
  const { data: versions, isLoading, error } = useVersions(artifactId, { pollForNewVersion: isProcessing });

  // Auto-select the most recent version when arriving at an artifact with
  // no version already chosen (e.g. clicked from the artifact list rather
  // than a direct /versions/:id link) - without this, the PDF pane just
  // sits on "Select a version to view PDF" until the user notices and
  // clicks a version button in this sidebar, which reads as "the viewer
  // doesn't work" rather than "pick a version first."
  useEffect(() => {
    if (!currentVersionId && versions && versions.length > 0) {
      const newest = [...versions].sort(
        (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
      )[0];
      onVersionSelect(newest.id);
    }
  }, [currentVersionId, versions, onVersionSelect]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="font-semibold mb-2">Version History</h3>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load version history
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    if (isProcessing) {
      return (
        <div className="text-sm text-muted-foreground">
          No versions yet - the first version will appear here once processing finishes.
        </div>
      );
    }
    return null;
  }

  // Sort versions by generated_at descending
  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  );

  return (
    <div>
      <h3 className="font-semibold mb-4">Version History</h3>
      <div className="space-y-2">
        {sortedVersions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          return (
            <Button
              key={version.id}
              variant={isCurrent ? 'default' : 'outline'}
              className="w-full justify-start text-left"
              onClick={() => onVersionSelect(version.id)}
            >
              <div className="flex flex-col items-start">
                <div className="font-semibold">Version {version.version_no}</div>
                <div className="text-xs opacity-70">
                  {formatDistanceToNow(new Date(version.generated_at), { addSuffix: true })}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
