# Serve the Shipyard website with nginx inside a container.
#   docker build -t shipyard .
#   docker run -d -p 8080:80 shipyard
# then open http://localhost:8080
FROM nginx:1.27-alpine
COPY *.html *.css *.js /usr/share/nginx/html/
COPY topics/ /usr/share/nginx/html/topics/
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/ >/dev/null || exit 1
