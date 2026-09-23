CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT DEFAULT 'activo',
  actualizado TEXT
);

CREATE TABLE IF NOT EXISTS plantillas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  texto TEXT NOT NULL,
  entities TEXT,
  parse_mode TEXT,
  media_file_id TEXT,
  actualizado TEXT
);