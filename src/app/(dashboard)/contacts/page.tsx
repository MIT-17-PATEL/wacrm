'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Bookmark,
  BookmarkPlus,
  Search,
  Plus,
  Upload,
  Pencil,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  X,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { ContactAvatar } from '@/components/ui/contact-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { phoneCountry } from '@/lib/phone-country';
import { cn } from '@/lib/utils';
import {
  SAVE_VIEW_EVENT,
  useSavedViews,
  writeViews,
  type SavedView,
} from '@/lib/contacts/saved-views';
import { useFormatter, useTranslations } from 'next-intl';

const PAGE_SIZE = 25;

/** Row = contact + the ids of its tags (resolved against tagsMap at render). */
interface ContactRow extends Contact {
  tagIds: string[];
}

/** `?since=7d` → ISO timestamp a week ago ("New this week" segment). */
function sinceFromParam(value: string | null): string | null {
  if (value !== '7d') return null;
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

// `useSearchParams` (the `?q=` deep link from the command palette)
// needs a Suspense boundary for static prerendering.
export default function ContactsPage() {
  return (
    <Suspense fallback={null}>
      <ContactsPageKeyed />
    </Suspense>
  );
}

// Re-mount on new filter params (`?q=`, `?tags=`, `?since=`) so the
// palette and the context panel's segments apply while already here.
function ContactsPageKeyed() {
  const params = useSearchParams().toString();
  return <ContactsPageInner key={params} />;
}

function ContactsPageInner() {
  const t = useTranslations('Contacts.page');
  const tGate = useTranslations('GatedButton');
  const format = useFormatter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() =>
    (searchParams.get('tags') ?? '').split(',').filter(Boolean),
  );
  // "New this week" segment. Only applies without a tag filter (the tag
  // RPC has no date parameter); the panel never combines the two.
  const [since] = useState(() => sinceFromParam(searchParams.get('since')));

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Saved views (device-local), shared live with the context panel.
  const views = useSavedViews();

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  // Loading bug fix: previously the spinner only cleared after a second,
  // chained contact_tags query, and the fetch depended on `tagsMap` — so
  // the tag list arriving re-created the fetch and superseded the first
  // run mid-flight. The total count had already been committed ("1 total
  // contacts") while the table stayed on "Loading…". Now rows render as
  // soon as the contacts query lands, tag ids are filled in afterwards
  // (resolved against tagsMap at render time, so it is no longer a
  // dependency), and `finally` guarantees loading ends.
  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    const isCurrent = () => seq === fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    try {
      let contactRows: Contact[];
      let count: number;

      if (selectedTagIds.length > 0) {
        // Tag filter active — resolve it server-side (join + distinct +
        // windowed total count + pagination) so a tag covering many
        // contacts can't silently truncate the result or overflow an IN
        // clause. See migration 025_filter_contacts_by_tags.
        const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
          p_tag_ids: selectedTagIds,
          p_search: term || null,
          p_limit: PAGE_SIZE,
          p_offset: from,
        });
        if (!isCurrent()) return; // superseded by a newer fetch
        if (error) {
          toast.error(t('toastFailedLoad'));
          return;
        }
        const rows = (data ?? []) as { contact: Contact; total_count: number }[];
        contactRows = rows.map((r) => r.contact);
        count = rows.length > 0 ? Number(rows[0].total_count) : 0;
      } else {
        let query = supabase
          .from('contacts')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (since) query = query.gte('created_at', since);

        if (term) {
          const like = `%${term}%`;
          query = query.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
        }

        const { data, count: exactCount, error } = await query;
        if (!isCurrent()) return; // superseded by a newer fetch
        if (error) {
          toast.error(t('toastFailedLoad'));
          return;
        }
        contactRows = data ?? [];
        count = exactCount ?? 0;
      }

      setTotalCount(count);
      setContacts(contactRows.map((c) => ({ ...c, tagIds: [] })));
      setLoading(false);

      if (contactRows.length === 0) return;

      // Tags for these contacts — fills in after the rows are visible.
      const contactIds = contactRows.map((c) => c.id);
      const { data: contactTags } = await supabase
        .from('contact_tags')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds);
      if (!isCurrent()) return;

      const tagsByContact: Record<string, string[]> = {};
      contactTags?.forEach((ct) => {
        if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
        tagsByContact[ct.contact_id].push(ct.tag_id);
      });
      setContacts((prev) =>
        prev.map((c) => ({ ...c, tagIds: tagsByContact[c.id] ?? [] })),
      );
    } catch (err) {
      console.error('[contacts] fetch failed:', err);
      if (isCurrent()) toast.error(t('toastFailedLoad'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [supabase, page, search, selectedTagIds, since, t]);

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
     
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
     
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  async function handleDelete(contact: Contact) {
    const ok = await confirm({
      title: t('deleteContactTitle'),
      description: t('deleteContactDesc', { name: contact.name || contact.phone || '' }),
      confirmLabel: t('deleteBtn'),
    });
    if (!ok) return;

    const { error } = await supabase.from('contacts').delete().eq('id', contact.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
    }
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: t('deleteBulkTitle'),
      description: t('deleteBulkDesc', { count: ids.length }),
      confirmLabel: t('deleteBtn'),
    });
    if (!ok) return;

    const { error } = await supabase.from('contacts').delete().in('id', ids);

    if (error) {
      toast.error(t('toastBulkFailedDelete'));
    } else {
      toast.success(t('toastBulkDeleted', { count: ids.length }));
      setSelected(new Set());
      fetchContacts();
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters = search.trim().length > 0 || selectedTagIds.length > 0;

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  function saveCurrentView() {
    const parts = [
      search.trim(),
      ...selectedTagIds.map((id) => tagsMap[id]?.name).filter(Boolean),
    ];
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: parts.join(' · ').slice(0, 40) || t('viewUntitled'),
      search: search.trim(),
      tagIds: selectedTagIds,
    };
    writeViews([...views, view]);
    toast.success(t('viewSaved'));
  }

  // "+ New segment" in the context panel: save the current filter, or
  // point the user at the search box when there's nothing to save yet.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveViewRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveViewRef.current = () => {
      if (hasActiveFilters) saveCurrentView();
      else {
        toast(t('segmentHint'));
        searchInputRef.current?.focus();
      }
    };
  });
  useEffect(() => {
    const onSave = () => saveViewRef.current();
    window.addEventListener(SAVE_VIEW_EVENT, onSave);
    return () => window.removeEventListener(SAVE_VIEW_EVENT, onSave);
  }, []);

  function applyView(view: SavedView) {
    setSearch(view.search);
    setSelectedTagIds(view.tagIds.filter((id) => !Object.keys(tagsMap).length || tagsMap[id]));
    setPage(0);
  }

  function removeView(id: string) {
    writeViews(views.filter((v) => v.id !== id));
  }

  const isActiveView = (v: SavedView) =>
    v.search === search.trim() &&
    v.tagIds.length === selectedTagIds.length &&
    v.tagIds.every((id) => selectedTagIds.includes(id));

  return (
    <div className="space-y-5">
      <PageHeader
        tile=""
        icon={Users}
        title={t('title')}
        description={
          totalCount > 0 ? t('subtitle', { count: totalCount }) : t('subtitleZero')
        }
        actions={
          <>
            {canEditSettings && (
              <Button variant="outline" onClick={() => setCustomFieldsOpen(true)}>
                <SlidersHorizontal className="size-4" />
                {t('customFieldsBtn')}
              </Button>
            )}
            <GatedButton
              variant="outline"
              canAct={canEdit}
              gateReason={tGate('reasons.addOrImportContacts')}
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-4" />
              {t('importBtn')}
            </GatedButton>
            <GatedButton
              canAct={canEdit}
              gateReason={tGate('reasons.addOrImportContacts')}
              onClick={openAddForm}
            >
              <Plus className="size-4" />
              {t('addContactBtn')}
            </GatedButton>
          </>
        }
      />

      {/* Search + tag filter + saved views */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Reset pagination when the query changes — the result
                // set shrinks/grows, page N may no longer be valid.
                setPage(0);
              }}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="h-10 rounded-xl pl-9"
            />
          </div>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" className="h-10 shrink-0" />}>
              <Filter className="size-4" />
              {t('filterByTags')}
              {selectedTagIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-popover-foreground">
                  {t('filterByTags')}
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('clearAll')}
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t('noTagsYet')}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={t('filterByTag', { name: tag.name })}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate text-sm text-popover-foreground">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {hasActiveFilters && !views.some(isActiveView) ? (
            <Button variant="ghost" className="h-10 shrink-0" onClick={saveCurrentView}>
              <BookmarkPlus className="size-4" />
              {t('saveView')}
            </Button>
          ) : null}
        </div>

        {views.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 lg:hidden" aria-label={t('savedViews')}>
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground ">
              {t('savedViews')}
            </span>
            {views.map((v) => {
              const active = isActiveView(v);
              return (
                <span
                  key={v.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-border-strong bg-muted text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <button type="button" onClick={() => applyView(v)} className="inline-flex items-center gap-1">
                    <Bookmark className="size-3" />
                    {v.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeView(v.id)}
                    aria-label={t('removeView', { name: v.name })}
                    className="rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        {/* Active tag-filter chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <TagChip key={id} tag={tag}>
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={t('removeTagFilter', { name: tag.name })}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </TagChip>
              );
            })}
            <button
              onClick={clearTagFilters}
              className="px-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="bg-popover sticky top-2 z-20 flex items-center justify-between gap-4 rounded-2xl border border-border-strong px-4 py-2.5 shadow-raised">
          <p className="text-sm font-semibold text-foreground">
            {t('selectedCount', { count: selected.size })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              {t('clearSelection')}
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason={tGate('reasons.deleteContacts')}
              onClick={handleBulkDelete}
            >
              <Trash2 className="size-4" />
              {t('deleteSelected')}
            </GatedButton>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="max-h-[calc(100dvh-20rem)] min-h-64 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={contacts.length === 0}
                    aria-label={t('selectAllOnPage')}
                  />
                </TableHead>
                <TableHead>{t('tableColumns.name')}</TableHead>
                <TableHead>{t('tableColumns.phone')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('tableColumns.email')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('tableColumns.company')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('tableColumns.tags')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('tableColumns.createdAt')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent" style={{ opacity: 1 - i * 0.09 }}>
                    <TableCell className="pl-4">
                      <Skeleton className="size-4 rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-full" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-28" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-3.5 w-36" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-3.5 w-24" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-3.5 w-20" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : contacts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="whitespace-normal">
                    <EmptyState
                      illustration={hasActiveFilters ? 'search' : 'contacts'}
                      title={hasActiveFilters ? t('noContactsMatch') : t('noContactsYet')}
                      description={hasActiveFilters ? undefined : t('noContactsHint')}
                      action={
                        hasActiveFilters ? undefined : (
                          <GatedButton
                            canAct={canEdit}
                            gateReason={tGate('reasons.addOrImportContacts')}
                            onClick={openAddForm}
                          >
                            <Plus className="size-4" />
                            {t('addFirstContact')}
                          </GatedButton>
                        )
                      }
                      secondaryAction={
                        hasActiveFilters ? undefined : (
                          <GatedButton
                            variant="outline"
                            canAct={canEdit}
                            gateReason={tGate('reasons.addOrImportContacts')}
                            onClick={() => setImportOpen(true)}
                          >
                            <Upload className="size-4" />
                            {t('importBtn')}
                          </GatedButton>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => {
                  const name = contact.name || contact.phone || t('unnamed');
                  const tags = contact.tagIds.map((id) => tagsMap[id]).filter(Boolean);
                  const country = phoneCountry(contact.phone);
                  const isSelected = selected.has(contact.id);
                  return (
                    <TableRow
                      key={contact.id}
                      data-state={isSelected ? 'selected' : undefined}
                      className="group cursor-pointer"
                      onClick={() => openDetail(contact.id)}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(contact.id)}
                          aria-label={t('selectContact', { name })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ContactAvatar
                            name={name}
                            seed={contact.id}
                            src={contact.avatar_url}
                            size="sm"
                            className="size-9"
                          />
                          {contact.name ? (
                            <span className="font-semibold text-foreground">{contact.name}</span>
                          ) : (
                            <span className="text-muted-foreground italic">{t('unnamed')}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px] text-foreground/85 tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          {country ? (
                            <span title={country.iso} aria-label={country.iso} className="text-base leading-none">
                              {country.flag}
                            </span>
                          ) : null}
                          {contact.phone}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-[13px] text-muted-foreground md:table-cell">
                        {contact.email || '—'}
                      </TableCell>
                      <TableCell className="hidden text-[13px] text-muted-foreground lg:table-cell">
                        {contact.company || '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.length > 0 ? (
                            tags.slice(0, 3).map((tag) => <TagChip key={tag.id} tag={tag} />)
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {tags.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{tags.length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {format.dateTime(new Date(contact.created_at), {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="pr-3" onClick={(e) => e.stopPropagation()}>
                        {/* Hover actions (always visible on touch screens). */}
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditForm(contact)}
                            aria-label={`${t('editAction')} ${name}`}
                            title={t('editAction')}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <GatedButton
                            variant="ghost"
                            size="icon-sm"
                            canAct={canEdit}
                            gateReason={tGate('reasons.deleteContacts')}
                            onClick={() => handleDelete(contact)}
                            aria-label={`${t('deleteAction')} ${name}`}
                            title={t('deleteAction')}
                            className="hover:bg-destructive/12 hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </GatedButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              aria-label={t('previousPage')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              {t('pageCount', { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              aria-label={t('nextPage')}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}
    </div>
  );
}

/** Tag pill tinted with the tag's own (user-chosen) colour. */
function TagChip({ tag, children }: { tag: Tag; children?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset"
      style={{
        backgroundColor: `color-mix(in oklab, ${tag.color} 14%, transparent)`,
        color: `color-mix(in oklab, ${tag.color} 75%, var(--foreground))`,
        // ring colour via CSS var so it follows the tag colour
        ['--tw-ring-color' as string]: `color-mix(in oklab, ${tag.color} 30%, transparent)`,
      }}
    >
      {tag.name}
      {children}
    </span>
  );
}
