#!/bin/sh
# Creates a throwaway CA and a certificate for the hosts the mock impersonates.
# bundle.pem = system CAs + this CA, used by PHP as its CA file.
set -eu
cd /certs
[ -f bundle.pem ] && exit 0

apk add --no-cache openssl >/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=assisteai-legacy-env mock CA" \
  -keyout ca.key -out ca.pem 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=mock" -keyout mock.key -out mock.csr 2>/dev/null
printf 'subjectAltName=DNS:api.themoviedb.org,DNS:api.telegram.org,DNS:www.googleapis.com\n' > san.ext
openssl x509 -req -in mock.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 3650 -extfile san.ext -out mock.pem 2>/dev/null
cat /etc/ssl/certs/ca-certificates.crt ca.pem > bundle.pem
chmod 644 mock.key
