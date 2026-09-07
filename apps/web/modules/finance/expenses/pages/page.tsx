'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { ExpensesBoard } from '../components/ExpensesBoard';

export default function ExpensesPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <ExpensesBoard />
      </div>
    </ModuleGuard>
  );
}
