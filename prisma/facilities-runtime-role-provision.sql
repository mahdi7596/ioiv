-- Idempotently create or reconcile the restricted application role, then apply
-- its least-privilege grants. Run as the migration owner (which needs CREATEROLE
-- and permission to manage this role):
--   psql "$DATABASE_URL" -v runtime_role=sana_runtime \
--     -f prisma/facilities-runtime-role-provision.sql
-- \password is intentionally used instead of generated ALTER ROLE ... PASSWORD
-- SQL, so the value is not printed or interpolated into a query string.

\if :{?runtime_role}
\else
  \echo 'runtime_role is required (for example: -v runtime_role=sana_runtime)'
  \quit
\endif

SELECT format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'runtime_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role')
\gexec

SELECT format('ALTER ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'runtime_role')
\gexec

-- Remove existing direct grants and inherited role memberships before restoring
-- the precise allow-list below. This is safe only for the dedicated runtime role.
SELECT format('REVOKE %I FROM %I', parent_role.rolname, :'runtime_role')
FROM pg_auth_members membership
JOIN pg_roles member_role ON member_role.oid = membership.member
JOIN pg_roles parent_role ON parent_role.oid = membership.roleid
WHERE member_role.rolname = :'runtime_role'
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), :'runtime_role')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'runtime_role')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'runtime_role')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'runtime_role')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', :'runtime_role')
\gexec
SELECT format('REVOKE USAGE ON TYPE %I.%I FROM %I', namespace.nspname, typ.typname, :'runtime_role')
FROM pg_type typ
JOIN pg_namespace namespace ON namespace.oid = typ.typnamespace
WHERE namespace.nspname = 'public' AND typ.typtype IN ('b', 'c', 'd', 'e', 'r') AND typ.typelem = 0
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_role')
\gexec

\ir facilities-runtime-role-grants.sql
\password :"runtime_role"
