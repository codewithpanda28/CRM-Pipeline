import { ApprovalDetailPage } from '@/modules/automation/pages/approvals';

export default function ApprovalDetailRoute({ params }: { params: { id: string } }) {
  return <ApprovalDetailPage approvalId={params.id} />;
}
