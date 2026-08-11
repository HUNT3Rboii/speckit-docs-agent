/**
 * Custom hook for fetching and downloading PDF files using React Query
 * **Validates: Requirements 3.1**
 */

import { useQuery } from '@tanstack/react-query';
import { APIClient } from '../api/client';

/**
 * Configuration for API client
 * In production, these should come from environment variables
 */
const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

/**
 * Hook for fetching PDF blob for a specific version
 * Uses React Query to manage server state with caching
 * 
 * @param versionId - ID of the document version to fetch PDF for
 * @returns Object with PDF blob data, loading state, error, refetch function, and download helper
 */
export function usePDFDownload(versionId: string) {
  const query = useQuery<Blob, Error>({
    queryKey: ['pdf', versionId],
    queryFn: () => apiClient.downloadPDF(versionId),
    staleTime: 5 * 60 * 1000, // 5 minutes - PDFs don't change often
    retry: 2, // Retry failed requests up to 2 times
    enabled: !!versionId, // Only fetch when versionId is provided
  });

  /**
   * Helper function to trigger browser download of the PDF
   * Creates a temporary download link and clicks it
   * 
   * @param filename - Optional filename for the downloaded PDF
   */
  const downloadPDF = (filename = 'document.pdf') => {
    if (!query.data) {
      console.warn('No PDF data available to download');
      return;
    }

    // Create a blob URL for the PDF
    const url = window.URL.createObjectURL(query.data);
    
    // Create a temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    downloadPDF,
  };
}
