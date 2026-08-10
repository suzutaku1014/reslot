-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PersonaRole" AS ENUM ('CUSTOMER', 'PROVIDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PROPOSED', 'SELECTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "DemoSession" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "activeRole" "PersonaRole" NOT NULL DEFAULT 'CUSTOMER',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tokyo',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(500),
    "originalStartsAt" TIMESTAMPTZ(6) NOT NULL,
    "originalEndsAt" TIMESTAMPTZ(6) NOT NULL,
    "selectedCandidateId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSlot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "providerId" TEXT,
    "role" "PersonaRole" NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dedupeKey" VARCHAR(180) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "lastErrorCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorRole" "PersonaRole" NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(80) NOT NULL,
    "resourceId" VARCHAR(80) NOT NULL,
    "requestId" VARCHAR(80) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoSession_tokenHash_key" ON "DemoSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_sessionId_key" ON "Workspace"("sessionId");

-- CreateIndex
CREATE INDEX "Customer_workspaceId_idx" ON "Customer"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_workspaceId_id_key" ON "Customer"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Provider_workspaceId_idx" ON "Provider"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_workspaceId_id_key" ON "Provider"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Service_workspaceId_idx" ON "Service"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_workspaceId_id_key" ON "Service"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Appointment_workspaceId_customerId_startsAt_idx" ON "Appointment"("workspaceId", "customerId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_workspaceId_providerId_startsAt_idx" ON "Appointment"("workspaceId", "providerId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_workspaceId_id_key" ON "Appointment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RescheduleRequest_selectedCandidateId_key" ON "RescheduleRequest"("selectedCandidateId");

-- CreateIndex
CREATE INDEX "RescheduleRequest_workspaceId_status_createdAt_idx" ON "RescheduleRequest"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RescheduleRequest_appointmentId_status_idx" ON "RescheduleRequest"("appointmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RescheduleRequest_workspaceId_id_key" ON "RescheduleRequest"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "CandidateSlot_workspaceId_requestId_idx" ON "CandidateSlot"("workspaceId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSlot_workspaceId_id_key" ON "CandidateSlot"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSlot_requestId_startsAt_endsAt_key" ON "CandidateSlot"("requestId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "InAppNotification_workspaceId_role_createdAt_idx" ON "InAppNotification"("workspaceId", "role", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_leaseExpiresAt_idx" ON "NotificationOutbox"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_resourceType_resourceId_idx" ON "AuditEvent"("workspaceId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_operation_key_key" ON "IdempotencyKey"("workspaceId", "operation", "key");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_providerId_fkey" FOREIGN KEY ("workspaceId", "providerId") REFERENCES "Provider"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workspaceId_serviceId_fkey" FOREIGN KEY ("workspaceId", "serviceId") REFERENCES "Service"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_workspaceId_appointmentId_fkey" FOREIGN KEY ("workspaceId", "appointmentId") REFERENCES "Appointment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_selectedCandidateId_fkey" FOREIGN KEY ("selectedCandidateId") REFERENCES "CandidateSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSlot" ADD CONSTRAINT "CandidateSlot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSlot" ADD CONSTRAINT "CandidateSlot_workspaceId_requestId_fkey" FOREIGN KEY ("workspaceId", "requestId") REFERENCES "RescheduleRequest"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "Customer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_workspaceId_providerId_fkey" FOREIGN KEY ("workspaceId", "providerId") REFERENCES "Provider"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce provider availability at the final database boundary. The half-open
-- interval permits back-to-back appointments while rejecting true overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_provider_no_overlap"
EXCLUDE USING gist (
    "workspaceId" WITH =,
    "providerId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("status" = 'SCHEDULED');
