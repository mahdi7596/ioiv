-- Allow image uploads (phone photos / scans of documents) alongside the existing
-- document types. Adding enum values is additive and does not touch existing rows.
ALTER TYPE "StoredFileType" ADD VALUE IF NOT EXISTS 'JPG';
ALTER TYPE "StoredFileType" ADD VALUE IF NOT EXISTS 'PNG';
ALTER TYPE "StoredFileType" ADD VALUE IF NOT EXISTS 'WEBP';
ALTER TYPE "StoredFileType" ADD VALUE IF NOT EXISTS 'HEIC';
