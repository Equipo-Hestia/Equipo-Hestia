# ─────────────────────────────────────────────────────────────────────────────
FROM postgres:16-alpine

# openssl: cifrado AES-256; bash: scripting del backup; tzdata: hora de Chile
RUN apk add --no-cache bash openssl tzdata

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/backup-entrypoint.sh

# Cron de root: backup diario a las 02:00. crond usa la TZ del contenedor
# (TZ=America/Santiago en docker-compose.yml), asi que corre a las 02:00
# hora de Chile, no UTC. El log queda en el volumen /backups.
RUN echo "0 2 * * * /usr/local/bin/backup.sh >> /backups/backup.log 2>&1" | crontab -

# El entrypoint guarda el entorno en /etc/backup.env (cron no lo hereda).
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]

# crond -f: foreground (necesario para que Docker no salga)
# crond -l 2: nivel de log (2 = info)
CMD ["crond", "-f", "-l", "2"]
