-- The Edge function reaches the database as service_role. The tables added on 2026-11-14 (private
-- sheet rows and the read cache) were created without its grants, so every request failed with
-- "permission denied for table private_sheets". Applied by hand on 2026-11-15 to restore service;
-- this migration records it (granting twice is harmless).
grant select, insert, update, delete on karvio_private.private_sheets, karvio_private.private_rows, karvio_private.read_cache to service_role;
