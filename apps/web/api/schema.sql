CREATE TABLE IF NOT EXISTS skill_revisions (
  creator_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  digest TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  envelope TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(creator_id,slug,revision),
  UNIQUE(creator_id,nonce),
  UNIQUE(creator_id,slug,version)
);
CREATE INDEX IF NOT EXISTS skill_latest ON skill_revisions(creator_id,slug,revision DESC);
