'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { CustomerPartiesBoard } from '@/modules/crm/customer-parties/components/CustomerPartiesBoard';

export default function CustomerPartiesPage() {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 24 }}>
        <CustomerPartiesBoard />
      </div>
    </ModuleGuard>
  );
}
