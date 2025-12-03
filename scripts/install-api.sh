#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NAME="${ENV_NAME:-local}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/apps/api/.env.${ENV_NAME}}"
FORCE="${FORCE:-0}"
SETUP_CONTAINERS="${SETUP_CONTAINERS:-1}"
DOCKER_NETWORK="${DOCKER_NETWORK:-hosting-control-panel}"
MONGO_CONTAINER_NAME="${MONGO_CONTAINER_NAME:-hcp-mongodb}"
MONGO_VOLUME="${MONGO_VOLUME:-hcp-mongodb-data}"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:7.0}"
MONGO_PORT="${MONGO_PORT:-27017}"
API_PORT="${API_PORT:-4000}"

stop_running_server() {
  local port="${1:-${API_PORT}}"
  local pid

  # Try to find process using the port (cross-platform approach)
  if command -v lsof >/dev/null 2>&1; then
    pid=$(lsof -ti:${port} 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    # fuser outputs to stderr, so we redirect and parse
    pid=$(fuser ${port}/tcp 2>&1 | grep -oP '\d+' | head -1 || true)
  elif command -v netstat >/dev/null 2>&1; then
    # netstat approach (Linux)
    pid=$(netstat -tlnp 2>/dev/null | grep ":${port} " | awk '{print $7}' | cut -d'/' -f1 | head -1 || true)
  elif command -v ss >/dev/null 2>&1; then
    # ss approach (modern Linux)
    pid=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K\d+' | head -1 || true)
  fi

  if [[ -n "${pid}" ]] && [[ "${pid}" =~ ^[0-9]+$ ]]; then
    echo "🛑 Stopping API server running on port ${port} (PID: ${pid})..."
    
    # Try graceful shutdown first (SIGTERM)
    if kill -0 "${pid}" 2>/dev/null; then
      kill -TERM "${pid}" 2>/dev/null || true
      
      # Wait up to 5 seconds for graceful shutdown
      local count=0
      while kill -0 "${pid}" 2>/dev/null && [[ ${count} -lt 5 ]]; do
        sleep 1
        count=$((count + 1))
      done
      
      # Force kill if still running
      if kill -0 "${pid}" 2>/dev/null; then
        echo "⚠️  Process did not stop gracefully, forcing termination..."
        kill -KILL "${pid}" 2>/dev/null || true
        sleep 1
      fi
      
      # Verify it's stopped
      if ! kill -0 "${pid}" 2>/dev/null; then
        echo "✅ API server stopped successfully."
      else
        echo "⚠️  Warning: Could not stop process ${pid}. You may need to stop it manually."
      fi
    fi
  else
    echo "ℹ️  No API server found running on port ${port}."
  fi
}

ensure_docker_available() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "⚠️  Docker is not installed or not in PATH. Skipping container setup." >&2
    return 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "⚠️  Docker daemon does not appear to be running. Start Docker and re-run this script to provision MongoDB automatically." >&2
    return 1
  fi

  return 0
}

ensure_network() {
  local network_name="$1"
  if ! docker network inspect "${network_name}" >/dev/null 2>&1; then
    echo "🔧 Creating Docker network ${network_name}"
    docker network create "${network_name}" >/dev/null
  fi
}

ensure_volume() {
  local volume_name="$1"
  if ! docker volume inspect "${volume_name}" >/dev/null 2>&1; then
    echo "🔧 Creating Docker volume ${volume_name}"
    docker volume create "${volume_name}" >/dev/null
  fi
}

ensure_container() {
  local name="$1"
  shift

  # If container exists, ensure it is running
  if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    echo "✅ Docker container ${name} already running."
    return 0
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
    echo "▶️  Starting existing container ${name}"
    docker start "${name}" >/dev/null
    return 0
  fi

  echo "🚀 Launching container ${name}"
  docker run -d --name "${name}" "$@" >/dev/null
}

# Stop any running API server before proceeding (check default port first)
stop_running_server "${API_PORT}"

if [[ -f "${ENV_FILE}" && "${FORCE}" != "1" ]]; then
  echo "ℹ️  Environment file ${ENV_FILE} already exists. Set FORCE=1 to overwrite or adjust ENV_FILE." >&2
