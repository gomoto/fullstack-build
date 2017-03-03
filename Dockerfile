FROM node:7.5.0

WORKDIR /

RUN npm install --global gulp

COPY package.json ./
RUN npm install

COPY gulpfile.js ./

COPY install ./
RUN chmod +x ./install

COPY build ./
RUN chmod +x ./build

COPY watch ./
RUN chmod +x ./watch

COPY clean ./
RUN chmod +x ./clean

VOLUME /project

CMD ["./build"]
