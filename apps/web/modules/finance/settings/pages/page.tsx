'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { FinanceSettingsBoard } from '@/modules/finance/settings/components/FinanceSettingsBoard';

export default function FinanceSettingsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <FinanceSettingsBoard />
      </div>
    </ModuleGuard>
  );
}
