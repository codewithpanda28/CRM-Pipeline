import { RunDetailPage } from '@/modules/automation/pages/runs';

export default function RunDetailRoute({ params }: { params: { id: string } }) {
  return <RunDetailPage runId={params.id} />;
}
