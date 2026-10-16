FROM jsreport/worker:local
USER root

# install extra fonts
RUN apt-get update && \
    apt-get install -y fonts-dejavu-core fonts-dejavu-extra fonts-droid-fallback fonts-tlwg-garuda fonts-tlwg-kinnari fonts-tlwg-laksaman fonts-tlwg-loma fonts-tlwg-mono fonts-tlwg-norasi fonts-tlwg-purisa fonts-tlwg-sawasdee fonts-tlwg-typewriter fonts-tlwg-typist fonts-tlwg-typo fonts-tlwg-umpush fonts-tlwg-waree

# cleanup
RUN rm -rf /var/lib/apt/lists/* /var/cache/apt/* && \
    rm -rf /src/*.deb && \
    rm -rf /tmp/*

USER jsreport:jsreport

COPY --chown=jsreport:jsreport jo /app/jo
COPY --chown=jsreport:jsreport ./bootstrap/* /app/bootstrap

RUN npm install @jsreport/jsreport-ejs@4.1.0 \
    @jsreport/jsreport-pug@5.1.0

# dependencies used in code
# (request and moment are needed as part of support for allowed modules
# inside scripts, helpers)
RUN npm install request@2.88.2 moment@2.31.0 underscore@1.13.8

COPY --chown=jsreport:jsreport patch /app

RUN npm cache clean -f && \
    rm -rf /tmp/*

ENV extensions_jo=/app/jo

USER root

CMD ["node", "server.js"]
