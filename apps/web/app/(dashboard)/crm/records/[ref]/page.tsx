'use client';

import { useParams } from 'next/navigation';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { UnifiedRecordShell } from '@/modules/crm/records/components/UnifiedRecordShell';

export default function UnifiedRecordPage() {
  const params = useParams<{ ref: string }>();
  const ref = decodeURIComponent(params.ref ?? '');

  return (
    <ModuleGuard moduleId="crm">
      <UnifiedRecordShell recordRef={ref} />
    </ModuleGuard>
  );
}
