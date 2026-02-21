/**
 * Site Header Component
 *
 * Global header that appears at the top of every page.
 * Contains the app title, navigation tabs, and global status indicators.
 */

import type { ReactNode } from 'react'
import { AudioControlLogo } from './AudioControlLogo'

type TabId = 'ports' | 'routes' | 'graph'

interface Tab {
  id: TabId
  label: string
}

const tabs: Tab[] = [
  { id: 'ports', label: 'Global' },
  { id: 'routes', label: 'Routes' },
  { id: 'graph', label: 'Graph' }
]

interface SiteHeaderProps {
  /** Currently active tab */
  activeTab: TabId
  /** Callback when tab is selected */
  onTabChange: (tab: TabId) => void
  /** Content for the right side of the header (status indicators, etc.) */
  children?: ReactNode
}

export function SiteHeader({
  activeTab,
  onTabChange,
  children
}: SiteHeaderProps): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        {/* Logo + Navigation */}
        <div className="site-logo">
          <AudioControlLogo size={28} />
          <h1 className="site-title">
            <span className="site-title-accent">AudioControl</span> MIDI Server
          </h1>
          <nav>
            <ul className="site-nav">
              {tabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    onClick={() => onTabChange(tab.id)}
                    className="site-nav-link"
                    data-active={activeTab === tab.id || undefined}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Right side: status indicators */}
        <div className="site-header-actions">{children}</div>
      </div>
    </header>
  )
}

export type { TabId }
