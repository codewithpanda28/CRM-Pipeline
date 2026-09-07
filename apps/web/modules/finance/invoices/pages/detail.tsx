'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { InvoiceEditor } from '../components/InvoiceEditor';

export default function InvoiceDetailPage({ id }: { id?: string }) {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <InvoiceEditor id={id} />
      </div>
    </ModuleGuard>
  );
}
