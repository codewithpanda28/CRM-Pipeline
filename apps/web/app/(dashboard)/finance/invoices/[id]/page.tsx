import InvoiceDetailPage from '@/modules/finance/invoices/pages/detail';

export default function Page({ params }: { params: { id: string } }) {
  return <InvoiceDetailPage id={params.id} />;
}
