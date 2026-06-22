FROM node:20-alpine

WORKDIR /app

# Install dependencies (including dev for Prisma generate)
COPY backend/package*.json ./
RUN npm ci

# Copy source code (backend folder contents)
COPY backend/ .

# Generate Prisma client
RUN npx prisma generate

# Expose port (use environment PORT default 3001)
EXPOSE 3001

# Start the server
CMD ["node", "src/index.js"]
