FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY admin.html /usr/share/nginx/html/admin.html
COPY rates.js /usr/share/nginx/html/rates.js
COPY images /usr/share/nginx/html/images
COPY videos /usr/share/nginx/html/videos
EXPOSE 80
