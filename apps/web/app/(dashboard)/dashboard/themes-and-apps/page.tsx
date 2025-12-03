'use client';

import { Themes } from './_components/Themes';

export default function ThemesAndAppsPage() {
  // TODO: Get actual auth data from session/context when available
  // For now, using mock data - this should be replaced with actual auth
  const mockAuth = {
    memberID: 1,
    token: 'mock-token',
    org: 'test-org',
    isMesDohThemeAdmin: false,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Cloud Apps</h1>
        <p className="text-sm text-slate-400">
          Manage and deploy themes and applications for your hosting accounts.
        </p>
      </header>
      <Themes
        memberID={mockAuth.memberID}
        token={mockAuth.token}
        org={mockAuth.org}
        isMesDohThemeAdmin={mockAuth.isMesDohThemeAdmin}
      />
    </div>
  );
}

