'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { PeriodsBoard } from '../components/PeriodsBoard';

export default function PeriodsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <PeriodsBoard />
      </div>
    </ModuleGuard>
  );
}
