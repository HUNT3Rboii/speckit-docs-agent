import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { formatDistanceToNow, isValid } from 'date-fns';
import { truncatePath } from '../utils/pathTruncate';
import { getCategoryBadgeClasses } from '../utils/categoryColors';
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
            {artifact.title || truncatePath(artifact.source_path, 50)}
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
        <div className="text-sm text-muted-foreground">
          Created {formatCreatedDate()}
        </div>
      </CardContent>
    </Card>
  );
}
