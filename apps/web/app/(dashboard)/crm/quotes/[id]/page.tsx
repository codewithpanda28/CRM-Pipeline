import QuoteDetailPage from '@/modules/crm/quotes/pages/detail';

export default function Page({ params }: { params: { id: string } }) {
  return <QuoteDetailPage id={params.id} />;
}
