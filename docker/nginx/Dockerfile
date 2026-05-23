FROM nginx:alpine

# openssl necesario para generar certificado auto-firmado en primer arranque
RUN apk add --no-cache openssl

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
