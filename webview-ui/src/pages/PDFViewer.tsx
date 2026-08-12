import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VersionList } from '../components/VersionList';
import { Button } from '../components/ui/button';
import { Download, Loader2, AlertCircle, AlertTriangle, Ban, RotateCw } from 'lucide-react';
import { apiClient, type PagePreview } from '../api/client';
import { readPageImage } from '../api/host';
import { useArtifactStatus } from '../hooks/useArtifactStatus';
import { useAddException } from '../hooks/useExceptions';
import { useRetryArtifact } from '../hooks/useArtifacts';
import { isActivelyProcessing, isCancelled, isProcessing, needsCorrection, stepLabel } from '../utils/processingStatus';

/**
 * One page image.
 *
 * Tries the rewritten local-resource URI, which is the cheap path - the webview
 * streams the file straight off disk. When that fails, and it fails without a
 * console entry or a network error to look at, the bytes are fetched through
 * the bridge and shown as a `data:` URI instead. A page is never simply a
 * broken image: either it renders, or it says what went wrong.
 */
function PageImage({ page, index }: { page: PagePreview; index: number }) {
  const [source, setSource] = useState(page.uri);
  const [failed, setFailed] = useState(false);

  // A new version replaces the pages under us; without this the previous
  // page's fallback would stick.
  useEffect(() => {
    setSource(page.uri);
    setFailed(false);
  }, [page.uri]);

  if (failed) {
    return (
      <div className="w-full max-w-3xl rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
        Page {index + 1} could not be displayed.
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={`Page ${index + 1}`}
      className="w-full max-w-3xl rounded shadow-sm bg-white"
      loading="lazy"
      onError={() => {
        if (source !== page.uri) {
          setFailed(true);
          return;
        }
        readPageImage(page.path)
          .then(setSource)
          .catch(() => setFailed(true));
      }}
    />
  );
}

export function PDFViewer() {
  const { artifactId, versionId } = useParams<{
    projectId: string;
    artifactId: string;
    versionId?: string;
  }>();
  const navigate = useNavigate();

  const [currentVersionId, setCurrentVersionId] = useState(versionId || '');

  const { data: statusData } = useArtifactStatus(artifactId || '');
  const artifact = statusData?.artifact;
  const addException = useAddException(artifact?.project_id || '');
  const retryArtifact = useRetryArtifact(artifact?.project_id || '');
  const [excluded, setExcluded] = useState(false);
  const processing = artifact ? isActivelyProcessing(artifact.status) : false;
  const stalled = artifact ? needsCorrection(artifact.status) : false;
  const failed = artifact?.status === 'failed';
  const cancelled = artifact ? isCancelled(artifact.status) : false;
  // Still worth polling for a new version while stalled: the calling AI
  // agent's session might resubmit a correction later even though nothing
  // is actively happening right now.
  const pollForNewVersion = artifact ? isProcessing(artifact.status) : false;

  // The PDF is a file on this machine, not a URL on a server. A webview cannot
  // read files by path, so the host rewrites it into a URI the panel may load;
  // that replaces the old /api/doc-versions/{id}/pdf?api_key=... address, and
  // with it the API key that used to travel in a query string.
  const [pages, setPages] = useState<PagePreview[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!currentVersionId) {
      setPages(null);
      return;
    }

    setPages(null);
    apiClient
      .getVersionPages(currentVersionId)
      .then((uris) => {
        if (!cancelled) {
          setPages(uris);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentVersionId]);

  const handleVersionSelect = (newVersionId: string) => {
    setCurrentVersionId(newVersionId);
  };

  const handleDownload = () => {
    // Opening it in the OS viewer is what "download" means here: the file
    // already exists on this machine, and a webview has no downloads folder.
    if (currentVersionId) {
      void apiClient.openVersionPdf(currentVersionId);
    }
  };

  const handleExclude = () => {
    if (!artifact) return;
    addException.mutate(artifact.source_path, {
      onSuccess: () => {
        // Excluding removes this artifact server-side (see backend's
        // add_exception route) - staying on this page would otherwise
        // start erroring once the status poll refetches a now-deleted
        // artifact, so leave for the project's artifact list instead.
        setExcluded(true);
        navigate(`/projects/${artifact.project_id}`);
      },
    });
  };

  const handleRetry = () => {
    if (!artifact) return;
    retryArtifact.mutate(artifact.id);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
        {/* PDF Content Area */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">PDF Viewer</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRetry}
                disabled={!artifact || processing || retryArtifact.isPending}
                title="Reprocess this file through the pipeline from scratch"
              >
                <RotateCw className="h-4 w-4 mr-2" />
                {retryArtifact.isPending ? 'Retrying…' : 'Retry'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExclude}
                disabled={!artifact || excluded || addException.isPending}
                title="Never process this file into a PDF again"
              >
                <Ban className="h-4 w-4 mr-2" />
                {excluded ? 'Excluded' : 'Exclude from Processing'}
              </Button>
              <Button onClick={handleDownload} disabled={!currentVersionId}>
                <Download className="h-4 w-4 mr-2" />
                Open PDF
              </Button>
            </div>
          </div>
          {addException.isError && (
            <p className="text-sm text-destructive mb-4">Failed to add exception. Try again.</p>
          )}
          
          {currentVersionId ? (
            /*
             * Pages, not the PDF itself. A webview has no PDF plugin - <object
             * type="application/pdf"> always fell through to its "unable to
             * display" branch - so Typst renders the same document to PNG at
             * build time and those are shown here. The PDF is still what the
             * button opens.
             */
            <div
              className="relative w-full h-[calc(100vh-200px)] overflow-y-auto rounded-lg border bg-muted/30 p-4"
              key={currentVersionId}
            >
              {pages === null ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Rendering pages…</p>
                </div>
              ) : pages.length ? (
                <div className="flex flex-col items-center gap-4">
                  {pages.map((page, index) => (
                    <PageImage key={page.path} page={page} index={index} />
                  ))}
                </div>
              ) : (
                /*
                 * A version built before page rendering existed has a PDF and
                 * no images. Rebuilding is what produces them, so the button
                 * that does it is here rather than in a sentence telling the
                 * reader to go and find it.
                 */
                <div className="flex flex-col items-center justify-center h-full space-y-4 px-6 text-center">
                  <p className="text-muted-foreground">
                    This version has no page preview - it was built before the panel could show one.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleRetry} disabled={!artifact || processing || retryArtifact.isPending}>
                      <RotateCw className="h-4 w-4 mr-2" />
                      {retryArtifact.isPending ? 'Rendering…' : 'Render pages'}
                    </Button>
                    <Button variant="outline" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Open the PDF instead
                    </Button>
                  </div>
                </div>
              )}
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
          ) : cancelled ? (
            <div className="flex flex-col items-center justify-center h-[400px] border rounded-lg bg-muted gap-3">
              <Ban className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">Cancelled - no version has been rendered yet.</p>
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
