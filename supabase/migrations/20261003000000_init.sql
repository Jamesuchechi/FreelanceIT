-- Baseline migration for extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
