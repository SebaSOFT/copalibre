-- Database roles for a CopaLibre installation. Run as an administrative user
-- (the PostgreSQL bootstrap superuser in the Compose install) against the
-- installation's database:
--
--   psql -v ON_ERROR_STOP=1 \
--        -v owner_password="$COPALIBRE_DATABASE_OWNER_PASSWORD" \
--        -v app_password="$COPALIBRE_DATABASE_APP_PASSWORD" \
--        -f roles.sql
--
-- copalibre_owner owns the schema and runs migrations. copalibre_app is what
-- every request-serving role connects as: it reads and writes rows and nothing
-- else. Running the script again changes nothing; it never drops a role or
-- revokes from a role it did not create.
--
-- The two psql variables above are the only psql-specific syntax here.

-- SET, not SELECT set_config(): psql prints a SELECT's result, and these are passwords.
SET copalibre.owner_password = :'owner_password';
SET copalibre.app_password = :'app_password';

DO $roles$
DECLARE
  owner_password text := current_setting('copalibre.owner_password');
  app_password text := current_setting('copalibre.app_password');
  role_name text;
BEGIN
  IF coalesce(owner_password, '') = '' OR coalesce(app_password, '') = '' THEN
    RAISE EXCEPTION 'Set COPALIBRE_DATABASE_OWNER_PASSWORD and COPALIBRE_DATABASE_APP_PASSWORD; run "copalibre upgrade" to generate them';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['copalibre_owner', 'copalibre_app'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN', role_name);
    END IF;
    -- Re-asserted every run: neither role may ever create roles or databases,
    -- replicate, bypass row security or act as a superuser.
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT',
      role_name
    );
  END LOOP;

  EXECUTE format('ALTER ROLE copalibre_owner PASSWORD %L', owner_password);
  EXECUTE format('ALTER ROLE copalibre_app PASSWORD %L', app_password);

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO copalibre_owner, copalibre_app', current_database());
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END
$roles$;

-- The passwords are not needed past this point.
RESET copalibre.owner_password;
RESET copalibre.app_password;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO copalibre_owner;
GRANT USAGE ON SCHEMA public TO copalibre_app;

-- Every object in public belongs to the owner. REASSIGN OWNED cannot be used:
-- the bootstrap superuser also owns system objects.
DO $ownership$
DECLARE
  object record;
BEGIN
  FOR object IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND pg_get_userbyid(c.relowner) <> 'copalibre_owner'
      -- A sequence owned by a column follows its table.
      AND NOT (c.relkind = 'S' AND EXISTS (
        SELECT FROM pg_depend d
        WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
      ))
  LOOP
    EXECUTE format(
      'ALTER %s public.%I OWNER TO copalibre_owner',
      CASE object.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      object.relname
    );
  END LOOP;

  FOR object IN
    SELECT p.oid::regprocedure AS signature, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_userbyid(p.proowner) <> 'copalibre_owner'
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER %s %s OWNER TO copalibre_owner',
      CASE object.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
      object.signature
    );
  END LOOP;
END
$ownership$;

ALTER SCHEMA public OWNER TO copalibre_owner;

-- Tables and sequences the owner creates later reach the runtime role. The
-- migrate job narrows the migration bookkeeping and the audit trail after
-- every run.
ALTER DEFAULT PRIVILEGES FOR ROLE copalibre_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO copalibre_app;
ALTER DEFAULT PRIVILEGES FOR ROLE copalibre_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO copalibre_app;
