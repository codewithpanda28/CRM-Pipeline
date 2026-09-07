'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { LeadsBoard } from '@/modules/crm/leads/components/LeadsBoard';

export default function LeadsPage() {
  return (
    <ModuleGuard moduleId="crm">
      <Topbar />
      <div style={{ padding: 16, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 12px', fontWeight: 600 }}>Leads</h1>
        <p style={{ margin: '0 0 16px', fontSize: 14, opacity: 0.75 }}>
          Qualification records — not Contacts, Companies, or Deals until converted.
        </p>
        <LeadsBoard />
      </div>
    </ModuleGuard>
  );
}
