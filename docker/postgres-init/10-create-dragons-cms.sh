#!/bin/sh
# Creates the Payload CMS database (apps/cms) beside the main `dragons` db.
# Postgres runs /docker-entrypoint-initdb.d only when the pgdata volume is
# empty. On an existing volume, create the db once by hand:
#   docker compose -f docker/docker-compose.dev.yml exec postgres createdb -U dragons dragons_cms
set -e
createdb -U "$POSTGRES_USER" dragons_cms
