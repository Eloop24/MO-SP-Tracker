FROM node:20-slim

# LibreOffice writer only — for DOCX → PDF conversion
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-common \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
