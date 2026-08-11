import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { formatDistanceToNow, isValid } from 'date-fns';
import { Loader2, AlertCircle, AlertTriangle, Ban, CheckCircle2, XCircle } from 'lucide-react';
import { truncatePath } from '../utils/pathTruncate';
import { getCategoryBadgeClasses } from '../utils/categoryColors';
import { isActivelyProcessing, isCancelled, needsCorrection, stepLabel } from '../utils/processingStatus';
import { ArtifactTags } from './ArtifactTags';
import { useCancelArtifact } from '../hooks/useArtifacts';
import type { Artifact } from '../types/api';

interface ArtifactCardProps {
  artifact: Artifact;
  onClick: (artifactId: string) => void;
}

export function ArtifactCard({ artifact, onClick }: ArtifactCardProps) {
  const handleClick = () => {
    onClick(artifact.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(artifact.id);
    }
  };

  const badgeClasses = getCategoryBadgeClasses(artifact.artifact_type);
  const processing = isActivelyProcessing(artifact.status);
  const stalled = needsCorrection(artifact.status);
  const failed = artifact.status === 'failed';
  const cancelled = isCancelled(artifact.status);
  const cancelArtifact = useCancelArtifact(artifact.project_id);

  const handleCancel = (event: React.MouseEvent) => {
    event.stopPropagation();
    cancelArtifact.mutate(artifact.id);
  };

  // Safely format the date, fallback to "Unknown" if invalid
  const formatCreatedDate = () => {
    if (!artifact.created_at) return 'Unknown';
    const date = new Date(artifact.created_at);
    if (!isValid(date)) return 'Unknown';
    return formatDistanceToNow(date, { addSuffix: true });
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Open artifact ${artifact.title || artifact.source_path}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl flex-1">
            {artifact.title || artifact.metadata?.title || truncatePath(artifact.source_path, 50)}
          </CardTitle>
          <Badge className={badgeClasses}>
            {artifact.artifact_type}
          </Badge>
        </div>
        <CardDescription>
          {artifact.source_path}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {processing ? (
          <div className="flex items-center justify-between gap-2" data-testid="processing-indicator">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stepLabel(artifact)}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleCancel}
              disabled={cancelArtifact.isPending}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              {cancelArtifact.isPending ? 'Cancelling…' : 'Cancel'}
            </Button>
          </div>
        ) : stalled ? (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500" data-testid="stalled-indicator">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate">{stepLabel(artifact)}</span>
          </div>
        ) : failed ? (
          <div className="flex items-center gap-2 text-sm text-destructive" data-testid="failed-indicator">
            <AlertCircle className="h-4 w-4" />
            {stepLabel(artifact)}
          </div>
        ) : cancelled ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="cancelled-indicator">
            <Ban className="h-4 w-4 shrink-0" />
            {stepLabel(artifact)}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="ready-indicator">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 shrink-0" />
            <span>Ready · Created {formatCreatedDate()}</span>
          </div>
        )}
        <div className="mt-3">
          <ArtifactTags
            artifactId={artifact.id}
            projectId={artifact.project_id}
            tags={artifact.tags ?? []}
          />
        </div>
      </CardContent>
    </Card>
  );
}
