#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: scripts/with-provider-secret.sh provider command [args...]" >&2
  exit 64
fi

provider=$1
shift

load_secret() {
  variable_name=$1
  service_name=$2
  account_name=$3

  secret_value=$(security find-generic-password -w -s "$service_name" -a "$account_name" 2>/dev/null) || {
    echo "$provider: keychain item unavailable" >&2
    exit 78
  }
  export "$variable_name=$secret_value"
  unset secret_value
}

case "$provider" in
  aiand)
    load_secret AIAND_API_KEY aiand-api AIAND_API_KEY
    ;;
  daytona)
    load_secret DAYTONA_API_KEY daytona-api DAYTONA_API_KEY
    ;;
  gmi)
    load_secret GMI_API_KEY com.gmicloud.inference api-key:default
    ;;
  nosana)
    load_secret NOSANA_API_KEY com.nosana.deploy NOSANA_API_KEY
    ;;
  qoder)
    load_secret QODER_PERSONAL_ACCESS_TOKEN com.qoder.agent-sdk QODER_PERSONAL_ACCESS_TOKEN
    ;;
  qwen)
    load_secret DASHSCOPE_API_KEY qwencloud-api-key love.works7@gmail.com
    ;;
  *)
    echo "unknown provider: $provider" >&2
    exit 64
    ;;
esac

exec "$@"
