# ====================================================
# Stage 1: Build stage
# ====================================================
FROM node:24-alpine AS builder

# Enable Corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

WORKDIR /app

# Copy package definitions, lockfiles & pnpm config
COPY package.json pnpm-lock.yaml .npmrc* ./

# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Copy TypeScript configuration and source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to dist/
RUN pnpm run build

# Remove devDependencies to produce lean production node_modules
RUN pnpm prune --prod

# ====================================================
# Stage 2: Production runtime stage
# ====================================================
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002

# Copy production artifacts and dependencies from builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy runtime assets and static data directories
COPY public ./public
COPY data ./data

# Set proper ownership for non-root runtime user
RUN chown -R node:node /app

USER node

EXPOSE 3002

CMD ["node", "dist/server.js"]