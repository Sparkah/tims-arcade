PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gallery_hidden_games (
  slug TEXT PRIMARY KEY
    CHECK (
      length(slug) BETWEEN 1 AND 64
      AND slug NOT GLOB '*[^a-z0-9_-]*'
    ),
  updated_at TEXT NOT NULL
    CHECK (updated_at GLOB '????-??-??T??:??:??.???Z')
);

CREATE TABLE IF NOT EXISTS gallery_curation_state (
  singleton INTEGER PRIMARY KEY
    CHECK (singleton = 1),
  updated_at TEXT NOT NULL
    CHECK (updated_at GLOB '????-??-??T??:??:??.???Z')
);

INSERT OR IGNORE INTO gallery_curation_state (singleton, updated_at)
VALUES (1, '1970-01-01T00:00:00.000Z');
