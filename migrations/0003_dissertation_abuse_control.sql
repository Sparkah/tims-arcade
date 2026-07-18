CREATE TABLE IF NOT EXISTS study_rate_buckets (
  bucket_key TEXT PRIMARY KEY
    CHECK (length(bucket_key) BETWEEN 1 AND 80),
  window_start TEXT NOT NULL
    CHECK (length(window_start) = 10),
  used INTEGER NOT NULL DEFAULT 0
    CHECK (used BETWEEN 0 AND 500)
);
