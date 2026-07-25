#!/bin/sh
set -eu

for provider in aiand daytona gmi nosana qoder qwen; do
  scripts/with-provider-secret.sh \
    "$provider" \
    node scripts/provider-readonly-preflight.mjs "$provider"
done
