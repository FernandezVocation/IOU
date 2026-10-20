-- IOU 0019: an icon for custom checklist item types. Run AFTER 0018. Safe to run more than once.
alter table public.checklist_items add column if not exists type_icon text not null default '' check (char_length(type_icon) <= 40);
grant update (type_icon) on public.checklist_items to authenticated;

-- The read-only link also carries the icon (it is only a picture name, nothing private).
create or replace function public.get_shared_checklist(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.checklist_links; c public.checklists; res jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.checklist_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into c from public.checklists where id = l.checklist_id;
  select jsonb_build_object(
    'checklist', jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color),
    'label', l.label, 'include_notes', l.include_notes,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'type', i.type, 'type_label', i.type_label, 'type_icon', i.type_icon, 'title', i.title,
        'notes', case when l.include_notes then i.notes else '' end,
        'status', i.status, 'due_on', i.due_on, 'assigned_name', i.assigned_name,
        'completed_by_name', i.completed_by_name, 'completed_at', i.completed_at,
        'qty', i.qty, 'packed_in', i.packed_in)
        order by i.due_on nulls last, i.created_at)
      from public.checklist_items i where i.checklist_id = l.checklist_id), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.get_shared_checklist(text) from public;
grant execute on function public.get_shared_checklist(text) to anon, authenticated;
notify pgrst, 'reload schema';
