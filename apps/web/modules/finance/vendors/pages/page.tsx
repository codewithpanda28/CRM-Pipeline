'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { VendorsBoard } from '../components/VendorsBoard';

export default function VendorsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <VendorsBoard />
      </div>
    </ModuleGuard>
  );
}
