# ─────────────────────────────────────────────────────────────────────────────
FROM postgres:16-alpine

# openssl: cifrado AES-256; bash: scripting del backup
RUN apk add --no-cache bash openssl

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Cron de root: backup diario a las 02:00 AM UTC
RUN echo "0 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" | crontab -

# crond -f: foreground (necesario para que Docker no salga)
# crond -l 2: nivel de log (2 = info)
CMD ["crond", "-f", "-l", "2"]
