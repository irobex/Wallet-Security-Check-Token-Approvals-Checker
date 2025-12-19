FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime: include Playwright dependencies for PDF generation (Chromium).
# Using Playwright base image simplifies Debian deployment (no extra apt libs).
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist

# Ensure Chromium is installed for Playwright PDF rendering
RUN npx playwright install --with-deps chromium

CMD ["node", "dist/bot/bot.js"]


