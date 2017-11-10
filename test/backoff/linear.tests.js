var assert = require('assert')
var linear = require('../../lib/backoff/linear')

describe('Linear Backoff', function() {

    it('should backoff by 1 seconds by default', function() {
        var backoff = linear()
        assert.equal(backoff.next(), 1000)
        assert.equal(backoff.next(), 1000)
        assert.equal(backoff.next(), 1000)
    })

    it('should backoff by the specified value', function() {
        var backoff = linear({ min: 2000 })
        assert.equal(backoff.next(), 2000)
        assert.equal(backoff.next(), 2000)
        assert.equal(backoff.next(), 2000)
    })

    it('should backoff by within a range', function() {
        var backoff = linear({ min: 1000, max: 1002 })
        var results = []
        for (var i = 0; i < 1000; i++) {
            var value = backoff.next()
            if (results.indexOf(value) < 0) results.push(value)
        }
        assert.deepEqual(results.sort(), [1000, 1001, 1002])
    })

})
