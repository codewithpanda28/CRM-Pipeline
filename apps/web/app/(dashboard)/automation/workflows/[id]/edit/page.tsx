import WorkflowBuilderPage from '@/modules/automation/pages/builder';

export default function EditWorkflowPage({ params }: { params: { id: string } }) {
  return <WorkflowBuilderPage workflowId={params.id} />;
}
