-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NodeType" ADD VALUE 'SCHEDULE_TRIGGER';
ALTER TYPE "NodeType" ADD VALUE 'WEBHOOK_TRIGGER';
ALTER TYPE "NodeType" ADD VALUE 'IF_CONDITION';
ALTER TYPE "NodeType" ADD VALUE 'SWITCH';
ALTER TYPE "NodeType" ADD VALUE 'FILTER';
ALTER TYPE "NodeType" ADD VALUE 'LOOP';
ALTER TYPE "NodeType" ADD VALUE 'MERGE';
ALTER TYPE "NodeType" ADD VALUE 'SPLIT';
ALTER TYPE "NodeType" ADD VALUE 'WAIT_DELAY';
ALTER TYPE "NodeType" ADD VALUE 'STOP_ERROR';
ALTER TYPE "NodeType" ADD VALUE 'SUB_WORKFLOW';
ALTER TYPE "NodeType" ADD VALUE 'CODE';
ALTER TYPE "NodeType" ADD VALUE 'TRANSFORM';
ALTER TYPE "NodeType" ADD VALUE 'AGGREGATE';
ALTER TYPE "NodeType" ADD VALUE 'SORT';
ALTER TYPE "NodeType" ADD VALUE 'REMOVE_DUPLICATES';
ALTER TYPE "NodeType" ADD VALUE 'DATE_TIME';
ALTER TYPE "NodeType" ADD VALUE 'CRYPTO';
ALTER TYPE "NodeType" ADD VALUE 'MARKDOWN_HTML';
ALTER TYPE "NodeType" ADD VALUE 'COMPRESS';
