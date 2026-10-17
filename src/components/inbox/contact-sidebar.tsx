"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { cn } from "@/lib/utils";
import type {
  Contact,
  Conversation,
  ContactNote,
  CustomField,
  Deal,
  PipelineStage,
  Tag,
} from "@/types";
import {
  Activity,
  Building2,
  Check,
  ChevronDown,
  Copy,
  Mail,
  Phone,
  Plus,
  SlidersHorizontal,
  StickyNote,
  Tag as TagIcon,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InlineText } from "@/components/ui/inline-edit";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { addContactTag, deleteContactTag } from "@/lib/contacts/tag-api";
import { formatCurrency } from "@/lib/currency";
import { celebrateWon, isWonStage } from "@/lib/pipelines/won";
import { undoToast } from "@/lib/undo-toast";

interface Teammate {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
}

interface ContactSidebarProps {
  contact: Contact | null;
  /** Enables the assignee dropdown. */
  conversation?: Conversation | null;
  onAssignChange?: (conversationId: string, agentId: string | null) => void;
  /** Inline edits to name/email/company flow back to the list + thread. */
  onContactChange?: (contact: Contact) => void;
  /** Header close button ("i" toggles the panel too). */
  onClose?: () => void;
}

/**
 * Inbox DETAILS panel (320px): contact info, tags, custom fields, deal
 * cards, assignee, notes and recent activity. Every field edits inline
 * and updates optimistically — on error it reverts and toasts.
 */
