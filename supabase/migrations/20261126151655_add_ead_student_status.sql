/*
# Move EAD completion and attendance status to each student

1. Plain-English summary
- EAD completion and frequency are properties of an enrolled student, not of the whole class.
- The existing access dates remain unchanged.
- New status fields are stored on the existing `ead_access` record identified by `class_id` and `student_id`.

2. Table modifications
- `ead_access.is_frequente` (boolean, not null, default false): the manual EAD frequency decision for that student.
- `ead_access.completed` (boolean, not null, default false): whether that student completed the EAD course.

3. Data safety
- No rows are deleted.
- No existing columns are removed, renamed, or have their types changed.
- Existing EAD access records receive false for both new status fields when no value exists.

4. Security
- Existing RLS policies on `ead_access` remain in place.
- Existing authenticated academic users retain the same access to the table.

5. Important notes
- The application will read and write both statuses per student.
- Access dates and the two status fields remain independent so saving one does not overwrite the others.
*/

ALTER TABLE ead_access
  ADD COLUMN IF NOT EXISTS is_frequente boolean NOT NULL DEFAULT false;

ALTER TABLE ead_access
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

UPDATE ead_access
SET is_frequente = false
WHERE is_frequente IS NULL;

UPDATE ead_access
SET completed = false
WHERE completed IS NULL;

ALTER TABLE ead_access
  ALTER COLUMN is_frequente SET DEFAULT false,
  ALTER COLUMN is_frequente SET NOT NULL,
  ALTER COLUMN completed SET DEFAULT false,
  ALTER COLUMN completed SET NOT NULL;
