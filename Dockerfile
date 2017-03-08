FROM gomoto/node-docker-compose:latest

WORKDIR /

RUN npm install --global gulp

COPY package.json ./
RUN npm install

COPY install ./
RUN chmod +x ./install

COPY build ./
RUN chmod +x ./build

COPY watch ./
RUN chmod +x ./watch

COPY clean ./
RUN chmod +x ./clean

VOLUME ["/project/src", "/project/build"]

COPY config.js ./
COPY docker-compose.js ./
COPY docker-service.js ./
COPY gulpfile.js ./

EXPOSE 35729

CMD ["./build"]
