FROM jsreport/jsreport-worker

# phantomjs
RUN curl -Lo phantomjs.tar.bz2 https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-1.9.8-linux-x86_64.tar.bz2 && \
    tar jxvf phantomjs.tar.bz2 && \
    chmod +x phantomjs-1.9.8-linux-x86_64/bin/phantomjs && \
    mv phantomjs-1.9.8-linux-x86_64/bin/phantomjs /usr/local/bin/ && \
    rm -rf phantomjs* && \
    # cleanup
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* && \
    rm -rf /src/*.deb

RUN npm install phantomjs-exact-2-1-1 jsreport-phantom-pdf

RUN npm cache clean -f && \
    rm -rf /tmp/*

COPY ./jo.reporter.json /app
COPY ./bootstrap/* /app/bootstrap

ENV electron:strategy electron-ipc
ENV phantom:strategy phantom-server
