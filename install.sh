#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$DIR/deploy/scripts/bootstrap-local.sh" "$@" < /dev/tty
