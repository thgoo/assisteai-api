FROM php:8.3-cli

RUN docker-php-ext-install pdo_mysql

# Trust the mock's CA (see certs.sh) for curl, Guzzle and php-curl-class.
RUN printf 'curl.cainfo=/certs/bundle.pem\nopenssl.cafile=/certs/bundle.pem\n' > /usr/local/etc/php/conf.d/mock-ca.ini
