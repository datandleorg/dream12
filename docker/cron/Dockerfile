FROM alpine:3.20
RUN apk add --no-cache curl jq busybox
COPY run-cron-job.sh /usr/local/bin/run-cron-job.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /usr/local/bin/run-cron-job.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
