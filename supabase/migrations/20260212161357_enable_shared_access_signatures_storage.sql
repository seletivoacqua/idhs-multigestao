/*
  # Enable Shared Access for Signatures Storage

  ## Overview
  This migration extends the shared access model to the signatures storage bucket,
  allowing all academic users to upload, view, update and delete signature files.

  ## Security Changes
  
  ### Modified Storage Policies
  
  The signatures storage bucket will have its policies updated to allow any authenticated user 
  who exists in the `users_academico` table to:
  - Upload signature files
  - View all signature files
  - Update signature files
  - Delete signature files
  
  ## Important Notes
  - This allows academic users to manage signature files collaboratively
  - All academic users can access and use signature files from any user
*/

-- Drop old restrictive storage policies for signatures
DROP POLICY IF EXISTS "Users can upload their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can view signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own signatures" ON storage.objects;

-- Create new shared access storage policies for signatures
CREATE POLICY "Academic users can upload any signatures"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signatures' AND
    is_academic_user()
  );

CREATE POLICY "Academic users can view all signatures"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    is_academic_user()
  );

CREATE POLICY "Academic users can update any signatures"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    is_academic_user()
  )
  WITH CHECK (
    bucket_id = 'signatures' AND
    is_academic_user()
  );

CREATE POLICY "Academic users can delete any signatures"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    is_academic_user()
  );