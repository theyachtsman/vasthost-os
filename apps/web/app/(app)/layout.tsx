import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

// The signed-in application shell. Route gating is enforced by middleware.ts
// (server-side, before this renders), so reaching here implies a session cookie.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
