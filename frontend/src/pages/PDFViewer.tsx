import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { usePDFDownload } from '../hooks/usePDFDownload';
import { VersionList } from '../components/VersionList';
import { Button } from '../components/ui/button';
import { Download, Loader2 } from 'lucide-react';

export function PDFViewer() {
  const { artifactId, versionId } = useParams<{
    projectId: string;
    artifactId: string;
    versionId?: string;
  }>();

  const [currentVersionId, setCurrentVersionId] = useState(versionId || '');
  const { data: pdfBlob, isLoading, error, downloadPDF } = usePDFDownload(currentVersionId);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [pdfBlob]);

  const handleVersionSelect = (newVersionId: string) => {
    setCurrentVersionId(newVersionId);
  };

  const handleDownload = () => {
    if (pdfBlob) {
      downloadPDF();
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold text-destructive">Error Loading PDF</h2>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* PDF Content Area */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">PDF Viewer</h1>
            <Button onClick={handleDownload} disabled={!pdfBlob}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
          
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-[calc(100vh-200px)] border rounded-lg"
              title="PDF Document"
            />
          ) : (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted">
              <p className="text-muted-foreground">No PDF available</p>
            </div>
          )}
        </div>

        {/* Sidebar with metadata and version history */}
        <aside className="lg:w-80 space-y-6">
          <div className="border rounded-lg p-4 bg-card">
            <h2 className="font-semibold mb-2">Artifact Details</h2>
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">Artifact ID:</p>
              <p className="font-mono text-xs break-all">{artifactId}</p>
            </div>
          </div>

          {artifactId && (
            <div className="border rounded-lg p-4 bg-card">
              <VersionList
                artifactId={artifactId}
                currentVersionId={currentVersionId}
                onVersionSelect={handleVersionSelect}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
