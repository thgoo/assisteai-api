#!/bin/sh
# Reloads the legacy database from the seed the env was started with (fixtures, or the dump given with DUMP).
set -eu
docker exec assisteai-mariadb sh -c '
  set -eu
  mariadb -uroot -plocal -e "DROP DATABASE IF EXISTS assisteai; CREATE DATABASE assisteai"
  for seed in /docker-entrypoint-initdb.d/10-seed.*; do
    case "$seed" in
      *.gz) gunzip -c "$seed" ;;
      *) cat "$seed" ;;
    esac | mariadb -uroot -plocal assisteai
  done
'
