FROM nginx:alpine
LABEL version="2"
COPY dist/ /usr/share/nginx/html
RUN printf 'server {\n    listen 3000;\n    server_name _;\n    root /usr/share/nginx/html;\n    index index.html;\n    location / {\n        try_files $uri $uri/ /index.html;\n    }\n    gzip on;\n    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\n}\n' > /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx/client_temp \
                /var/cache/nginx/proxy_temp \
                /var/cache/nginx/fastcgi_temp \
                /var/cache/nginx/uwsgi_temp \
                /var/cache/nginx/scgi_temp \
    && chmod -R 777 /var/cache/nginx \
    && touch /var/run/nginx.pid \
    && chmod 777 /var/run/nginx.pid
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
