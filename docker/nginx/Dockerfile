FROM nginx:alpine

RUN apk add --no-cache gettext

COPY 00-map.conf /etc/nginx/conf.d/00-map.conf
COPY http-only.conf.template https.conf.template /opt/nginx-templates/
COPY entrypoint.sh /custom-entrypoint.sh
RUN chmod +x /custom-entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf

ENTRYPOINT ["/custom-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
