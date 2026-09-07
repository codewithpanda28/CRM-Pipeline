'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { CustomerPartyDetail } from '@/modules/crm/customer-parties/components/CustomerPartyDetail';

export default function CustomerPartyDetailPage() {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 24 }}>
        <CustomerPartyDetail />
      </div>
    </ModuleGuard>
  );
}
