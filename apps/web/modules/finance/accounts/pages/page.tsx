'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { AccountsBoard } from '../components/AccountsBoard';

export default function AccountsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <AccountsBoard />
      </div>
    </ModuleGuard>
  );
}
