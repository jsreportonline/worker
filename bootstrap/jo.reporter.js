const path = require('path')

module.exports = ({ options, eventsManager }) => {
  eventsManager.addWorkerInitListener('jo', (workerOptions, workerSystemOptions) => {
    // update the phantom 2 version path
    const phantom = workerOptions.extensionsDefs.find((extensionDef) => extensionDef.name === 'phantom-pdf')

    if (phantom?.options?.phantoms != null) {
      const phantomjsExact = phantom.options.phantoms.find((p) => p?.path?.endsWith('phantomjs-exact-2-1-1'))

      if (phantomjsExact != null) {
        phantomjsExact.path = path.dirname(require.resolve('phantomjs-exact-2-1-1'))
      }
    }
  })
}
