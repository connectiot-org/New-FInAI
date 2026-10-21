FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
RUN --mount=type=secret,id=cloud_ca if [ -s /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; npm ci --no-audit --no-fund
COPY --chown=node:node . .
RUN --mount=type=secret,id=cloud_ca if [ -s /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; npm run generate && npm run build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
