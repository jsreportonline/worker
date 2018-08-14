const Promise = require('bluebird')
const stream = require('stream')
const readFileAsync = Promise.promisify(require('fs').readFile)
const request = require('request')
const requestAsync = Promise.promisify(request)
const toArray = require('stream-to-array')

const windowsWorkerUrlKey = Symbol('windowsWorkerUrlKey')

function responseToBuffer (response, cb) {
  toArray(response, (err, arr) => {
    cb(err, Buffer.concat(arr))
  })
}

module.exports = ({ processor, options }) => {
  processor.addRecipeExtensionLoadListener('jo', (reporter, recipeExtensionName, recipeName) => {
    if (recipeExtensionName === 'jsreport-phantom-pdf') {
      const originalConversion = reporter['phantom-pdf'].conversion

      reporter['phantom-pdf'].conversion = function (opts, cb) {
        if (!opts[windowsWorkerUrlKey]) {
          originalConversion(opts, cb)
          return
        }

        if (opts.waitForJS && opts.settings.javascriptEnabled === false) {
          throw new Error('can\'t use waitForJS option if settings.javascriptEnabled is not activated');
        }

        const windowsServerUrl = opts[windowsWorkerUrlKey]

        delete opts[windowsWorkerUrlKey]

        const windowsWorkerLog = {
          level: 'info',
          message: `Delegating recipe ${recipeName} to windows worker`,
          timestamp: new Date()
        }

        requestAsync({
          url: windowsServerUrl,
          method: 'POST',
          body: {
            data: opts
          },
          json: true
        }).then((httpResponse) => {
          if (httpResponse.body && httpResponse.statusCode === 400) {
            const e = new Error()
            e.message = httpResponse.body.error.message
            e.stack = httpResponse.body.error.stack
            e.weak = true
            throw e
          }

          if (!httpResponse.body || httpResponse.statusCode !== 200) {
            throw new Error(httpResponse.body || 'Phantomjs rendering failed')
          }

          const bufferStream = new stream.PassThrough()

          bufferStream.end(Buffer.from(httpResponse.body.content, 'base64'))

          const logs = httpResponse.body.logs.map((m) => Object.assign(m, { timestamp: new Date(m.timestamp) }))

          logs.unshift(windowsWorkerLog)

          return {
            logs,
            numberOfPages: httpResponse.body.numberOfPages,
            stream: bufferStream
          }
        }).then((res) => {
          cb(null, res)
        }).catch((err) => {
          let errorToUse = err

          if (err.weak !== true && err.code === 'ECONNRESET' || err.message.indexOf('socket hang up') !== -1) {
            errorToUse = new Error(`The communication with your windows phantom-pdf worker crashed. This is usually caused by reaching provided resources limits or phantomjs unexpected fail. The container is now about to be restarted. ${err.message}`)
          }

          cb(errorToUse)
        })
      }
    } else if (recipeExtensionName === 'jsreport-wkhtmltopdf') {
      const originalConversion = reporter['wkhtmltopdf'].conversion

      reporter.wkhtmltopdf.conversion = async function (args, req) {
        if (!req.template.wkhtmltopdf[windowsWorkerUrlKey]) {
          return originalConversion.call(reporter.wkhtmltopdf, args, req)
        }

        const windowsServerUrl = req.template.wkhtmltopdf[windowsWorkerUrlKey]

        // pdf output file is not relevant
        const newArgs = [...args]

        newArgs.pop()

        const html = newArgs.pop()

        const opts = {
          args: [],
          recipe: 'wkhtmltopdf',
          wkhtmltopdfVersion: req.template.wkhtmltopdf.wkhtmltopdfVersion
        }

        const promises = []

        for (let i = 0; i < newArgs.length; i++) {
          switch (newArgs[i]) {
            case '--header-html': {
              promises.push(readFileAsync(newArgs[i + 1].substring('file:///'.length)).then((content) => (opts['header-html'] = content.toString())))
              break
            }
            case '--footer-html': {
              promises.push(readFileAsync(newArgs[i + 1].substring('file:///'.length)).then((content) => (opts['footer-html'] = content.toString())))
              break
            }
            case '--cover-html': {
              promises.push(readFileAsync(newArgs[i + 1].substring('file:///'.length)).then((content) => (opts['cover'] = content.toString())))
              break
            }
            default: {
              if (i > 0 && newArgs[i - 1] !== '--header-html' && newArgs[i - 1] !== '--footer-html' && newArgs[i - 1] !== '--cover') {
                opts.args.push(newArgs[i])
              }
            }
          }
        }

        return Promise.all(promises).then(() => readFileAsync(html)).then((content) => {
          opts.html = content.toString()

          return new Promise((resolve, reject) => {
            request({
              url: windowsServerUrl,
              method: 'POST',
              body: {
                data: opts
              },
              json: true
            }).on('error', (err) => {
              reject(err)
            }).on('response', (response) => {
              responseToBuffer(response, (err, data) => {
                if (err) {
                  return reject(err)
                }

                if (response.statusCode === 400) {
                  const workerErr = JSON.parse(data.toString())
                  const e = new Error()
                  e.message = workerErr.error.message
                  e.stack = workerErr.error.stack
                  e.weak = true
                  return reject(e)
                }

                if (response.statusCode === 200) {
                  resolve(data)
                } else {
                  const errorMessage = data.toString()
                  reject(new Error(errorMessage))
                }
              })
            })
          }).catch((err) => {
            if (err.weak === true) {
              throw err
            }

            if (err.code === 'ECONNRESET' || err.message.indexOf('socket hang up') !== -1) {
              throw new Error(`The communication with your windows wkhtmltopdf worker crashed. This is usually caused by reaching provided resources limits or wkhtmltopdf unexpected fail. The container is now about to be restarted. ${err.message}`)
            }

            throw err
          })
        })
      }
    }
  })

  processor.addExecuteListener('jo', ({ type, workerRequest, httpReq, executeRecipe, data }) => {
    if (type !== 'recipe') {
      return
    }

    if (!data || !data.req) {
      return
    }

    const req = data.req

    if (req.context.windowsWorker) {
      const recipe = req.template.recipe

      if (recipe !== 'phantom-pdf' && recipe !== 'wkhtmltopdf') {
        throw new Error(`recipe ${recipe} not supported in windows workers`)
      }

      if (recipe === 'wkhtmltopdf') {
        req.template.wkhtmltopdf[windowsWorkerUrlKey] = req.context.windowsWorker.url
      } else {
        req.template.phantom[windowsWorkerUrlKey] = req.context.windowsWorker.url
      }

      return workerRequest.process(httpReq, () => executeRecipe(data).then((result) => {
        if (recipe === 'wkhtmltopdf') {
          delete req.template.wkhtmltopdf[windowsWorkerUrlKey]
        } else {
          delete req.template.phantom[windowsWorkerUrlKey]
        }

        return result
      }, (err) => {
        if (recipe === 'wkhtmltopdf') {
          delete req.template.wkhtmltopdf[windowsWorkerUrlKey]
        } else {
          delete req.template.phantom[windowsWorkerUrlKey]
        }

        throw err
      }))
    }
  })
}
