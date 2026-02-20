/**
 * App Shell Component
 *
 * Root layout that provides the site structure:
 * - Site header (sticky, with nav and global status)
 * - Main content area
 */

import type { ReactNode } from 'react'
import { SiteHeader, type TabId } from './SiteHeader'

interface AppShellProps {
  /** Currently active tab */
  activeTab: TabId
  /** Callback when tab is selected */
  onTabChange: (tab: TabId) => void
  /** Header status content (connection indicators, etc.) */
  headerStatus?: ReactNode
  /** Main content */
  children: ReactNode
}

export function AppShell({
  activeTab,
  onTabChange,
  headerStatus,
  children
}: AppShellProps): React.JSX.Element {
  return (
    <div className="site-shell">
      <SiteHeader activeTab={activeTab} onTabChange={onTabChange}>
        {headerStatus}
      </SiteHeader>
      <main className="site-main">{children}</main>
    </div>
  )
}

export type { TabId }
