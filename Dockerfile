# --- Build Stage ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS prod
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/.env* ./

EXPOSE 3000
CMD ["node", "dist/index.js"]