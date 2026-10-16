'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MessageTemplate } from '@/types';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { Check, Megaphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { PhoneMockup, PreviewBubble } from '@/components/ui/phone-mockup';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const steps = [
  { label: 'audience', key: 'audience' },
  { label: 'template', key: 'template' },
  { label: 'personalize', key: 'personalize' },
  { label: 'send', key: 'send' },
] as const;

type VariableMap = Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>;

/** Template body with {{n}} filled from the wizard's variable mapping. */
function previewBody(body: string, variables: VariableMap): ReactNode[] {
  const parts = body.split(/(\{\{\s*\d+\s*\}\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{\{\s*(\d+)\s*\}\}$/);
    if (!m) return part;
    const v = variables[m[1]];
    if (v?.type === 'static' && v.value) return <strong key={i}>{v.value}</strong>;
    return (
      <span key={i} className="rounded bg-black/15 px-1 font-semibold">
        {v?.value ? `{${v.value}}` : part}
      </span>
    );
  });
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.new');
  const { accountId } = useAuth();
  const { createAndSendBroadcast, isProcessing, progress } = useBroadcastSending();

  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [audience, setAudience] = useState<{
    type: 'all' | 'tags' | 'custom_field' | 'csv';
    tagIds?: string[];
    customField?: {
      fieldId: string;
      operator: 'is' | 'is_not' | 'contains';
      value: string;
    };
    csvContacts?: { phone: string; name?: string }[];
    excludeTagIds?: string[];
  }>({ type: 'all' });
  const [variables, setVariables] = useState<VariableMap>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [name, setName] = useState('');

  async function handleSend() {
    if (!template) return;

    try {
      const broadcastId = await createAndSendBroadcast({
        name,
        template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
        },
        variables,
        headerMediaUrl,
      });
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      // Previously swallowed with console.error — the wizard would
      // just no-op, leaving the user confused. Surface the reason.
      const message = err instanceof Error ? err.message : t('broadcastFailed');
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  /**
   * Writes a draft broadcast row — no recipients, no sending. The user
   * can revisit it via the list page to finish the flow later. We
   * don't persist the in-progress audience/variable config here
   * because the current schema doesn't carry it past `audience_filter`
   * and `template_variables`; those are enough for the user to
   * recognize the draft but not to exactly round-trip into the wizard.
   * A full resume-draft UX is a future polish.
   */
  async function handleSaveDraft() {
    if (!template || !name.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      toast.error(t('toastNotSignedIn'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNotLinked'));
      return;
    }

    const { error } = await supabase.from('broadcasts').insert({
      user_id: user.id,
      account_id: accountId,
      name: name.trim(),
      template_name: template.name,
      template_language: template.language ?? 'en_US',
      template_variables: variables,
      audience_filter: {
        type: audience.type,
        tagIds: audience.tagIds,
      },
      status: 'draft',
      total_recipients: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    });

    if (error) {
      toast.error(t('toastFailedDraft', { error: error.message }));
      return;
    }
    toast.success(t('toastDraftSaved'));
    router.push('/broadcasts');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        tile=""
        icon={Megaphone}
        title={t('title')}
        description={t('subtitle')}
      />

      {/* Stepper */}
      <ol className="surface flex items-center gap-2 overflow-x-auto p-3 sm:p-4">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-2" aria-current={isActive ? 'step' : undefined}>
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all',
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                      ? 'bg-muted text-tile ring-2 ring-current'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden text-sm font-semibold whitespace-nowrap sm:block',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`steps.${step.label}`)}
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-1 h-0.5 min-w-4 flex-1 rounded-full',
                    index < currentStep ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Step Content */}
        <div className="surface relative min-h-[400px] min-w-0 p-5 sm:p-6">
          <div
            className="transition-all duration-300 ease-in-out"
            style={{
              opacity: isProcessing ? 0.6 : 1,
              pointerEvents: isProcessing ? 'none' : 'auto',
            }}
          >
            {currentStep === 0 && (
              <Step2SelectAudience
                audience={audience}
                onUpdate={setAudience}
                onNext={() => setCurrentStep(1)}
                onBack={() => router.push('/broadcasts')}
              />
            )}
            {currentStep === 1 && (
              <Step1ChooseTemplate
                selectedTemplate={template}
                onSelect={setTemplate}
                onNext={() => setCurrentStep(2)}
                onBack={() => setCurrentStep(0)}
              />
            )}
            {currentStep === 2 && template && (
              <Step3Personalize
                template={template}
                variables={variables}
                onUpdate={setVariables}
                headerMediaUrl={headerMediaUrl}
                onHeaderMediaUrlChange={setHeaderMediaUrl}
                onNext={() => setCurrentStep(3)}
                onBack={() => setCurrentStep(1)}
              />
            )}
            {currentStep === 3 && template && (
              <Step4ScheduleSend
                name={name}
                onNameChange={setName}
                template={template}
                audience={audience}
                onSend={handleSend}
                onSaveDraft={handleSaveDraft}
                onBack={() => setCurrentStep(2)}
                isProcessing={isProcessing}
                progress={progress}
              />
            )}
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-4" aria-label={t('previewTitle')}>
          <p className="mb-3 text-center text-xs font-semibold text-muted-foreground ">
            {t('previewTitle')}
          </p>
          <PhoneMockup title={BRAND.name} subtitle={t('previewSubtitle')}>
            {template ? (
              <PreviewBubble from="business" time="10:24" label={template.name}>
                {template.header_type === 'text' && template.header_content ? (
                  <p className="mb-1 font-semibold">{template.header_content}</p>
                ) : template.header_type ? (
                  <div className="mb-2 flex h-24 items-center justify-center rounded-lg bg-black/15 text-[11px] font-semibold ">
                    {template.header_type}
                  </div>
                ) : null}
                {previewBody(template.body_text, variables)}
                {template.footer_text ? (
                  <p className="mt-1.5 text-[10.5px] opacity-75">{template.footer_text}</p>
                ) : null}
                {template.buttons?.length ? (
                  <div className="mt-2 -mx-1 space-y-1 border-t border-black/15 pt-1.5">
                    {template.buttons.map((b, i) => (
                      <div key={i} className="rounded-lg bg-black/10 py-1 text-center text-[11.5px] font-semibold">
                        {b.text}
                      </div>
                    ))}
                  </div>
                ) : null}
              </PreviewBubble>
            ) : (
              <div className="m-auto max-w-[200px] text-center text-xs text-muted-foreground">
                {t('previewEmpty')}
              </div>
            )}
          </PhoneMockup>
        </aside>
      </div>
    </div>
  );
}
