-- Saved-template writes only while match is upcoming; explicit branch for unknown enum values.

create or replace function public.assert_match_squad_editable(p_match_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_status public.match_status;
begin
  select status into v_match_status from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if v_match_status is distinct from 'upcoming'::public.match_status then
    if v_match_status in ('completed', 'in_review') then
      raise exception 'match has finished';
    elsif v_match_status = 'live' then
      raise exception 'team lock deadline has passed';
    else
      raise exception 'match is not open for new contests';
    end if;
  end if;
end;
$$;
