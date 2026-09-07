'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { JournalDetailBoard } from '../components/JournalDetailBoard';

export default function JournalDetailPage({ id }: { id: string }) {
  return (
    <ModuleGuard moduleId="finance">
      <Topbar />
      <div style={{ padding: 24 }}>
        <JournalDetailBoard id={id} />
      </div>
    </ModuleGuard>
  );
}
