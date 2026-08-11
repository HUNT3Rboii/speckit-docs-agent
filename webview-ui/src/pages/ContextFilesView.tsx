import { useParams } from 'react-router-dom';
import { ContextFilesPanel } from '../components/ContextFilesPanel';

export function ContextFilesView() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Context Files</h1>
      <ContextFilesPanel projectId={projectId!} />
    </div>
  );
}
