// we just measure quota time here, but the rejection is done earlier in the main to avoid overloading of workers
module.exports = (reporter) => {
  reporter.initializeListeners.add('quotaMeasure', () => {
    reporter.renderErrorListeners.add('quotaMeasure', (req) => updateQuota(reporter, req))
    reporter.afterRenderListeners.add('quotaMeasure', (req) => updateQuota(reporter, req))
  })
}

function updateQuota (reporter, req) {
  return reporter.executeMainAction('jo.updateTenant', {
    $inc: {
      quotaUsed: new Date().getTime() - req.context.joMeasureStartTime
    }
  }, req)
}
