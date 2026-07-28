import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useArtifacts } from '../hooks/useArtifacts';
import { ArtifactCard } from '../components/ArtifactCard';
import { SearchBar } from '../components/SearchBar';
import { CategoryFilter } from '../components/CategoryFilter';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';

export function ArtifactListView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: artifacts, isLoading, error, refetch } = useArtifacts(projectId!);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const filteredArtifacts = useMemo(() => {
    if (!artifacts) return [];

    let filtered = artifacts;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (artifact) =>
          artifact.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          artifact.source_path.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (selectedCategories.size > 0) {
      filtered = filtered.filter((artifact) =>
        selectedCategories.has(artifact.artifact_type)
      );
    }

    // Sort by created_at descending (newest first)
    return filtered.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [artifacts, searchTerm, selectedCategories]);

  // Calculate category counts
  const categoryCounts = useMemo(() => {
    if (!artifacts) return {};
    return artifacts.reduce((acc, artifact) => {
      acc[artifact.artifact_type] = (acc[artifact.artifact_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [artifacts]);

  // Group artifacts by category
  const groupedArtifacts = useMemo(() => {
    const groups: Record<string, typeof filteredArtifacts> = {};
    filteredArtifacts.forEach((artifact) => {
      if (!groups[artifact.artifact_type]) {
        groups[artifact.artifact_type] = [];
      }
      groups[artifact.artifact_type].push(artifact);
    });
    return groups;
  }, [filteredArtifacts]);

  const handleArtifactClick = (artifactId: string) => {
    navigate(`/projects/${projectId}/artifacts/${artifactId}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Artifacts</h1>
        <div className="space-y-4 mb-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold text-destructive">Error Loading Artifacts</h2>
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

  if (!artifacts || artifacts.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Artifacts</h1>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold text-muted-foreground">No artifacts found</h2>
            <p className="text-muted-foreground">This project doesn't have any artifacts yet.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Artifacts</h1>
      
      <div className="space-y-4 mb-6">
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={handleCategoryToggle}
          categoryCounts={categoryCounts}
        />
        <div className="text-sm text-muted-foreground">
          Showing {filteredArtifacts.length} of {artifacts.length} artifacts
        </div>
      </div>

      {filteredArtifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <p className="text-muted-foreground">No artifacts match your filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedArtifacts).map(([category, categoryArtifacts]) => (
            <div key={category}>
              <h2 className="text-xl font-semibold mb-4 capitalize">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryArtifacts.map((artifact) => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onClick={handleArtifactClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
