'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { ReportsBoard } from '../components/ReportsBoard';

export default function ReportsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <ReportsBoard />
      </div>
    </ModuleGuard>
  );
}
