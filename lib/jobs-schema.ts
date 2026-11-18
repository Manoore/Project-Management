import type { sql as database } from './db';
export async function ensureJobsSchema(db:NonNullable<typeof database>){
  const statements:ReturnType<typeof db>[]=[];
  const sql=(strings:TemplateStringsArray,...values:any[])=>{statements.push(db(strings,...values));};
  sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT 'UTC'`;
  sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`;
  sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id)`;
  sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT`;
  sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subject_date DATE`;
  sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT FALSE`;
  sql`CREATE UNIQUE INDEX IF NOT EXISTS notification_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL`;
  sql`CREATE INDEX IF NOT EXISTS notification_inbox ON notifications(employee_name,available_at,id)`;
  sql`CREATE TABLE IF NOT EXISTS recurring_schedules(id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',owner TEXT NOT NULL,priority TEXT NOT NULL DEFAULT 'Normal',labels TEXT[] NOT NULL DEFAULT ARRAY[]::text[],module_id INTEGER REFERENCES project_modules(id),cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),every_n INTEGER NOT NULL CHECK(every_n BETWEEN 1 AND 365),start_date DATE NOT NULL,end_date DATE, next_index INTEGER NOT NULL DEFAULT 0 CHECK(next_index>=0),enabled BOOLEAN NOT NULL DEFAULT TRUE,archived BOOLEAN NOT NULL DEFAULT FALSE,created_by TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,last_run_at TIMESTAMPTZ,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(end_date IS NULL OR end_date>=start_date))`;
  sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_id INTEGER REFERENCES recurring_schedules(id)`;
  sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_date DATE`;
  sql`CREATE UNIQUE INDEX IF NOT EXISTS task_recurrence_occurrence ON tasks(recurrence_id,recurrence_date) WHERE recurrence_id IS NOT NULL`;
  sql`CREATE TABLE IF NOT EXISTS scheduler_runs(id BIGSERIAL PRIMARY KEY,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),status TEXT NOT NULL,generated_tasks INTEGER NOT NULL DEFAULT 0,reminders INTEGER NOT NULL DEFAULT 0,schedules_examined INTEGER NOT NULL DEFAULT 0,has_more BOOLEAN NOT NULL DEFAULT FALSE,error_code TEXT)`;
  sql`CREATE OR REPLACE FUNCTION recurrence_due(p_start DATE,p_cadence TEXT,p_every INTEGER,p_index INTEGER) RETURNS DATE LANGUAGE SQL IMMUTABLE AS $$ SELECT CASE p_cadence WHEN 'monthly' THEN (p_start::timestamp+make_interval(months=>p_every*p_index))::date WHEN 'weekly' THEN p_start+7*p_every*p_index ELSE p_start+p_every*p_index END $$`;
  sql`CREATE OR REPLACE FUNCTION notification_delivery_at(p_employee TEXT,p_now TIMESTAMPTZ) RETURNS TIMESTAMPTZ LANGUAGE plpgsql STABLE AS $$ DECLARE zone TEXT; hours JSONB; local_clock TIMESTAMP; start_time TIME; end_time TIME; BEGIN SELECT time_zone,quiet_hours INTO zone,hours FROM notification_preferences WHERE employee_name=p_employee; IF COALESCE(hours->>'enabled','false')<>'true' THEN RETURN p_now; END IF; local_clock=p_now AT TIME ZONE COALESCE(zone,'UTC'); start_time=(hours->>'start')::time; end_time=(hours->>'end')::time; IF start_time<end_time AND local_clock::time>=start_time AND local_clock::time<end_time THEN RETURN (local_clock::date+end_time) AT TIME ZONE zone; ELSIF start_time>end_time THEN IF local_clock::time>=start_time THEN RETURN (local_clock::date+1+end_time) AT TIME ZONE zone; ELSIF local_clock::time<end_time THEN RETURN (local_clock::date+end_time) AT TIME ZONE zone; END IF; END IF; RETURN p_now; END $$`;
  sql`CREATE OR REPLACE FUNCTION enqueue_task_assignment() RETURNS TRIGGER LANGUAGE plpgsql AS $$ DECLARE project_key INTEGER; BEGIN IF TG_OP='UPDATE' AND NEW.owner IS NOT DISTINCT FROM OLD.owner THEN RETURN NEW; END IF; IF TG_OP='UPDATE' THEN UPDATE notifications SET suppressed=TRUE WHERE task_id=NEW.id AND employee_name=OLD.owner AND type='task_assigned' AND NOT read; END IF; IF NOT EXISTS(SELECT 1 FROM employees WHERE name=NEW.owner) OR COALESCE((SELECT in_app FROM notification_preferences WHERE employee_name=NEW.owner),TRUE)=FALSE THEN RETURN NEW; END IF; SELECT id INTO project_key FROM projects WHERE name=NEW.project_name AND NOT archived AND (owner=NEW.owner OR EXISTS(SELECT 1 FROM project_members WHERE project_name=NEW.project_name AND employee_name=NEW.owner)) ORDER BY id LIMIT 1; IF NEW.project_name<>'General' AND project_key IS NULL THEN RETURN NEW; END IF; INSERT INTO notifications(employee_name,type,message,task_id,project_id,available_at) VALUES(NEW.owner,'task_assigned','Assigned to you: PF-'||NEW.id||' · '||NEW.title,NEW.id,project_key,notification_delivery_at(NEW.owner,NOW())); RETURN NEW; END $$`;
  sql`CREATE OR REPLACE TRIGGER task_assignment_notification AFTER INSERT OR UPDATE OF owner ON tasks FOR EACH ROW EXECUTE FUNCTION enqueue_task_assignment()`;
  sql`CREATE OR REPLACE FUNCTION enqueue_project_assignment() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='UPDATE' AND NEW.owner IS NOT DISTINCT FROM OLD.owner THEN RETURN NEW; END IF; IF TG_OP='UPDATE' THEN UPDATE notifications SET suppressed=TRUE WHERE project_id=NEW.id AND employee_name=OLD.owner AND type='project_assigned' AND NOT read; END IF; IF EXISTS(SELECT 1 FROM employees WHERE name=NEW.owner) AND COALESCE((SELECT in_app FROM notification_preferences WHERE employee_name=NEW.owner),TRUE) THEN INSERT INTO notifications(employee_name,type,message,project_id,available_at) VALUES(NEW.owner,'project_assigned','You own project: '||NEW.name,NEW.id,notification_delivery_at(NEW.owner,NOW())); END IF; RETURN NEW; END $$`;
  sql`CREATE OR REPLACE TRIGGER project_assignment_notification AFTER INSERT OR UPDATE OF owner ON projects FOR EACH ROW EXECUTE FUNCTION enqueue_project_assignment()`;
  sql`CREATE OR REPLACE FUNCTION visible_notifications(p_employee TEXT,p_now TIMESTAMPTZ) RETURNS SETOF notifications LANGUAGE SQL STABLE AS $$ SELECT n.* FROM notifications n WHERE n.employee_name=p_employee AND NOT n.suppressed AND n.available_at<=p_now AND (n.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=n.task_id AND ((t.project_name='General' AND t.owner=p_employee) OR EXISTS(SELECT 1 FROM projects p WHERE p.name=t.project_name AND NOT p.archived AND (p.owner=p_employee OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_name=p.name AND m.employee_name=p_employee)))))) AND (n.project_id IS NULL OR EXISTS(SELECT 1 FROM projects p WHERE p.id=n.project_id AND NOT p.archived AND (p.owner=p_employee OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_name=p.name AND m.employee_name=p_employee)))) AND (n.type NOT IN ('due_soon','due_today','overdue') OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=n.task_id AND NOT t.completed AND t.due_date=n.subject_date AND t.owner=p_employee)) AND (n.type<>'task_assigned' OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=n.task_id AND t.owner=p_employee)) AND (n.type<>'project_assigned' OR EXISTS(SELECT 1 FROM projects p WHERE p.id=n.project_id AND p.owner=p_employee)) $$`;
  sql`CREATE OR REPLACE FUNCTION execute_daily_work(p_now TIMESTAMPTZ) RETURNS JSONB LANGUAGE plpgsql AS $$
    DECLARE candidate RECORD; schedule recurring_schedules%ROWTYPE; project_row projects%ROWTYPE; occurrence DATE; day_limit DATE; generated INTEGER=0; inserted_count INTEGER; reminder_count INTEGER=0; examined INTEGER=0; per_schedule INTEGER; run_key BIGINT; backlog BOOLEAN;
    BEGIN
      IF NOT pg_try_advisory_xact_lock(hashtext('peopleflow-daily-work')) THEN RETURN jsonb_build_object('busy',TRUE,'generatedTasks',0,'reminders',0); END IF;
      day_limit=(p_now AT TIME ZONE 'UTC')::date;
      FOR candidate IN SELECT id,project_id FROM recurring_schedules WHERE enabled AND NOT archived ORDER BY last_run_at NULLS FIRST,id LIMIT 100 LOOP
        EXIT WHEN generated>=200;
        PERFORM pg_advisory_xact_lock(hashtext('planning:'||candidate.project_id));
        SELECT * INTO schedule FROM recurring_schedules WHERE id=candidate.id FOR UPDATE;
        IF NOT schedule.enabled OR schedule.archived THEN CONTINUE; END IF;
        examined=examined+1;
        SELECT * INTO project_row FROM projects WHERE id=schedule.project_id AND NOT archived;
        IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM employees WHERE name=schedule.owner) OR NOT EXISTS(SELECT 1 FROM employees e WHERE e.name=schedule.created_by AND e.access_role<>'viewer') OR NOT (project_row.owner=schedule.created_by OR EXISTS(SELECT 1 FROM project_members WHERE project_name=project_row.name AND employee_name=schedule.created_by)) OR NOT (project_row.owner=schedule.owner OR EXISTS(SELECT 1 FROM project_members WHERE project_name=project_row.name AND employee_name=schedule.owner)) OR (schedule.module_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_modules WHERE id=schedule.module_id AND project_id=schedule.project_id AND NOT archived)) THEN
          UPDATE recurring_schedules SET enabled=FALSE,last_error='Paused: project, creator, assignee, or module access changed.',last_run_at=p_now,version=version+1 WHERE id=schedule.id; CONTINUE;
        END IF;
        per_schedule=0;
        LOOP
          occurrence=recurrence_due(schedule.start_date,schedule.cadence,schedule.every_n,schedule.next_index);
          IF schedule.end_date IS NOT NULL AND occurrence>schedule.end_date THEN UPDATE recurring_schedules SET enabled=FALSE,last_error=NULL,last_run_at=p_now,version=version+1 WHERE id=schedule.id; EXIT; END IF;
          EXIT WHEN occurrence>day_limit OR per_schedule>=31 OR generated>=200;
          INSERT INTO tasks(title,description,project_name,owner,priority,labels,status,completed,due_date,module_id,recurrence_id,recurrence_date,recurring_rule) VALUES(schedule.title,schedule.description,project_row.name,schedule.owner,schedule.priority,schedule.labels,'To do',FALSE,occurrence,schedule.module_id,schedule.id,occurrence,'schedule:'||schedule.id) ON CONFLICT(recurrence_id,recurrence_date) WHERE recurrence_id IS NOT NULL DO NOTHING;
          GET DIAGNOSTICS inserted_count=ROW_COUNT;
          generated=generated+inserted_count; per_schedule=per_schedule+1; schedule.next_index=schedule.next_index+1;
          IF inserted_count>0 THEN INSERT INTO activity_events(employee_name,event_type,message) VALUES(schedule.created_by,'recurring_task_created','Generated recurring work: '||schedule.title||' · '||occurrence); END IF;
          UPDATE recurring_schedules SET next_index=schedule.next_index,last_run_at=p_now,last_error=NULL,version=version+1 WHERE id=schedule.id;
        END LOOP;
        UPDATE recurring_schedules SET last_run_at=p_now WHERE id=schedule.id;
      END LOOP;
      INSERT INTO notifications(employee_name,type,message,task_id,project_id,dedupe_key,subject_date,available_at)
      SELECT t.owner,CASE WHEN t.due_date<local_day.day THEN 'overdue' WHEN t.due_date=local_day.day THEN 'due_today' ELSE 'due_soon' END,'PF-'||t.id||' · '||t.title||' · Due '||t.due_date,t.id,p.id,'deadline:'||t.id||':'||t.owner||':'||t.due_date||':'||local_day.day,t.due_date,notification_delivery_at(t.owner,p_now)
      FROM tasks t JOIN employees e ON e.name=t.owner LEFT JOIN notification_preferences pref ON pref.employee_name=t.owner
      LEFT JOIN projects p ON p.name=t.project_name AND NOT p.archived
      CROSS JOIN LATERAL(SELECT (p_now AT TIME ZONE COALESCE(pref.time_zone,'UTC'))::date AS day) local_day
      WHERE NOT t.completed AND t.due_date IS NOT NULL AND t.due_date<=local_day.day+1 AND COALESCE(pref.in_app,TRUE) AND COALESCE(pref.due_reminders,TRUE)
      AND ((t.project_name='General') OR (p.id IS NOT NULL AND (p.owner=t.owner OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_name=p.name AND m.employee_name=t.owner))))
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS reminder_count=ROW_COUNT;
      SELECT EXISTS(SELECT 1 FROM recurring_schedules s JOIN projects p ON p.id=s.project_id AND NOT p.archived WHERE s.enabled AND NOT s.archived AND recurrence_due(s.start_date,s.cadence,s.every_n,s.next_index)<=day_limit AND (s.end_date IS NULL OR recurrence_due(s.start_date,s.cadence,s.every_n,s.next_index)<=s.end_date)) INTO backlog;
      INSERT INTO scheduler_runs(started_at,finished_at,status,generated_tasks,reminders,schedules_examined,has_more) VALUES(p_now,clock_timestamp(),'success',generated,reminder_count,examined,backlog) RETURNING id INTO run_key;
      RETURN jsonb_build_object('runId',run_key,'generatedTasks',generated,'reminders',reminder_count,'schedulesExamined',examined,'hasMore',backlog,'asOfDate',day_limit);
    END $$`;
  await db.transaction([db`SELECT pg_advisory_xact_lock(hashtext('peopleflow-jobs-schema'))`,...statements]);
}
