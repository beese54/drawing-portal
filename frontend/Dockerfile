FROM nginx:alpine
LABEL version="1"
COPY dist/ /usr/share/nginx/html
RUN printf 'server {\n    listen 3000;\n    server_name _;\n    root /usr/share/nginx/html;\n    index index.html;\n    location / {\n        try_files $uri $uri/ /index.html;\n    }\n    gzip on;\n    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
