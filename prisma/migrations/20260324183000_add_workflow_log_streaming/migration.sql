-- AlterTable
ALTER TABLE "Workflow"
ADD COLUMN "logStreamingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "logStreamingUrl" TEXT,
ADD COLUMN "logStreamingLevel" TEXT NOT NULL DEFAULT 'info';
