var format = require('util').format

function unqualifiedNameWarning(type, unqualifiedName, vhost) {
    if (process.env.RASCAL_DISABLE_ALL_DEPRECATION_WARNINGS || process.env.RASCAL_DISABLE_UNQUALIFIED_NAME_DEPRECATION_WARNING) return
    var qualifiedName = vhost === '/' ? format('/%s', unqualifiedName) : format('%s/%s', vhost, unqualifiedName)
    console.warn(format('Unqualified %s have been deprecated and will be removed in the next major version of rascal. Instead of %s use %s instead. See https://github.com/guidesmiths/rascal/issues/20', type, unqualifiedName, qualifiedName))
}

module.exports = {
    unqualifiedSubscriptionName: unqualifiedNameWarning.bind(null, 'subscriptions'),
    unqualifiedPublicationName: unqualifiedNameWarning.bind(null, 'publications')
}
