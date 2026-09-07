'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { PaymentsBoard } from '../components/PaymentsBoard';

export default function PaymentsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <PaymentsBoard />
      </div>
    </ModuleGuard>
  );
}
