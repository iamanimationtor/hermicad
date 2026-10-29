# syntax=docker/dockerfile:1
#
# تصویر تولید HERMICAD.
#
# چرا `output: standalone` استفاده نشده: آن حالت با دستور `next start` (که همهٔ
# آزمون‌های HTTP و CI این پروژه اجرا می‌کنند) ناسازگار است و اخطار می‌دهد. به‌جای
# دو مسیر اجرایی متفاوت، تصویر همان مسیری را اجرا می‌کند که آزمون‌ها می‌سنجند:
# `next start` روی خروجی build، با وابستگی‌های production.
#
# ساخت و اجرا:
#   docker build -t hermicad .
#   docker run -p 3000:3000 -e DATABASE_URL=postgresql://user:pass@host:5432/hermicad hermicad
#
# در production تنظیم DATABASE_URL الزامی است؛ بدون آن برنامه fail-closed
# عمل می‌کند (توضیح در src/db/config.ts). برای پیش‌نمایش تک‌فرایندی می‌توان
# HERMICAD_ALLOW_PGLITE_IN_PRODUCTION=1 داد که راهکار تولیدی نیست.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# tini: دریافت سیگنال توقف و انتقال آن به Node (خاموشی تمیز) بدون shell.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

# فقط وابستگی‌های production نصب می‌شوند (بدون ابزار آزمون و TypeScript).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# خروجی build + فایل‌های عمومی + پیکربندی؛ `next start` پیکربندی را در زمان اجرا
# می‌خواند، بنابراین next.config.ts باید در تصویر باشد.
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

# پوشهٔ دادهٔ PGlite (فقط برای پیش‌نمایش) و مالکیت برای کاربر غیر ریشه.
RUN mkdir -p /app/.data/hermicad && chown -R node:node /app/.data

USER node
EXPOSE 3000

# اگر پایگاه در دسترس نباشد، کانتینر ناسالم گزارش می‌شود.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
