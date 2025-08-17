\# 🚀 CENTRIFUGE RWA CLI - PRODUCTION DEPLOYMENT GUIDE



\## 📅 4-DAY LAUNCH TIMELINE



\### 🗓️ DAY 1 (Today) - Infrastructure Setup

\*\*Priority: CRITICAL\*\*



\#### ✅ Database Setup

```bash

\# 1. Set up production PostgreSQL database

\# 2. Run schema creation

psql -h your-db-host -U postgres -d centrifuge\_rwa\_prod < production-schema.sql



\# 3. Verify tables created

psql -h your-db-host -U postgres -d centrifuge\_rwa\_prod -c "\\dt"

