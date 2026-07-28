import { useVersions } from '../hooks/useVersions';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';

interface VersionListProps {
  artifactId: string;
  currentVersionId: string;
  onVersionSelect: (versionId: string) => void;
}

export function VersionList({ artifactId, currentVersionId, onVersionSelect }: VersionListProps) {
  const { data: versions, isLoading, error } = useVersions(artifactId);

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
