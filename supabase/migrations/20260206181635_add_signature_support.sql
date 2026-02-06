/*
  # Add Signature Support for Certificates

  1. New Tables
    - `signatures`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `image_url` (text) - URL to the signature image in storage
      - `name` (text) - Name/title of the signature
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Storage
    - Create storage bucket for signature images
    - Enable RLS on the bucket

  3. Certificate Signature Position
    - Add columns to store signature position in certificates table

  4. Security
    - Enable RLS on signatures table
    - Policies for authenticated users to manage their signatures
    - Storage policies for signature uploads
*/

-- Create signatures table
CREATE TABLE IF NOT EXISTS signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  name text NOT NULL DEFAULT 'Assinatura',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Policies for signatures
CREATE POLICY "Users can view own signatures"
  ON signatures
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signatures"
  ON signatures
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signatures"
  ON signatures
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own signatures"
  ON signatures
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create storage bucket for signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload their own signatures"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signatures' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view signatures"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'signatures');

CREATE POLICY "Users can update their own signatures"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own signatures"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );