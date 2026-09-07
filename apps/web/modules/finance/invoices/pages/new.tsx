'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { InvoiceEditor } from '../components/InvoiceEditor';

export default function InvoiceNewPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <InvoiceEditor />
      </div>
    </ModuleGuard>
  );
}
