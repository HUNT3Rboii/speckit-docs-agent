import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { VersionList } from '../components/VersionList';
import { Button } from '../components/ui/button';
import { Download, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { config } from '../config/env';
import { useArtifactStatus } from '../hooks/useArtifactStatus';
import { isActivelyProcessing, isProcessing, needsCorrection, stepLabel } from '../utils/processingStatus';

export function PDFViewer() {
  const { artifactId, versionId } = useParams<{
    projectId: string;
    artifactId: string;
    versionId?: string;
  }>();

  const [currentVersionId, setCurrentVersionId] = useState(versionId || '');

  const { data: statusData } = useArtifactStatus(artifactId || '');
  const artifact = statusData?.artifact;
  const processing = artifact ? isActivelyProcessing(artifact.status) : false;
  const stalled = artifact ? needsCorrection(artifact.status) : false;
  const failed = artifact?.status === 'failed';
  // Still worth polling for a new version while stalled: the calling AI
  // agent's session might resubmit a correction later even though nothing
  // is actively happening right now.
  const pollForNewVersion = artifact ? isProcessing(artifact.status) : false;

  // Build direct PDF URL with authentication via query parameter
  // Since iframe doesn't support custom headers, pass API key as query param
  const pdfUrl = currentVersionId 
    ? `${config.apiBaseUrl}/api/doc-versions/${currentVersionId}/pdf?api_key=${config.apiKey}#toolbar=1&navpanes=1`
    : null;

  const handleVersionSelect = (newVersionId: string) => {
    setCurrentVersionId(newVersionId);
  };

  const handleDownload = () => {
    if (pdfUrl) {
      // Open PDF in new tab which will trigger browser's download
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `document-${currentVersionId}.pdf`;
      link.click();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
        {/* PDF Content Area */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">PDF Viewer</h1>
            <Button onClick={handleDownload} disabled={!pdfUrl}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
          
          {pdfUrl ? (
            <div className="relative w-full h-[calc(100vh-200px)]">
              <object
                data={pdfUrl}
                type="application/pdf"
                className="w-full h-full border rounded-lg"
                key={currentVersionId} // Force re-render when version changes
              >
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <p className="text-muted-foreground">Unable to display PDF in browser.</p>
                  <a 
                    href={pdfUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Click here to open PDF in new tab
                  </a>
                </div>
              </object>
            </div>
          ) : processing ? (
            <div className="flex flex-col items-center justify-center h-[400px] border rounded-lg bg-muted gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">{artifact ? stepLabel(artifact) : 'Processing'}</p>
            </div>
          ) : stalled ? (
            <div className="flex flex-col items-center justify-center h-[400px] border rounded-lg bg-muted gap-3 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-500" />
              <p className="text-amber-600 dark:text-amber-500">{artifact ? stepLabel(artifact) : 'Needs correction'}</p>
              <p className="text-sm text-muted-foreground">
                Validation failed and no version has been rendered yet. This resolves once the tool
                that generated this document submits a corrected version.
              </p>
            </div>
          ) : failed ? (
            <div className="flex flex-col items-center justify-center h-[400px] border rounded-lg bg-muted gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-destructive">{artifact ? stepLabel(artifact) : 'Failed'}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted">
              <p className="text-muted-foreground">Select a version to view PDF</p>
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
                isProcessing={pollForNewVersion}
              />
            </div>
          )}
        </aside>
      </div>
  );
}
