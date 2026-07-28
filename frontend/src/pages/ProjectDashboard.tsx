/**
 * ProjectDashboard Page
 * Displays all projects in a responsive grid layout with loading, error, and empty states
 * **Validates: Requirements 1.1, 1.4, 1.5, 5.1, 5.2, 5.3, 5.4, 7.1, 7.5, 8.1, 8.2, 8.3, 8.4**
 */

import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from '../components/ProjectCard';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';

export function ProjectDashboard() {
  const navigate = useNavigate();
  const { data: projects, isLoading, error, refetch } = useProjects();

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  // Loading state with skeleton components
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Projects</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="space-y-3">
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state with retry button
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold text-destructive">
              Error Loading Projects
            </h2>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Empty state when no projects exist
  if (!projects || projects.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Projects</h1>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold text-muted-foreground">
              No projects found
            </h2>
            <p className="text-muted-foreground">
              Create some markdown files to generate PDF artifacts!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success state with project cards in responsive grid
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Projects</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={handleProjectClick}
          />
        ))}
      </div>
    </div>
  );
}
