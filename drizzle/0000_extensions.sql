-- users.email is case-insensitive (legacy MariaDB compared emails with a case-insensitive collation).
CREATE EXTENSION IF NOT EXISTS citext;