else
  mkdir -p "$(dirname "${ENV_FILE}")"

  get_or_default() {
    local var_name="$1"
    local default_value="$2"
    local current_value="${!var_name:-}"

    if [[ -n "${current_value}" ]]; then
      printf -v "${var_name}" '%s' "${current_value}"
    else
      printf -v "${var_name}" '%s' "${default_value}"
    fi
  }

  escape_multiline() {
    if command -v python3 >/dev/null 2>&1; then
      printf '%s' "${1}" | python3 -c 'import sys; print(sys.stdin.read().strip().replace("\n", "\\n"))'
    elif command -v perl >/dev/null 2>&1; then
      printf '%s' "${1}" | perl -0pe 'chomp; s/\n/\\n/g'
    else
      # Portable fallback using sed (no newline at end handled via printf)
      printf '%s' "${1}" | sed ':a;N;$!ba;s/\n/\\n/g'
    fi
  }

  generate_jwt_pair() {
    if ! command -v openssl >/dev/null 2>&1; then
      echo "⚠️  openssl not found. Using insecure placeholder RSA key pair. Replace these values in ${ENV_FILE}." >&2
      JWT_PRIVATE_KEY_ESCAPED="-----BEGIN PRIVATE KEY-----\\nREPLACE_ME\\n-----END PRIVATE KEY-----"
      JWT_PUBLIC_KEY_ESCAPED="-----BEGIN PUBLIC KEY-----\\nREPLACE_ME\\n-----END PUBLIC KEY-----"
      return
    fi

    local private_pem
    private_pem="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | openssl pkcs8 -topk8 -nocrypt)"
    local public_pem
    public_pem="$(printf '%s' "${private_pem}" | openssl pkey -pubout)"

    JWT_PRIVATE_KEY_ESCAPED="$(escape_multiline "${private_pem}")"
    JWT_PUBLIC_KEY_ESCAPED="$(escape_multiline "${public_pem}")"
  }

  get_or_default MONGODB_URI "mongodb://localhost:${MONGO_PORT}/hosting-control-panel"
  get_or_default AWS_REGION "us-east-1"
  get_or_default JWT_ISSUER "hosting-control-panel"
  get_or_default JWT_AUDIENCE "dashboard,api"
  get_or_default PORT "${API_PORT}"
  get_or_default NODE_ENV "development"
  
  # Update API_PORT if PORT was set in env file
  if [[ -n "${PORT:-}" ]]; then
    API_PORT="${PORT}"
  fi
  if [[ -z "${FIREWALL_CREDENTIAL_PASSPHRASE:-}" ]]; then
    FIREWALL_CREDENTIAL_PASSPHRASE="$(openssl rand -base64 32 | tr -d '\n')"
    echo "🔐 Generated random firewall credential passphrase."
  fi
  if [[ ${#FIREWALL_CREDENTIAL_PASSPHRASE} -lt 16 ]]; then
    echo "⚠️  FIREWALL_CREDENTIAL_PASSPHRASE must be at least 16 characters. Regenerating."
    FIREWALL_CREDENTIAL_PASSPHRASE="$(openssl rand -base64 32 | tr -d '\n')"
  fi

  if [[ -z "${JWT_PRIVATE_KEY:-}" || -z "${JWT_PUBLIC_KEY:-}" ]]; then
    generate_jwt_pair
  else
    JWT_PRIVATE_KEY_ESCAPED="$(escape_multiline "${JWT_PRIVATE_KEY}")"
    JWT_PUBLIC_KEY_ESCAPED="$(escape_multiline "${JWT_PUBLIC_KEY}")"
  fi

  cat > "${ENV_FILE}" <<EOF
# Generated by scripts/install-api.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
NODE_ENV=${NODE_ENV}
PORT=${PORT}
MONGODB_URI=${MONGODB_URI}
AWS_REGION=${AWS_REGION}
JWT_PUBLIC_KEY=${JWT_PUBLIC_KEY_ESCAPED}
JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY_ESCAPED}
JWT_ISSUER=${JWT_ISSUER}
JWT_AUDIENCE=${JWT_AUDIENCE}
AUTH_ACCESS_TOKEN_TTL=${AUTH_ACCESS_TOKEN_TTL:-900}
AUTH_REFRESH_TOKEN_TTL=${AUTH_REFRESH_TOKEN_TTL:-604800}
LOG_LEVEL=${LOG_LEVEL:-info}
FIREWALL_CREDENTIAL_PASSPHRASE=${FIREWALL_CREDENTIAL_PASSPHRASE}
EOF


  echo "✅ Wrote environment configuration to ${ENV_FILE}"
fi

# Read PORT from env file if it exists and stop server on that port
if [[ -f "${ENV_FILE}" ]] && grep -q "^PORT=" "${ENV_FILE}" 2>/dev/null; then
  PORT_FROM_FILE=$(grep "^PORT=" "${ENV_FILE}" | cut -d'=' -f2)
  if [[ -n "${PORT_FROM_FILE}" ]] && [[ "${PORT_FROM_FILE}" != "${API_PORT}" ]]; then
    API_PORT="${PORT_FROM_FILE}"
    # Stop server on the port from the env file (if different from default)
    stop_running_server "${API_PORT}"
  fi
fi

echo "📦 Installing workspace dependencies and building API packages..."

pushd "${ROOT_DIR}" >/dev/null
yarn install --immutable || yarn install
yarn workspace @hosting/common build
yarn workspace @hosting/api build
popd >/dev/null

# Check if MongoDB is already accessible (external instance)
check_mongodb_available() {
  if command -v mongosh >/dev/null 2>&1; then
    mongosh --quiet --eval "db.adminCommand('ping')" "mongodb://localhost:${MONGO_PORT}" >/dev/null 2>&1
  elif command -v mongo >/dev/null 2>&1; then
    mongo --quiet --eval "db.adminCommand('ping')" "mongodb://localhost:${MONGO_PORT}" >/dev/null 2>&1
  else
    # Try to connect via netcat or similar
    timeout 1 bash -c "echo > /dev/tcp/localhost/${MONGO_PORT}" 2>/dev/null || return 1
  fi
}

if [[ "${SETUP_CONTAINERS}" == "1" ]]; then
  # Check Docker availability early and fail if required
  if ! ensure_docker_available; then
    echo ""
    echo "❌ ERROR: Docker is required to set up local MongoDB container." >&2
    echo "" >&2
    echo "Please either:" >&2
    echo "  1. Start Docker Desktop and re-run this script, or" >&2
    echo "  2. Set SETUP_CONTAINERS=0 and provide external MongoDB URL via:" >&2
    echo "     MONGODB_URI=... ./scripts/install-api.sh" >&2
    echo "" >&2
    exit 1
  fi

  ensure_network "${DOCKER_NETWORK}"

  ensure_volume "${MONGO_VOLUME}"
  ensure_container "${MONGO_CONTAINER_NAME}" \
    --network "${DOCKER_NETWORK}" \
    -p "${MONGO_PORT}:27017" \
    -v "${MONGO_VOLUME}:/data/db" \
    --restart unless-stopped \
    "${MONGO_IMAGE}"

  # Wait a moment for containers to be ready
  echo "⏳ Waiting for containers to be ready..."
  sleep 3

  # Verify container is actually running and accessible
  if ! docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER_NAME}$"; then
    echo "❌ ERROR: MongoDB container ${MONGO_CONTAINER_NAME} failed to start." >&2
    echo "   Check logs with: docker logs ${MONGO_CONTAINER_NAME}" >&2
    exit 1
  fi

  # Verify service is accessible
  if ! check_mongodb_available; then
    echo "⚠️  WARNING: MongoDB container is running but not yet accessible on port ${MONGO_PORT}." >&2
    echo "   This may be normal if it's still starting up. The API may need a moment to connect." >&2
  fi

  echo "✅ Local MongoDB (${MONGO_CONTAINER_NAME}) container is ready."
else
  echo "ℹ️  Skipping Docker container setup (SETUP_CONTAINERS=${SETUP_CONTAINERS})."
  
  # If not using containers, verify external services are available
  if [[ "${MONGODB_URI}" == "mongodb://localhost:"* ]] && ! check_mongodb_available; then
    echo "⚠️  WARNING: MongoDB is not accessible at ${MONGODB_URI}" >&2
    echo "   Make sure MongoDB is running or update MONGODB_URI." >&2
  fi
fi

echo "🎉 API server is ready. To run it:"
echo "    ENV_FILE=${ENV_FILE} yarn workspace @hosting/api dev"
echo "  or for production:"
echo "    ENV_FILE=${ENV_FILE} yarn workspace @hosting/api start"

