'use client';

import { useEffect, useState } from 'react';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';
import { settingRowMenu } from '@/modules/shared/lib/settingsMenu';
import { apiFetch } from '@/modules/shared/lib/api';
import { PLATFORM_IDENTITY } from '@vencore/config/theme';

export default function AboutPage() {
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const [version, setVersion] = useState('…');
  useEffect(() => {
    apiFetch<{ data: { version: string } }>('/api/system/version')
      .then(r => setVersion(r.data.version))
      .catch(() => setVersion('unknown'));
  }, []);
  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>About</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Version and resources.</p>

      <div style={card}>
        <div
          onContextMenu={e => openMenu(e, settingRowMenu({ label: 'Version', value: version }))}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Version</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{version}</span>
        </div>
        <div
          onContextMenu={e => openMenu(e, settingRowMenu({ label: 'Product', value: PLATFORM_IDENTITY.productName }))}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Product</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{PLATFORM_IDENTITY.productName}</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, marginBottom: 8 }}>
          {PLATFORM_IDENTITY.productName} — {PLATFORM_IDENTITY.productCategory}.
        </p>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>
          Built with open-source components. See repository LICENSE and ATTRIBUTION for third-party notices.
        </p>
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
