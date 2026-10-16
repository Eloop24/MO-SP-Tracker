FROM node:20-slim

# LibreOffice for DOCX to PDF conversion
RUN apt-get update && \\
    apt-get install -y --no-install-recommends \\
      libreoffice-writer \\
      libreoffice-common \\
      fonts-liberation \\
      fonts-dejavu-core \\
      fontconfig \\
    && fc-cache -f \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
# Skip postinstall (needs build-client.mjs which isn't copied yet)
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
