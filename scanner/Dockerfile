# Build requires a reviewed digest, not a mutable production base tag.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=UTC LC_ALL=C
RUN apt-get update && apt-get install -y --no-install-recommends clamav clamav-freshclam ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 scanner && useradd --uid 10001 --gid scanner --no-create-home scanner \
    && mkdir -p /var/lib/clamav /app && chown scanner:scanner /var/lib/clamav
WORKDIR /app
COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY freshclam.conf /app/freshclam.conf
# Vendor-signed definitions are seeded at build; build fails if updates fail.
RUN freshclam --config-file=/app/freshclam.conf --stdout
COPY core.py pdf_check.py service.py render_config.py run-service.template.yaml /app/
COPY tests /app/tests
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["gunicorn", "--bind=0.0.0.0:8080", "--workers=1", "--timeout=55", "--graceful-timeout=10", "--keep-alive=0", "--limit-request-line=1024", "--limit-request-fields=20", "--limit-request-field_size=20000", "--log-level=error", "service:create_app()"]
