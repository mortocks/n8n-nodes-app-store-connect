# n8n image with n8n-nodes-app-store-connect preloaded.
#
# The package is installed into a custom-extensions directory that n8n scans on
# startup (via N8N_CUSTOM_EXTENSIONS) and loads exactly like an installed
# community node. This is the reliable mechanism for a *local, unpublished*
# build; once the package is published to npm you would instead install it from
# n8n's in-app "Settings → Community nodes" screen by name.
#
# IMPORTANT: the install lives at /home/node/n8n-custom-nodes, deliberately
# OUTSIDE the ~/.n8n data directory, so that mounting a persistent volume on
# ~/.n8n (see docker-compose.yml) does not shadow/hide the baked-in package.
#
# The .tgz is produced by `npm pack` (see docker/README.md / the compose file).
ARG N8N_VERSION=2.31.4
FROM n8nio/n8n:${N8N_VERSION}

ENV N8N_CUSTOM_EXTENSIONS=/home/node/n8n-custom-nodes

USER root

# Exactly one .tgz is expected in the build context (docker/).
COPY *.tgz /tmp/pkg.tgz

# Install into the custom-extensions dir (n8n scans <dir>/node_modules).
# --omit=peer keeps n8n-workflow (a peer dep n8n already provides) out.
RUN mkdir -p /home/node/n8n-custom-nodes \
 && cd /home/node/n8n-custom-nodes \
 && npm init -y >/dev/null 2>&1 \
 && npm install /tmp/pkg.tgz --omit=peer --no-audit --no-fund \
 && rm -f /tmp/pkg.tgz \
 && chown -R node:node /home/node/n8n-custom-nodes

USER node
