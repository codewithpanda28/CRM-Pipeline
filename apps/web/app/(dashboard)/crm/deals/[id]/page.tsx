'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { DealDetailPage } from '@/modules/crm/deals/pages/detail';

export default function DealDetailRoutePage() {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <DealDetailPage />
    </ModuleGuard>
  );
}
