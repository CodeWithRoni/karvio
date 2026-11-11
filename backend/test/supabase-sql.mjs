// Produce a transaction-rolled-back hosted test. No test shop records are retained.
import fs from 'node:fs';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
import {createRuntime,hash} from '../../supabase/functions/karvio-api/runtime.mjs';
const state={revision:0,metadata:{properties:{},cache:{},privateSheets:{}},tables:Object.fromEntries(Object.keys(schema).map(n=>[n,[]])),requiresSetup:true};
const runtime=createRuntime(state),result=runtime.initialize({name:'Rolled back SQL fixture',password:'fixture-password-not-real'});
if(!result.response.ok)throw new Error(result.response.error);
const key=hash('sql-transaction-fixture');
const literal=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
const sql=`begin;
set local safeupdate.enabled = on;
update karvio_private.runtime set setup_hash='${key}' where id;
set local role service_role;
do $$ declare outcome jsonb; saved_revision bigint; begin
 if position('where _position >= 2' in pg_get_functiondef('public.karvio_commit(bigint,jsonb,jsonb,text,boolean,text,jsonb)'::regprocedure))=0 then
   raise exception 'REST safeupdate-compatible row scope is missing';
 end if;
 select revision into saved_revision from karvio_private.runtime where id;
 outcome:=public.karvio_commit(saved_revision,${literal(result.changes)},${literal(result.metadata)},'${key}',true);
 if not (outcome->>'committed')::boolean then raise exception 'Initialization did not commit'; end if;
 if (select count(*) from public."Users")<>1 then raise exception 'Owner missing'; end if;
 if (public.karvio_snapshot()->>'requiresSetup')::boolean then raise exception 'Setup key was not consumed'; end if;
 outcome:=public.karvio_commit(saved_revision,'{}','{}');
 if (outcome->>'committed')::boolean then raise exception 'Stale revision incorrectly committed'; end if;
 begin
   perform public.karvio_commit(saved_revision+1,'{"Users":[{"_position":2,"id":"invalid","active":"bad-boolean"}]}','{}');
   raise exception 'Invalid row unexpectedly committed';
 exception when invalid_text_representation then null;
 end;
 if (select count(*) from public."Users")<>1 or not exists(select 1 from public."Users" where username='admin') then raise exception 'Failed insert destroyed owner'; end if;
 if not public.karvio_rate_limit('sql-test',1,60) or public.karvio_rate_limit('sql-test',1,60) then raise exception 'Rate limit failed'; end if;
end $$;
select 'transaction, stale revision, rollback, owner setup and rate limiting passed' as verification;
rollback;`;
fs.writeFileSync(process.argv[2],sql);
