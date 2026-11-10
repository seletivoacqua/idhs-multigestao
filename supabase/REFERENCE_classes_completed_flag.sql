/*
# Reference: "Concluído" flag on classes

This file records the schema change already applied to the database
(migration `20261110211835_add_classes_completed_flag`). It is kept for
documentation only and is not executed by the project.

1. Modified Tables
- `classes`: new column `completed` (boolean, not null, default false).

2. Important notes
- Purely informational. Not used by any frequency, approval or situation calculation.
- Existing grants and row level security policies on `classes` already cover the column.
*/

ALTER TABLE classes ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
