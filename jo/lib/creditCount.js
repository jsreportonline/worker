module.exports = (reporter) => {
  reporter.initializeListeners.add('creditCount', () => {
    reporter.afterRenderListeners.add('creditCount', (req, res) => updateBilling(reporter, req, res))
    reporter.renderErrorListeners.add('creditCount', (req, res) => updateBilling(reporter, req, res))
  })
}

function updateBilling (reporter, req, res) {
  if (!req.context.joMeasureStartTime || req.context.isChildRequest) {
    // the billing is not updated when:
    // - the rendering failed so beforeRenderListeners was not able to set joMeasureStartTime
    // - the current request is a child request
    return
  }

  const duration = new Date().getTime() - req.context.joMeasureStartTime
  const creditsSpent = duration / 1000
  const isPreviewRequest = req.options.preview === true || req.options.preview === 'true'

  reporter.logger.info(`Credits spent in request: ${creditsSpent}${isPreviewRequest ? ', the credits weren\'t charged because this was preview request from jsreport studio' : ''}`, req)

  // add to headers the credits spent in this request
  res.meta.headers = res.meta.headers || {}
  res.meta.headers['JO-Credits-Spent'] = creditsSpent

  if (
    isPreviewRequest ||
        req.context.throttled
  ) {
    return
  }

  const tenant = req.context.tenant

  try {
    return reporter.executeMainAction('jo.updateTenant', {
      $inc: {
        creditsUsed: duration
      }
    }, req)
  } catch (e) {
    reporter.logger.error(`Unable to update tenant ${tenant.name} credits ${e.stack}`)
  }
}
