import ProductDetailPage from '@/modules/crm/products/pages/detail';

export default function Page({ params }: { params: { id: string } }) {
  return <ProductDetailPage id={params.id} />;
}
