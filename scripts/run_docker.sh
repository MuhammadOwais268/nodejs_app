#!/usr/bin/env bash
set -euo pipefail
echo "Building and starting containers (this will use local credentials from ./credentials)..."
docker-compose -f "$(dirname "$0")/../docker-compose.yml" up --build -d
echo "Containers started. Use 'docker-compose ps' to see status or visit http://localhost:8080 for the loveable frontend."
