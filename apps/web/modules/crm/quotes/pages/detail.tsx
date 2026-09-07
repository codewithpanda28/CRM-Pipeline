'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { QuoteEditor } from '../components/QuoteEditor';

export default function QuoteDetailPage({ id }: { id?: string }) {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 24 }}>
        <QuoteEditor id={id} />
      </div>
    </ModuleGuard>
  );
}
