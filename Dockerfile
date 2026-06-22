FROM node:20-alpine

# ── Step 1: Build the frontend ──
WORKDIR /app/frontend
COPY queuecure/frontend/package*.json ./
RUN npm ci
COPY queuecure/frontend/ ./
RUN npm run build

# ── Step 2: Set up the backend ──
WORKDIR /app/backend
COPY queuecure/backend/package*.json ./
RUN npm ci
COPY queuecure/backend/ ./
RUN npx prisma generate

# Copy the built frontend into the backend's public folder
RUN cp -r /app/frontend/dist /app/backend/public

EXPOSE 3001

CMD ["node", "src/index.js"]
