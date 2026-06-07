@echo off
setlocal

set ENV_FILE=%~dp0backend\.env

REM ── Infrastructure ────────────────────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'DATABASE_URL=.*', 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/homeservices' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'REDIS_URL=.*', 'REDIS_URL=redis://localhost:6379' | Set-Content '%ENV_FILE%'"

REM ── Runtime ───────────────────────────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'NODE_ENV=.*', 'NODE_ENV=development' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'PORT=.*', 'PORT=3000' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'HOST=.*', 'HOST=0.0.0.0' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'TZ=.*', 'TZ=Asia/Kuala_Lumpur' | Set-Content '%ENV_FILE%'"

REM ── Frontend / CORS ───────────────────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'APP_URL=.*', 'APP_URL=http://localhost:4200' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'CORS_EXTRA_ORIGINS=.*', 'CORS_EXTRA_ORIGINS=' | Set-Content '%ENV_FILE%'"

REM ── Auth token expiry (non-secret) ────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'JWT_EXPIRES_IN=.*', 'JWT_EXPIRES_IN=15m' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'REFRESH_TOKEN_EXPIRES_IN=.*', 'REFRESH_TOKEN_EXPIRES_IN=7d' | Set-Content '%ENV_FILE%'"

REM ── Google OAuth callback ─────────────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'GOOGLE_CALLBACK_URL=.*', 'GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback' | Set-Content '%ENV_FILE%'"

REM ── Demo admin seed ───────────────────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'ADMIN_SEED_EMAIL=.*', 'ADMIN_SEED_EMAIL=admin@demo.local' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'ADMIN_SEED_PASSWORD=.*', 'ADMIN_SEED_PASSWORD=Demo@2026' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'ADMIN_SEED_PIN=.*', 'ADMIN_SEED_PIN=1234' | Set-Content '%ENV_FILE%'"

REM ── S3 / SMTP non-secrets ─────────────────────────────────────────────────────
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'S3_REGION=.*', 'S3_REGION=auto' | Set-Content '%ENV_FILE%'"
powershell -Command "(Get-Content '%ENV_FILE%') -replace 'SMTP_FROM=.*', 'SMTP_FROM=MyHomeServicer ^<noreply@myhomeservicer.com^>' | Set-Content '%ENV_FILE%'"

echo Done. backend\.env fully updated for local dev.
echo Secrets (JWT_SECRET, API keys, S3/Stripe/Google creds) were left unchanged.
