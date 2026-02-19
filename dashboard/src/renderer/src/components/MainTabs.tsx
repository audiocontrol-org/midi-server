import { useState } from 'react'

type TabId = 'ports' | 'routes' | 'graph'

interface Tab {
  id: TabId
  label: string
  icon: React.JSX.Element
}

const tabs: Tab[] = [
  {
    id: 'ports',
    label: 'Ports',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
        />
      </svg>
    )
  },
  {
    id: 'routes',
    label: 'Routes',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    )
  },
  {
    id: 'graph',
    label: 'Graph',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="2" strokeWidth={2} />
        <circle cx="19" cy="6" r="2" strokeWidth={2} />
        <circle cx="19" cy="18" r="2" strokeWidth={2} />
        <path strokeLinecap="round" strokeWidth={2} d="M7 11l10-4M7 13l10 4" />
      </svg>
    )
  }
]

interface MainTabsProps {
  children: (activeTab: TabId) => React.ReactNode
}

export function MainTabs({ children }: MainTabsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('ports')

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="bg-gray-800 rounded-lg p-1 flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md
              font-medium text-sm transition-colors
              ${
                activeTab === tab.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>{children(activeTab)}</div>
    </div>
  )
}

export type { TabId }
