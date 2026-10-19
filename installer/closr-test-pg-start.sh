#!/bin/sh
# Install at /usr/local/bin/closr-test-pg-start.sh in a fresh, isolated PG17
# container. The installer must
# stage and verify the official SQL assets and root-key file before invoking it.
# Nothing here reads or prints those assets or any credential.
set -eu
umask 077

fail() {
  printf '%s\n' "pg_first_boot_$1" >&2
  exit 1
}

# Docker Cmd is supplied by the reviewed adapter. Accept only its exact vector;
# ignore no extra options, and never echo untrusted arguments on failure.
if [ "$#" -ne 11 ] ||
   [ "$1" != postgres ] || [ "$2" != -D ] || [ "$3" != /etc/postgresql ] ||
   [ "$4" != -c ] || [ "$5" != log_statement=none ] ||
   [ "$6" != -c ] || [ "$7" != log_min_error_statement=panic ] ||
   [ "$8" != -c ] || [ "$9" != log_parameter_max_length=0 ] ||
   [ "${10}" != -c ] || [ "${11}" != log_parameter_max_length_on_error=0 ]; then
  fail unexpected_command
fi
[ -n "${POSTGRES_PASSWORD-}" ] || fail missing_environment
[ "${PGPASSWORD-}" = "$POSTGRES_PASSWORD" ] || fail mismatched_password
[ "${POSTGRES_HOST-}" = /var/run/postgresql ] || fail invalid_postgres_host
[ -n "${JWT_SECRET-}" ] && [ -n "${JWT_EXP-}" ] || fail missing_environment

# docker cp normally leaves these 0600 files owned by root. The reviewed PG
# image starts this wrapper as root; resolve its postgres account inside that
# image before the official entrypoint starts either postmaster. Never follow
# a symlink or display an asset's contents or a failed command's arguments.
sql_asset=/etc/postgresql.schema.sql
key_asset=/etc/postgresql-custom/pgsodium_root.key
for asset in "$sql_asset" "$key_asset"; do
  [ ! -L "$asset" ] && [ -f "$asset" ] || fail asset_invalid
done

# The reviewed image's entrypoint forwards these server arguments to its
# temporary initialization postmaster and the final postmaster. Command-line
# settings take precedence over the image's log_statement=ddl configuration.
# Query exactly the same arguments before the entrypoint can run init scripts.
set -- postgres -D /etc/postgresql \
  -c log_statement=none \
  -c log_min_error_statement=panic \
  -c log_parameter_max_length=0 \
  -c log_parameter_max_length_on_error=0

uid=$(id -u 2>/dev/null) || fail identity_unavailable
case "$uid" in
  0)
    for asset in "$sql_asset" "$key_asset"; do
      chown postgres:postgres "$asset" 2>/dev/null || fail asset_ownership_failed
      chmod 0600 "$asset" 2>/dev/null || fail asset_mode_failed
    done
    if command -v gosu >/dev/null 2>&1; then
      pg_config_value() { gosu postgres "$@"; }
    elif command -v su-exec >/dev/null 2>&1; then
      pg_config_value() { su-exec postgres "$@"; }
    else
      fail privilege_helper_unavailable
    fi
    ;;
  ''|*[!0-9]*) fail identity_invalid ;;
  *)
    for asset in "$sql_asset" "$key_asset"; do
      [ -r "$asset" ] || fail asset_unreadable
    done
    pg_config_value() { "$@"; }
    ;;
esac

require_setting() {
  setting=$1
  expected=$2
  shift 2
  actual=$(pg_config_value "$@" -C "$setting" 2>/dev/null) || fail config_probe_failed
  [ "$actual" = "$expected" ] || fail config_mismatch
}

require_setting log_statement none "$@"
require_setting log_min_error_statement panic "$@"
require_setting log_parameter_max_length 0 "$@"
require_setting log_parameter_max_length_on_error 0 "$@"

command -v docker-entrypoint.sh >/dev/null 2>&1 || fail entrypoint_unavailable
exec docker-entrypoint.sh "$@"
