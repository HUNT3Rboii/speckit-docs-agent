/**
 * Custom hook for polling live processing status (current pipeline step,
 * latest version) for a single artifact, e.g. in the PDF viewer while a
 * document is still being generated.
 */

import { useQuery } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { ArtifactStatusResponse } from '../types/api';
import { isProcessing } from '../utils/processingStatus';

const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

export function useArtifactStatus(artifactId: string) {
  return useQuery<ArtifactStatusResponse, Error>({
    queryKey: ['artifact-status', artifactId],
    queryFn: () => apiClient.getArtifactStatus(artifactId),
    retry: 2,
    enabled: !!artifactId,
    refetchInterval: (query) => {
      const status = query.state.data?.artifact?.status;
      return status && isProcessing(status) ? 3000 : false;
    },
  });
}
