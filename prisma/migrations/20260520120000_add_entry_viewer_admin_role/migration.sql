-- Add the restricted admin role used for read-only entry inspection.
ALTER TYPE "UserRole" ADD VALUE 'ENTRY_VIEWER';
