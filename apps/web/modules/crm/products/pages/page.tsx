'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { ProductsBoard } from '../components/ProductsBoard';

export default function ProductsPage() {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 24 }}>
        <ProductsBoard />
      </div>
    </ModuleGuard>
  );
}
