#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/with-secrets.sh command [args...]" >&2
  exit 64
fi

load_secret() {
  variable_name=$1
  service_name=$2
  account_name=$3

  eval "existing_value=\${$variable_name-}"
  if [ -n "$existing_value" ]; then
    unset existing_value
    return 0
  fi
  unset existing_value

  secret_value=$(security find-generic-password -w -s "$service_name" -a "$account_name" 2>/dev/null) || return 0
  export "$variable_name=$secret_value"
  unset secret_value
}

load_secret DASHSCOPE_API_KEY qwencloud-api-key love.works7@gmail.com
load_secret GMI_API_KEY com.gmicloud.inference api-key:default
load_secret AIAND_API_KEY aiand-api AIAND_API_KEY
load_secret DAYTONA_API_KEY daytona-api DAYTONA_API_KEY
load_secret NOSANA_API_KEY com.nosana.deploy NOSANA_API_KEY

exec "$@"
