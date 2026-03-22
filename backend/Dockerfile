FROM public.ecr.aws/docker/library/node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./
COPY prisma ./prisma

RUN npm install

COPY src ./src
COPY tests ./tests
COPY vitest.config.js ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
