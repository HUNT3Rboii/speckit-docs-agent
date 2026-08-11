import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useArtifacts } from '../hooks/useArtifacts';
import { ArtifactCard } from '../components/ArtifactCard';
import { ExceptionsPanel } from '../components/ExceptionsPanel';
import { SearchBar } from '../components/SearchBar';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import type { Artifact } from '../types/api';

const CATEGORY_ORDER: Artifact['artifact_type'][] = ['spec', 'plan', 'task', 'constitution', 'other'];

export function ArtifactListView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: artifacts, isLoading, error, refetch } = useArtifacts(projectId!);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const searchFilteredArtifacts = useMemo(() => {
    if (!artifacts) return [];
    if (!searchTerm) return artifacts;
    return artifacts.filter(
      (artifact) =>
        artifact.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        artifact.source_path.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [artifacts, searchTerm]);

  // Category counts reflect the search filter but not the active tab, so
  // switching tabs doesn't change the numbers shown on the other tabs.
  const categoryCounts = useMemo(() => {
    return searchFilteredArtifacts.reduce(
      (acc, artifact) => {
        acc[artifact.artifact_type] = (acc[artifact.artifact_type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [searchFilteredArtifacts]);

  const visibleCategories = useMemo(
    () => CATEGORY_ORDER.filter((category) => categoryCounts[category]),
    [categoryCounts]
  );

  const displayedArtifacts = useMemo(() => {
    const filtered =
      activeTab === 'all'
        ? searchFilteredArtifacts
        : searchFilteredArtifacts.filter((artifact) => artifact.artifact_type === activeTab);

    return [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [searchFilteredArtifacts, activeTab]);

  const handleArtifactClick = (artifactId: string) => {
    navigate(`/projects/${projectId}/artifacts/${artifactId}`);
  };

  if (isLoading) {
    return (
      <div>
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
      <div>
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

  const hasNoArtifacts = !artifacts || artifacts.length === 0;
  // Exceptions brings its own controls and isn't filtered by the artifact
  // search, so leaving that box above it would just be a control that
  // visibly does nothing.
  const isPanelTab = activeTab === 'exceptions';

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Artifacts</h1>

      <div className="space-y-4 mb-6">
        {!hasNoArtifacts && !isPanelTab && <SearchBar value={searchTerm} onChange={setSearchTerm} />}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">
              All
              <Badge variant="secondary" className="ml-2">
                {searchFilteredArtifacts.length}
              </Badge>
            </TabsTrigger>
            {visibleCategories.map((category) => (
              <TabsTrigger key={category} value={category} className="capitalize">
                {category}
                <Badge variant="secondary" className="ml-2">
                  {categoryCounts[category]}
                </Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {activeTab === 'exceptions' ? (
              <ExceptionsPanel projectId={projectId!} />
            ) : hasNoArtifacts ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
                <div className="max-w-md space-y-2">
                  <h2 className="text-xl font-semibold text-muted-foreground">No artifacts found</h2>
                  <p className="text-muted-foreground">This project doesn't have any artifacts yet.</p>
                </div>
              </div>
            ) : displayedArtifacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
                <p className="text-muted-foreground">No artifacts match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedArtifacts.map((artifact) => (
                  <ArtifactCard key={artifact.id} artifact={artifact} onClick={handleArtifactClick} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
