#!/usr/bin/env bash
# mai-code-mcp installer
# Usage: curl -fsSL https://raw.githubusercontent.com/mai-space/mai-code-mcp/main/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/mai-space/mai-code-mcp.git"
INSTALL_DIR="${MAI_CODE_DIR:-${HOME}/.mai-code-mcp}"

# ── helpers ──────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[mai-code]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[mai-code]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[mai-code]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[mai-code]\033[0m %s\n' "$*" >&2; exit 1; }

# ── prerequisite checks ───────────────────────────────────────────────────────

command -v git  >/dev/null 2>&1 || err "git is required but was not found in PATH."
command -v node >/dev/null 2>&1 || err "Node.js is required but was not found in PATH."
command -v npm  >/dev/null 2>&1 || err "npm is required but was not found in PATH."

NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if ! [[ "${NODE_MAJOR}" =~ ^[0-9]+$ ]]; then
  err "Could not determine Node.js version. Please ensure Node.js ≥ 20 is installed."
fi
if [ "${NODE_MAJOR}" -lt 20 ]; then
  err "Node.js ≥ 20 is required (found ${NODE_MAJOR}). Please upgrade: https://nodejs.org"
fi

QDRANT_CONTAINER_NAME="${MAI_CODE_QDRANT_CONTAINER:-mai-code-qdrant}"
QDRANT_HTTP_PORT="${MAI_CODE_QDRANT_HTTP_PORT:-6333}"
QDRANT_GRPC_PORT="${MAI_CODE_QDRANT_GRPC_PORT:-6334}"

ensure_qdrant() {
  if [ "${MAI_CODE_SKIP_QDRANT_SETUP:-0}" = "1" ]; then
    info "Skipping Qdrant setup because MAI_CODE_SKIP_QDRANT_SETUP=1."
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker was not found. Start Qdrant manually with: docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant"
    return
  fi

  if ! docker info >/dev/null 2>&1; then
    warn "Docker is installed but not running. Start Qdrant manually with: docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant"
    return
  fi

  if docker ps --format '{{.Names}}' | grep -Fxq "${QDRANT_CONTAINER_NAME}"; then
    ok "Qdrant container '${QDRANT_CONTAINER_NAME}' is already running."
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -Fxq "${QDRANT_CONTAINER_NAME}"; then
    info "Starting existing Qdrant container '${QDRANT_CONTAINER_NAME}' …"
    if docker start "${QDRANT_CONTAINER_NAME}" >/dev/null; then
      ok "Qdrant is running on http://localhost:${QDRANT_HTTP_PORT}"
    else
      warn "Could not start existing Qdrant container '${QDRANT_CONTAINER_NAME}'. Start it manually with: docker start ${QDRANT_CONTAINER_NAME}"
    fi
    return
  fi

  info "Starting Qdrant via Docker on ports ${QDRANT_HTTP_PORT}/${QDRANT_GRPC_PORT} …"
  if docker run -d \
    --name "${QDRANT_CONTAINER_NAME}" \
    -p "${QDRANT_HTTP_PORT}:6333" \
    -p "${QDRANT_GRPC_PORT}:6334" \
    qdrant/qdrant >/dev/null; then
    ok "Qdrant is running on http://localhost:${QDRANT_HTTP_PORT}"
  else
    warn "Could not start Qdrant automatically. Start it manually with: docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant"
  fi
}

# ── clone or update ───────────────────────────────────────────────────────────

if [ -d "${INSTALL_DIR}/.git" ]; then
  info "Updating existing installation in ${INSTALL_DIR} …"
  git -C "${INSTALL_DIR}" pull --ff-only
elif [ -e "${INSTALL_DIR}" ]; then
  err "'${INSTALL_DIR}' already exists but is not a git repository. Remove it or set MAI_CODE_DIR to a different path and retry."
else
  info "Cloning mai-code-mcp into ${INSTALL_DIR} …"
  git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
fi

# ── build & install globally ──────────────────────────────────────────────────

info "Installing dependencies …"
npm --prefix "${INSTALL_DIR}" install

info "Building …"
npm --prefix "${INSTALL_DIR}" run build

info "Linking mai-code globally …"
(cd "${INSTALL_DIR}" && npm link)

ensure_qdrant

ok "mai-code installed successfully! Run 'mai-code --help' to get started."
ok "To update in the future, run: mai-code update"
