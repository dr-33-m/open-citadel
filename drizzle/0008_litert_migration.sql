-- litert-lm migration: data cleanup is handled in loadModels() since the
-- llama_models table is created by ensureChatSchema() which runs after migrations.
-- This migration is intentionally a no-op; settings seeding happens in the store.
SELECT 1;