export function ContactSidebar({
  contact,
  conversation,
  onAssignChange,
  onContactChange,
  onClose,
}: ContactSidebarProps) {
  const t = useTranslations("Inbox.sidebar");
  const tShell = useTranslations("Shell");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stagesByPipeline, setStagesByPipeline] = useState<Record<string, PipelineStage[]>>({});
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [team, setTeam] = useState<Teammate[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const contactId = contact?.id ?? null;

  const fetchContactData = useCallback(async () => {
    if (!contactId) return;
    const supabase = createClient();
    const [dealsRes, notesRes, contactTagsRes, tagsRes, fieldsRes, valuesRes, teamRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false }),
      supabase.from("contact_tags").select("tag_id").eq("contact_id", contactId),
      supabase.from("tags").select("*").order("name"),
      supabase.from("custom_fields").select("*").order("field_name"),
      supabase.from("contact_custom_values").select("custom_field_id, value").eq("contact_id", contactId),
      supabase.from("profiles").select("user_id, full_name, avatar_url"),
    ]);

    const dealRows = (dealsRes.data ?? []) as Deal[];
    setDeals(dealRows);
    setNotes((notesRes.data ?? []) as ContactNote[]);
    setTagIds(((contactTagsRes.data ?? []) as { tag_id: string }[]).map((r) => r.tag_id));
    setAllTags((tagsRes.data ?? []) as Tag[]);
    setFields((fieldsRes.data ?? []) as CustomField[]);
    const map: Record<string, string> = {};
    for (const v of (valuesRes.data ?? []) as { custom_field_id: string; value: string | null }[]) {
      map[v.custom_field_id] = v.value ?? "";
    }
    setValues(map);
    setTeam((teamRes.data ?? []) as Teammate[]);

    // Stages for every pipeline a deal sits in (for the stage dropdown).
    const pipelineIds = [...new Set(dealRows.map((d) => d.pipeline_id))];
    if (pipelineIds.length > 0) {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .in("pipeline_id", pipelineIds)
        .order("position");
      const grouped: Record<string, PipelineStage[]> = {};
      for (const s of (data ?? []) as PipelineStage[]) (grouped[s.pipeline_id] ??= []).push(s);
      setStagesByPipeline(grouped);
    }
    setLoaded(true);
  }, [contactId]);

  // Load on contact change. The setters run inside async Supabase
  // callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const tagsById = useMemo(() => new Map(allTags.map((tag) => [tag.id, tag])), [allTags]);

  /* ---------------- contact fields ---------------- */

  const saveContactField = useCallback(
    async (field: "name" | "email" | "company", value: string) => {
      if (!contact) return;
      const previous = contact;
      const next: Contact = { ...contact, [field]: value || undefined };
      onContactChange?.(next);
      const { error } = await createClient()
        .from("contacts")
        .update({ [field]: value || null, updated_at: new Date().toISOString() })
        .eq("id", contact.id);
      if (error) {
        onContactChange?.(previous);
        toast.error(tShell("saveFailed"));
      }
    },
    [contact, onContactChange, tShell],
  );

  const handleCopyPhone = useCallback(async () => {
    // Copies whatever the row displays — a BSUID-only contact has no
    // phone number to copy, but its @username still identifies them.
    const handle = contact ? contactHandle(contact) : "";
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  /* ---------------- assignee ---------------- */

  const assign = useCallback(
    async (agentId: string | null, isUndo = false) => {
      if (!conversation || !onAssignChange) return;
      const previous = conversation.assigned_agent_id ?? null;
      if (previous === agentId) return;
      onAssignChange(conversation.id, agentId);
      const { error } = await createClient()
        .from("conversations")
        .update({ assigned_agent_id: agentId })
        .eq("id", conversation.id);
      if (error) {
        onAssignChange(conversation.id, previous);
        toast.error(tThread("assignmentUpdateFailed"));
        return;
      }
      if (!isUndo) {
        const name = team.find((p) => p.user_id === agentId)?.full_name;
        undoToast(name ? tShell("assignedTo", { name }) : tShell("unassigned"), tShell("undo"), () =>
          void assign(previous, true),
        );
      }
    },
    [conversation, onAssignChange, team, tShell, tThread],
  );

  /* ---------------- tags ---------------- */

  const setTag = useCallback(
    async (tagId: string, on: boolean, isUndo = false) => {
      if (!contactId) return;
      setTagIds((prev) => (on ? [...new Set([...prev, tagId])] : prev.filter((id) => id !== tagId)));
      try {
        if (on) await addContactTag(contactId, tagId);
        else await deleteContactTag(contactId, tagId);
      } catch (err) {
        setTagIds((prev) => (on ? prev.filter((id) => id !== tagId) : [...new Set([...prev, tagId])]));
        toast.error(err instanceof Error ? err.message : tShell("saveFailed"));
        return;
      }
      // Removing is reversible: Undo instead of a confirm.
      if (!on && !isUndo) {
        const name = tagsById.get(tagId)?.name ?? "";
        undoToast(tShell("tagRemoved", { name }), tShell("undo"), () => void setTag(tagId, true, true));
      }
    },
    [contactId, tagsById, tShell],
  );

  /* ---------------- custom fields ---------------- */

  const saveField = useCallback(
    async (fieldId: string, value: string) => {
      if (!contactId) return;
      const previous = values[fieldId] ?? "";
      setValues((prev) => ({ ...prev, [fieldId]: value }));
      const supabase = createClient();
      const { error } = value
        ? await supabase
            .from("contact_custom_values")
            .upsert(
              { contact_id: contactId, custom_field_id: fieldId, value },
              { onConflict: "contact_id,custom_field_id" },
            )
        : await supabase
            .from("contact_custom_values")
            .delete()
            .eq("contact_id", contactId)
            .eq("custom_field_id", fieldId);
      if (error) {
        setValues((prev) => ({ ...prev, [fieldId]: previous }));
        toast.error(tShell("saveFailed"));
      }
    },
    [contactId, values, tShell],
  );

  /* ---------------- deals ---------------- */

  const patchDeal = useCallback((id: string, patch: Partial<Deal>) => {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const moveDeal = useCallback(
    async (deal: Deal, stage: PipelineStage, isUndo = false) => {
      if (deal.stage_id === stage.id) return;
      const previous = { stage_id: deal.stage_id, stage: deal.stage };
      patchDeal(deal.id, { stage_id: stage.id, stage });
      const { error } = await createClient().from("deals").update({ stage_id: stage.id }).eq("id", deal.id);
      if (error) {
        patchDeal(deal.id, previous);
        toast.error(tShell("saveFailed"));
        return;
      }
      if (isUndo) return;
      if (isWonStage(stage)) celebrateWon();
      const back = previous.stage;
      undoToast(tShell("movedTo", { stage: stage.name }), tShell("undo"), () => {
        if (back) void moveDeal({ ...deal, stage_id: stage.id, stage }, back, true);
      });
    },
    [patchDeal, tShell],
  );

  const saveDealValue = useCallback(
    async (deal: Deal, raw: string) => {
      const value = Number(raw.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(value)) return;
      const previous = deal.value;
      patchDeal(deal.id, { value });
      const { error } = await createClient().from("deals").update({ value }).eq("id", deal.id);
      if (error) {
        patchDeal(deal.id, { value: previous });
        toast.error(tShell("saveFailed"));
      }
    },
    [patchDeal, tShell],
  );

  /* ---------------- notes ---------------- */

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim() || !accountId) return;
    setAddingNote(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: session?.user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();
    if (!error && data) {
      setNotes((prev) => [data as ContactNote, ...prev]);
      setNewNote("");
    } else {
      toast.error(tShell("saveFailed"));
    }
    setAddingNote(false);
  }, [contact, newNote, accountId, tShell]);

  /* ---------------- recent activity ---------------- */

  const activity = useMemo(() => {
    if (!contact) return [];
    const items: { at: string; label: string }[] = [];
    if (contact.created_at) items.push({ at: contact.created_at, label: t("activityContactAdded") });
    if (conversation?.created_at) items.push({ at: conversation.created_at, label: t("activityConversation") });
    for (const d of deals) items.push({ at: d.created_at, label: t("activityDeal", { title: d.title }) });
    for (const n of notes) items.push({ at: n.created_at, label: t("activityNote") });
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [contact, conversation?.created_at, deals, notes, t]);

  if (!contact) {
    return (
      <div className="flex h-full w-80 items-center justify-center border-l border-border bg-card px-6 text-center">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const assignee = team.find((p) => p.user_id === conversation?.assigned_agent_id);
  const appliedTags = tagIds.map((id) => tagsById.get(id)).filter((x): x is Tag => !!x);

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <h2 className="flex-1 text-[15px] font-semibold text-foreground">{t("contactInfo")}</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={tShell("closeDetails")}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {/* Identity */}
          <div className="flex flex-col items-center text-center">
            <ContactAvatar name={displayName} seed={contact.id} src={contact.avatar_url} size="xl" />
            <div className="mt-2 w-full">
              <InlineText
                value={contact.name ?? ""}
                placeholder={displayName}
                label={t("name")}
                disabled={!canEdit}
                onSave={(v) => void saveContactField("name", v)}
                className="justify-center text-center text-base font-semibold"
                inputClassName="text-center text-base font-semibold"
              />
            </div>
          </div>

          <div className="mt-3 space-y-0.5">
            <button
              type="button"
              onClick={handleCopyPhone}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-foreground transition-colors duration-150 hover:bg-accent"
            >
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">{contactHandle(contact)}</span>
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 text-faint" />}
            </button>
            <FieldRow icon={Mail}>
              <InlineText
                type="email"
                value={contact.email ?? ""}
                placeholder={t("addEmail")}
                label={t("email")}
                disabled={!canEdit}
                onSave={(v) => void saveContactField("email", v)}
              />
            </FieldRow>
            <FieldRow icon={Building2}>
              <InlineText
                value={contact.company ?? ""}
                placeholder={t("addCompany")}
                label={t("company")}
                disabled={!canEdit}
                onSave={(v) => void saveContactField("company", v)}
              />
            </FieldRow>
          </div>

          {/* Assignee */}
          {conversation && onAssignChange ? (
            <Section icon={UserRound} title={t("assignee")}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={!canEdit}
                  className="flex h-9 w-full items-center gap-2 rounded-md border border-border px-2 text-left text-[13px] transition-colors duration-150 hover:border-border-strong disabled:opacity-60"
                >
                  {assignee ? (
                    <ContactAvatar
                      name={assignee.full_name || "?"}
                      seed={assignee.user_id}
                      src={assignee.avatar_url}
                      size="xs"
                      className="size-5 text-[9px]"
                    />
                  ) : null}
                  <span className={cn("min-w-0 flex-1 truncate", !assignee && "text-muted-foreground")}>
                    {assignee?.full_name ?? t("unassigned")}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-(--anchor-width)">
                  {team.map((p) => (
                    <DropdownMenuItem key={p.user_id} onClick={() => void assign(p.user_id)}>
                      <ContactAvatar name={p.full_name || "?"} seed={p.user_id} src={p.avatar_url} size="xs" className="size-5 text-[9px]" />
                      <span className="flex-1 truncate">{p.full_name}</span>
                      {p.user_id === conversation.assigned_agent_id ? <Check className="size-3.5" /> : null}
                    </DropdownMenuItem>
                  ))}
                  {conversation.assigned_agent_id ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => void assign(null)}>{t("unassign")}</DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </Section>
          ) : null}

          {/* Tags */}
          <Section
            icon={TagIcon}
            title={t("tags")}
            action={
              canEdit && allTags.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={t("addTag")}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 w-52">
                    {allTags.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked={tagIds.includes(tag.id)}
                        onCheckedChange={(on) => void setTag(tag.id, !!on)}
                      >
                        <span className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span className="truncate">{tag.name}</span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null
            }
          >
            {!loaded ? (
              <Skeleton className="h-6 w-2/3" />
            ) : appliedTags.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">{t("noTags")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {appliedTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2 text-[11px] font-medium text-foreground"
                  >
                    {/* Tag colour is user data, picked per tag in Settings. */}
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void setTag(tag.id, false)}
                        aria-label={t("removeTag", { name: tag.name })}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* Custom fields */}
          {fields.length > 0 ? (
            <Section icon={SlidersHorizontal} title={t("customFields")}>
              <div className="space-y-0.5">
                {fields.map((f) => (
                  <div key={f.id} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-1">
                    <span className="truncate px-1 text-xs text-muted-foreground" title={f.field_name}>
                      {f.field_name}
                    </span>
                    <InlineText
                      type={f.field_type === "number" ? "number" : "text"}
                      value={values[f.id] ?? ""}
                      placeholder={t("emptyValue")}
                      label={f.field_name}
                      disabled={!canEdit}
                      onSave={(v) => void saveField(f.id, v)}
                    />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Deals */}
          <Section icon={Wallet} title={t("deals")}>
            {!loaded ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : deals.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">{t("noDeals")}</p>
            ) : (
              <div className="space-y-2">
                {deals.map((deal) => {
                  const stages = stagesByPipeline[deal.pipeline_id] ?? [];
                  return (
                    <div key={deal.id} className="rounded-lg border border-border bg-card-2 p-2.5">
                      <p className="truncate px-1 text-[13px] font-medium text-foreground">{deal.title}</p>
                      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                        <InlineText
                          type="number"
                          value={String(deal.value ?? 0)}
                          display={formatCurrency(deal.value, deal.currency ?? undefined)}
                          placeholder="0"
                          label={t("dealValue")}
                          disabled={!canEdit}
                          onSave={(v) => void saveDealValue(deal, v)}
                          className="font-semibold tabular-nums"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={!canEdit || stages.length === 0}
                            className="inline-flex h-7 max-w-36 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-foreground transition-colors duration-150 hover:border-border-strong disabled:opacity-60"
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              // Stage colour is user data, picked per stage.
                              style={{ backgroundColor: deal.stage?.color }}
                            />
                            <span className="truncate">{deal.stage?.name ?? t("stage")}</span>
                            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {stages.map((s) => (
                              <DropdownMenuItem key={s.id} onClick={() => void moveDeal(deal, s)}>
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                                <span className="flex-1 truncate">{s.name}</span>
                                {s.id === deal.stage_id ? <Check className="size-3.5" /> : null}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Notes */}
          <Section icon={StickyNote} title={t("notes")}>
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void handleAddNote();
                }}
                placeholder={t("addNotePlaceholder")}
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60"
              />
              <Button
                size="sm"
                className="h-auto px-2"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
                aria-label={t("addNote")}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs whitespace-pre-wrap text-foreground/90">{note.note_text}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* Recent activity */}
          {activity.length > 0 ? (
            <Section icon={Activity} title={t("activity")}>
              <ol className="space-y-2 border-l border-border pl-3">
                {activity.map((item, i) => (
                  <li key={`${item.at}-${i}`} className="relative text-xs">
                    <span aria-hidden className="absolute top-1.5 -left-[15.5px] size-1.5 rounded-full bg-border-strong" />
                    <span className="text-foreground/90">{item.label}</span>
                    <span className="ml-1.5 text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(item.at), { addSuffix: true })}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Activity;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon className="size-3.5 text-muted-foreground" />
        <h3 className="flex-1 text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldRow({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0">
      <Icon className="ml-2 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
