FROM jsreport/worker:3.13.0
USER root

# phantomjs and electron deps
RUN apt-get update && \
    apt-get install -y libgtk2.0-dev pango1.0-dev libharfbuzz-dev libharfbuzz-icu0 && \
    apt-get install -y bzip2 libxtst-dev libxss1 libgconf2-dev libnss3-dev libasound2-dev libnotify4 libxrender1 libxext6 xvfb dbus-x11 && \
    apt-get install -y libfontconfig fonts-dejavu-core fonts-dejavu-extra fonts-droid-fallback fonts-tlwg-garuda fonts-tlwg-kinnari fonts-tlwg-laksaman fonts-tlwg-loma fonts-tlwg-mono fonts-tlwg-norasi fonts-tlwg-purisa fonts-tlwg-sawasdee fonts-tlwg-typewriter fonts-tlwg-typist fonts-tlwg-typo fonts-tlwg-umpush fonts-tlwg-waree

# phantomjs binary
RUN curl -Lo phantomjs.tar.bz2 https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-1.9.8-linux-x86_64.tar.bz2 && \
    tar jxvf phantomjs.tar.bz2 && \
    chmod +x phantomjs-1.9.8-linux-x86_64/bin/phantomjs && \
    mv phantomjs-1.9.8-linux-x86_64/bin/phantomjs /usr/local/bin/ && \
    rm -rf phantomjs*

# we need latest 0.12.6.1 wkhtmltopdf to fix the ssl issues with ubuntu focal
RUN wget -O wkhtmltox_0.12.6-1.focal_amd64.deb https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox_0.12.6-1.focal_amd64.deb
RUN dpkg --install wkhtmltox_0.12.6-1.focal_amd64.deb && rm wkhtmltox_0.12.6-1.focal_amd64.deb

# cleanup
RUN rm -rf /var/lib/apt/lists/* /var/cache/apt/* && \
    rm -rf /src/*.deb && \
    rm -rf /tmp/*

USER jsreport:jsreport

COPY --chown=jsreport:jsreport jo /app/jo
COPY --chown=jsreport:jsreport ./bootstrap/* /app/bootstrap

RUN npm install @jsreport/jsreport-ejs@4.0.0 \
    @jsreport/jsreport-pug@5.0.0 \
    @jsreport/jsreport-electron-pdf@5.0.0 \
    @jsreport/jsreport-wkhtmltopdf@4.0.0 \
    @jsreport/jsreport-phantom-pdf@4.0.0 \
    phantomjs-exact-2-1-1@0.1.0 \
    electron@1.8.7 --save

# dependencies used in code
# (request and moment are needed as part of support for allowed modules
# inside scripts, helpers)
RUN npm install request@2.88.2 moment@2.29.3 underscore@1.13.3

COPY --chown=jsreport:jsreport patch /app

RUN npm cache clean -f && \
    rm -rf /tmp/*

ENV extensions_jo /app/jo

ENV DISPLAY :99

USER root

# puppeteer installs chrome to the folder /home/jsreport/.cache/puppeteer in the base worker
# we run with root here, so we need to change it
ENV PUPPETEER_CACHE_DIR /home/jsreport/.cache/puppeteer

# startup script to launch dbus and xvfb correctly along with our app:
# - we ensure that lock files created by Xvfb server (stored at /tmp/ with file names like /tmp/.X99-lock)
#   are cleanup correctly on each container run (rm -f /tmp/.X*lock),
#   the lock file created by the Xvfb server is a signal that xvfb uses to determine if the server is already running.
#   this step is important because the `workers` service is constantly restarting the container (docker restart -t 0) in a "hard" way,
#   which does not let the Xvfb server to clean up its lock files correctly, we are cleaning up those lock files manually when the container
#   runs to avoid errors like "Fatal server error: Server is already active for display 99 If this server is no longer running, remove /tmp/.X99-lock and start again"
#   after restarting the container
# - we ensure that temp folders and files created by xvfb-run (stored at /tmp/ with folder names like /tmp/xvfb-run.4dsfx)
#   are cleanup correctly on each container run (rm -rfd /tmp/xvfb-run*)
#   this step is important because the `workers` service is constantly restarting the container (docker restart -t 0) in a "hard" way,
#   which does not let xvfb-run to clean up its temp files correctly, we are cleaning up those files manually when the container runs
#   to avoid having stale folders after restarting the container
# - we use xvfb-run command instead of manually configuring Xvfb server because xvfb-run has a built-in mechanism that waits until the Xvfb server
#   its already started before trying to start our app (xvfb-run --server-num=99 --server-args='-screen 0 1024x768x24 -ac' node index.js),
#   in case that errors from xvfb needs to be printed to stdout for debugging purposes just pass -e /dev/stdout option (xvfb-run -e /dev/stdout .......)
#   the important part of this command is the -ac option in --server-args, -ac disables host-based access control mechanisms in Xvfb server,
#   which prevents the connection to the Xvfb server from our app

CMD rm -f /tmp/.X*lock && rm -rfd /tmp/xvfb-run* && xvfb-run --server-num=99 --server-args='-screen 0 1024x768x24 -ac' node server.js
