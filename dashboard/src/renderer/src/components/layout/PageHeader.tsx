/**
 * Page Header Component
 *
 * Sticky header that appears below the site header for each page.
 * Contains the page title and page-specific actions.
 */

import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** Page title */
  title: string
  /** Optional subtitle or status text */
  subtitle?: string
  /** Actions (buttons, etc.) on the right side */
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="page-sticky-header">
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">{title}</h2>
          {subtitle && <span className="page-subtitle">{subtitle}</span>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  )
}
