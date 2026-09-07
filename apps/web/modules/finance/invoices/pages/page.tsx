'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { InvoicesBoard } from '../components/InvoicesBoard';

export default function InvoicesPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <InvoicesBoard />
      </div>
    </ModuleGuard>
  );
}
