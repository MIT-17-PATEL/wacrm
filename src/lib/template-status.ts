/**
 * Shared display config for message_templates.status.
 *
 * The DB stores Meta's raw enum (DRAFT / APPROVED / PENDING / REJECTED /
 * PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION) — the UI maps it to
 * a human label + dark-theme badge classes here so the template manager,
 * inbox picker, and broadcast picker stay aligned.
 */

import type { MessageTemplateStatus } from '@/types';
import { getT } from '@/lib/i18n/translate';

export interface TemplateStatusDisplay {
  label: string;
  classes: string;
}

const t = getT('TemplateStatus');

export const templateStatusConfig: Record<
  MessageTemplateStatus,
  TemplateStatusDisplay
> = {
  DRAFT: {
    label: t('DRAFT'),
    classes: 'bg-slate-600/20 text-muted-foreground border-slate-600/30',
  },
  PENDING: {
    label: t('PENDING'),
    classes: 'bg-warning/20 text-warning border-warning/30',
  },
  APPROVED: {
    label: t('APPROVED'),
    classes: 'bg-primary/20 text-primary border-primary/30',
  },
  REJECTED: {
    label: t('REJECTED'),
    classes: 'bg-danger/20 text-danger border-danger/30',
  },
  PAUSED: {
    label: t('PAUSED'),
    classes: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  },
  DISABLED: {
    label: t('DISABLED'),
    classes: 'bg-danger/10 text-danger border-danger/40',
  },
  IN_APPEAL: {
    label: t('IN_APPEAL'),
    classes: 'bg-info/20 text-info border-info/30',
  },
  PENDING_DELETION: {
    label: t('PENDING_DELETION'),
    classes: 'bg-slate-700/30 text-muted-foreground border-slate-700/40',
  },
};
