import { useParams } from 'react-router-dom';
import { KanbanBoardPanel } from '../components/KanbanBoardPanel';

export function KanbanBoardView() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Board</h1>
      <KanbanBoardPanel projectId={projectId!} />
    </div>
  );
}
