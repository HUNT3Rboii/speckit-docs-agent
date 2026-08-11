/**
 * ProjectCard Component
 * Displays a single project as a clickable card with hover effects
 * **Validates: Requirements 1.2, 1.3, 5.1, 5.2, 5.3, 5.4, 5.5, 11.2**
 */

import { Card, CardHeader, CardTitle, CardDescription } from './ui/card';
import type { Project } from '../types/api';

export interface ProjectCardProps {
  project: Project;
  onClick: (projectId: string) => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const handleClick = () => {
    onClick(project.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Support keyboard navigation - Enter and Space keys
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(project.id);
    }
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Open project ${project.name}`}
    >
      <CardHeader>
        <CardTitle className="text-xl">{project.name}</CardTitle>
        {project.repo_url && (
          <CardDescription className="truncate" title={project.repo_url}>
            🔗 {project.repo_url}
          </CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}
