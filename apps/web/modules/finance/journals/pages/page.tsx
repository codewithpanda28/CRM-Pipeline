'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { JournalsBoard } from '../components/JournalsBoard';

export default function JournalsPage() {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <JournalsBoard />
      </div>
    </ModuleGuard>
  );
}
