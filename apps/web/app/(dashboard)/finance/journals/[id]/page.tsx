import JournalDetailPage from '@/modules/finance/journals/pages/detail';

export default function Page({ params }: { params: { id: string } }) {
  return <JournalDetailPage id={params.id} />;
}
