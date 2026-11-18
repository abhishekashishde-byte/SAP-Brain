-- Transactional carry-forward. SECURITY INVOKER and explicit auth.uid() ownership.
create or replace function public.discovery_next_session(_previous uuid,_meeting_date date)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 p public.discovery_workshops%rowtype;
 v_engagement uuid; v_new uuid; v_no int; n uuid; r record;
 source_ids jsonb:='{}'::jsonb; stakeholder_ids jsonb:='{}'::jsonb;
 request_ids jsonb:='{}'::jsonb; todo_ids jsonb:='{}'::jsonb;
 copied_sources uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if _meeting_date is null then raise exception 'Meeting date required';end if;
 select * into p from public.discovery_workshops where id=_previous and owner_id=auth.uid() for update;
 if not found then raise exception 'Workshop not found';end if;
 v_engagement:=p.engagement_id;
 if v_engagement is null then
  insert into public.discovery_engagements(owner_id,client_name,title)
  values(auth.uid(),p.client_name,coalesce(nullif(p.project_name,''),p.title)) returning id into v_engagement;
  update public.discovery_workshops set engagement_id=v_engagement,session_no=1 where id=p.id;
 end if;
 perform pg_advisory_xact_lock(hashtext(v_engagement::text));
 select coalesce(max(session_no),0)+1 into v_no from public.discovery_workshops where engagement_id=v_engagement;
 insert into public.discovery_workshops(owner_id,client_name,title,project_name,consultant_name,call_date,start_time,end_time,participants,legacy_system,catalog_id,catalog_version,scope_areas,status,engagement_id,session_no,previous_workshop_id,client_language)
 values(auth.uid(),p.client_name,p.title,p.project_name,p.consultant_name,_meeting_date,null,null,p.participants,p.legacy_system,p.catalog_id,p.catalog_version,p.scope_areas,'active',v_engagement,v_no,p.id,p.client_language)
 returning id into v_new;

 for r in select * from public.discovery_source_systems where workshop_id=p.id loop
  insert into public.discovery_source_systems(workshop_id,name,system_type,version,owner,notes,carried_from)
  values(v_new,r.name,r.system_type,r.version,r.owner,r.notes,r.id::text) returning id into n;
  source_ids:=source_ids||jsonb_build_object(r.id::text,n::text);
 end loop;
 for r in select * from public.discovery_stakeholders where workshop_id=p.id loop
  insert into public.discovery_stakeholders(workshop_id,name,organisation,function_role,project_role,responsible_for,present,contact,note,is_internal,sort_order,carried_from)
  values(v_new,r.name,r.organisation,r.function_role,r.project_role,r.responsible_for,false,r.contact,r.note,r.is_internal,r.sort_order,r.id::text) returning id into n;
  stakeholder_ids:=stakeholder_ids||jsonb_build_object(r.id::text,n::text);
 end loop;
 for r in select * from public.discovery_object_sources where workshop_id=p.id loop
  select coalesce(array_agg((source_ids->>x::text)::uuid),array[]::uuid[]) into copied_sources
   from unnest(r.source_system_ids) x where source_ids ? x::text;
  insert into public.discovery_object_sources(workshop_id,object_id,source_system_ids,not_maintained,note,carried_from)
  values(v_new,r.object_id,copied_sources,r.not_maintained,r.note,r.object_id);
 end loop;
 for r in select * from public.discovery_entries where workshop_id=p.id loop
  insert into public.discovery_entries(workshop_id,object_id,item_type,item_id,value,note,is_internal,carried_from)
  values(v_new,r.object_id,r.item_type,r.item_id,
   case when r.value ? 'decided_by' and stakeholder_ids ? (r.value->>'decided_by')
   then jsonb_set(r.value,'{decided_by}',to_jsonb(stakeholder_ids->>(r.value->>'decided_by')))
   else r.value end,
   r.note,r.is_internal,r.object_id||'/'||r.item_type||'/'||r.item_id);
 end loop;
 for r in select * from public.discovery_sizing where workshop_id=p.id loop
  insert into public.discovery_sizing(workshop_id,metric_id,value,approx,source,custom_label,custom_unit,note,carried_from)
  values(v_new,r.metric_id,r.value,r.approx,r.source,r.custom_label,r.custom_unit,r.note,r.metric_id);
 end loop;
 for r in select * from public.discovery_legacy_fields where workshop_id=p.id loop
  insert into public.discovery_legacy_fields(workshop_id,object_id,source_system_id,source_field,meaning,used_today,sap_handling,sap_target,sap_catalog_field_id,note,origin,sort_order,carried_from)
  values(v_new,r.object_id,nullif(source_ids->>r.source_system_id::text,'')::uuid,r.source_field,r.meaning,r.used_today,r.sap_handling,r.sap_target,r.sap_catalog_field_id,r.note,r.origin,r.sort_order,r.id::text);
 end loop;
 for r in select * from public.discovery_process_entries where workshop_id=p.id loop
  insert into public.discovery_process_entries(workshop_id,process_id,status,frequency,run_window,volume,responsible,today,answers,note,is_internal,custom,carried_from)
  values(v_new,r.process_id,r.status,r.frequency,r.run_window,r.volume,r.responsible,r.today,r.answers,r.note,r.is_internal,r.custom,r.process_id);
 end loop;
 for r in select * from public.discovery_drivers where workshop_id=p.id loop
  insert into public.discovery_drivers(workshop_id,kind,text,priority,raised_by,affected,kpi,baseline,note,sort_order,carried_from)
  values(v_new,r.kind,r.text,r.priority,nullif(stakeholder_ids->>r.raised_by::text,'')::uuid,r.affected,r.kpi,r.baseline,r.note,r.sort_order,r.id::text);
 end loop;
 for r in select * from public.discovery_todos where workshop_id=p.id and done=false loop
  insert into public.discovery_todos(workshop_id,object_id,text,owner,due_date,done,carried_from)
  values(v_new,r.object_id,r.text,r.owner,r.due_date,false,r.id::text) returning id into n;
  todo_ids:=todo_ids||jsonb_build_object(r.id::text,n::text);
 end loop;
 for r in select * from public.discovery_requests where workshop_id=p.id and status='open' loop
  insert into public.discovery_requests(workshop_id,item,related_id,format,from_stakeholder,due_date,status,note,carried_from)
  values(v_new,r.item,r.related_id,r.format,nullif(stakeholder_ids->>r.from_stakeholder::text,'')::uuid,r.due_date,'open',r.note,r.id::text) returning id into n;
  request_ids:=request_ids||jsonb_build_object(r.id::text,n::text);
 end loop;
 for r in select * from public.discovery_parking where workshop_id=p.id and status<>'dropped' loop
  insert into public.discovery_parking(workshop_id,text,context_id,status,todo_id,note,carried_from)
  values(v_new,r.text,r.context_id,r.status,nullif(todo_ids->>r.todo_id::text,'')::uuid,r.note,r.id::text);
 end loop;
 for r in select * from public.discovery_gaps where workshop_id=p.id loop
  insert into public.discovery_gaps(workshop_id,seq,title,description,related_id,origin,origin_ref,gap_type,ricefw,size,priority,owner,owner_stakeholder,status,solution_idea,note,is_internal_solution,carried_from)
  values(v_new,r.seq,r.title,r.description,r.related_id,r.origin,r.origin_ref,r.gap_type,r.ricefw,r.size,r.priority,r.owner,nullif(stakeholder_ids->>r.owner_stakeholder::text,'')::uuid,r.status,r.solution_idea,r.note,r.is_internal_solution,r.id::text);
 end loop;
 insert into public.discovery_gap_ignored(workshop_id,origin,origin_ref)
 select v_new,origin,origin_ref from public.discovery_gap_ignored where workshop_id=p.id;
 for r in select * from public.discovery_interfaces where workshop_id=p.id loop
  insert into public.discovery_interfaces(workshop_id,name,partner_system,direction,related_id,data_text,frequency,volume,technology,exists_today,owner_stakeholder,status,note,carried_from)
  values(v_new,r.name,r.partner_system,r.direction,r.related_id,r.data_text,r.frequency,r.volume,r.technology,r.exists_today,nullif(stakeholder_ids->>r.owner_stakeholder::text,'')::uuid,r.status,r.note,r.id::text);
 end loop;
 for r in select * from public.discovery_forms_reports where workshop_id=p.id loop
  insert into public.discovery_forms_reports(workshop_id,name,kind,related_id,used_by,frequency,today_in,sample_received,request_id,decision,note,carried_from)
  values(v_new,r.name,r.kind,r.related_id,r.used_by,r.frequency,r.today_in,r.sample_received,nullif(request_ids->>r.request_id::text,'')::uuid,r.decision,r.note,r.id::text);
 end loop;
 for r in select * from public.discovery_raid where workshop_id=p.id loop
  insert into public.discovery_raid(workshop_id,kind,text,related_id,probability,impact,mitigation,owner_stakeholder,status,note,is_internal,carried_from)
  values(v_new,r.kind,r.text,r.related_id,r.probability,r.impact,r.mitigation,nullif(stakeholder_ids->>r.owner_stakeholder::text,'')::uuid,r.status,r.note,r.is_internal,r.id::text);
 end loop;
 return v_new;
end $$;
revoke all on function public.discovery_next_session(uuid,date) from public;
grant execute on function public.discovery_next_session(uuid,date) to authenticated;
