'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { QuotesBoard } from '../components/QuotesBoard';

export default function QuotesPage() {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 24 }}>
        <QuotesBoard />
      </div>
    </ModuleGuard>
  );
}
