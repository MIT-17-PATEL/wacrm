"use client"

import Link from 'next/link'
import { Megaphone, SquareKanban, UserPlus, Zap } from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/components/ui/button'

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow — no modal auto-opening on the target page.
const ACTIONS: Array<{
  key: 'newContact' | 'newDeal' | 'newBroadcast' | 'newAutomation'
  href: string
  icon: ComponentType<{ className?: string }>
}> = [
  { key: 'newContact', href: '/contacts', icon: UserPlus },
  { key: 'newDeal', href: '/pipelines', icon: SquareKanban },
  { key: 'newBroadcast', href: '/broadcasts/new', icon: Megaphone },
  { key: 'newAutomation', href: '/automations/new', icon: Zap },
]

/** A single row of plain secondary buttons. */
export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            title={t(`${a.key}Hint`)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Icon className="text-muted-foreground" />
            {t(a.key)}
          </Link>
        )
      })}
    </div>
  )
}
