import { Suspense } from 'react';
import RunsPage from '@/modules/automation/pages/runs';

export default function RunsRoute() {
  return (
    <Suspense fallback={null}>
      <RunsPage />
    </Suspense>
  );
}
