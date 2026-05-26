FROM node:20-alpine
LABEL version="4"
RUN npm install -g serve
COPY dist/ /app
EXPOSE 3000
CMD ["serve", "-s", "/app", "-l", "3000"]
