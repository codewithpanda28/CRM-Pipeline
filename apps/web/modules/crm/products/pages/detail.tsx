'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { ProductDetail } from '../components/ProductDetail';

export default function ProductDetailPage({ id }: { id: string }) {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 24 }}>
        <ProductDetail id={id} />
      </div>
    </ModuleGuard>
  );
}
