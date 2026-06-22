-- AlterTable: account-level service radius (km) for SP-3 auto-accept coverage
ALTER TABLE "merchants" ADD COLUMN "service_radius_km" INTEGER NOT NULL DEFAULT 10;
