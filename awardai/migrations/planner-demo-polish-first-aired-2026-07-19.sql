-- Session: P1 planner demo polish (Lorenz demo build, 19 Jul 2026)
-- Persists the planner's per-campaign "first publicly aired" date onto
-- projects, so it survives across planner visits instead of living only in
-- component state (T3-ELIGIBILITY-WINDOW shipped it as planner-input-only).
-- Nullable: existing rows are unaffected, and the planner's "leave blank to
-- skip" semantics are preserved (NULL = no claim, never a guess).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS first_aired date;
