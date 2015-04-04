var debug = require('debug')('amqp-nice:config:tests')
var assert = require('assert')
var format = require('util').format
var _ = require('lodash')
var validate = require('../lib/config/validate')

describe('Validation', function() {

    describe('Bindings', function() {

        it('should mandate a source', function() {
            validate({
                vhosts: {
                    v1: {
                        bindings: {
                            b1: {
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 is missing a source', err.message)
            })
        })

        it('should mandate a destination', function() {
            validate({
                vhosts: {
                    v1: {
                        bindings: {
                            b1: {
                                source: 'e1'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 is missing a destination', err.message)
            })
        })

        it('should mandate a destination type', function() {
            validate({
                vhosts: {
                    v1: {
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'q1'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 is missing a destination type', err.message)
            })
        })

        it('should report invalid destination types', function() {
            validate({
                vhosts: {
                    v1: {
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'q1',
                                destinationType: 'foo'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 has an invalid destination type: foo', err.message)
            })
        })

        it('should report unknown sounce exchanges (a)', function() {
            validate({
                vhosts: {
                    v1: {
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'q1',
                                destinationType: 'queue'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 refers to an unknown exchange: e1', err.message)
            })
        })

        it('should report unknown source exchanges (b)', function() {
            validate({
                vhosts: {
                    v1: {
                        exchanges: {
                        },
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'q1',
                                destinationType: 'queue'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 refers to an unknown exchange: e1', err.message)
            })
        })

        it('should report unknown destination exchanges', function() {
            validate({
                vhosts: {
                    v1: {
                        exchanges: {
                            e1: {
                            }
                        },
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'e2',
                                destinationType: 'exchange'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 refers to an unknown exchange: e2', err.message)
            })
        })

        it('should report unknown destination queues (a)', function() {
            validate({
                vhosts: {
                    v1: {
                        exchanges: {
                            e1: {
                            }
                        },
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'q1',
                                destinationType: 'queue'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 refers to an unknown queue: q1', err.message)
            })
        })

        it('should report unknown destination queues (b)', function() {
            validate({
                vhosts: {
                    v1: {
                        exchanges: {
                            e1: {
                            }
                        },
                        queues: {
                        },
                        bindings: {
                            b1: {
                                source: 'e1',
                                destination: 'q1',
                                destinationType: 'queue'
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 refers to an unknown queue: q1', err.message)
            })
        })
    })

    describe('Publications', function() {

        it('should mandate a vhost', function() {
            validate({
                publications: {
                    p1: {
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 is missing a vhost', err.message)
            })
        })

        it('should mandate either an exchange or a queue (a)', function() {
            validate({
                publications: {
                    p1: {
                        vhost: 'v1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 is missing an exchange or a queue', err.message)
            })
        })

        it('should mandate either an exchange or a queue (b)', function() {
            validate({
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 has an exchange and a queue', err.message)
            })
        })


        it('should report unknown vhosts (a)', function() {
            validate({
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unknown vhost: v1', err.message)
            })
        })

        it('should report unknown vhosts (b)', function() {
            validate({
                vhosts: {
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unknown vhost: v1', err.message)
            })
        })

        it('should report unknown exchanges (a)', function() {
            validate({
                vhosts: {
                    v1: {
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unknown exchange: e1 in vhost: v1', err.message)
            })
        })

        it('should report unknown exchanges (b)', function() {
            validate({
                vhosts: {
                    v1: {
                        exchanges: {
                        }
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        exchange: 'e1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unknown exchange: e1 in vhost: v1', err.message)
            })
        })

        it('should report unknown queues (a)', function() {
            validate({
                vhosts: {
                    v1: {
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unknown queue: q1 in vhost: v1', err.message)
            })
        })

        it('should report unknown queues (b)', function() {
            validate({
                vhosts: {
                    v1: {
                        queues: {
                        }
                    }
                },
                publications: {
                    p1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unknown queue: q1 in vhost: v1', err.message)
            })
        })
    })

    describe('Subscriptions', function() {

        it('should mandate a vhost', function() {
            validate({
                subscriptions: {
                    s1: {
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 is missing a vhost', err.message)
            })
        })

        it('should mandate a queue', function() {
            validate({
                subscriptions: {
                    s1: {
                        vhost: 'v1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 is missing a queue', err.message)
            })
        })

        it('should report unknown vhosts (a)', function() {
            validate({
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 refers to an unknown vhost: v1', err.message)
            })
        })

        it('should report unknown vhosts (b)', function() {
            validate({
                vhosts: {
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 refers to an unknown vhost: v1', err.message)
            })
        })

        it('should report unknown queues (a)', function() {
            validate({
                vhosts: {
                    v1: {
                    }
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 refers to an unknown queue: q1 in vhost: v1', err.message)
            })
        })

        it('should report unknown queues (b)', function() {
            validate({
                vhosts: {
                    v1: {
                        queues: {
                        }
                    }
                },
                subscriptions: {
                    s1: {
                        vhost: 'v1',
                        queue: 'q1'
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 refers to an unknown queue: q1 in vhost: v1', err.message)
            })
        })
    })

    describe('Vocabulary', function() {

        it('should report invalid vhost attribute', function() {
            validate({
                vhosts: {
                    v1: {
                        invalid: true
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Vhost: v1 refers to an unsupported attribute: invalid', err.message)
            })
        })

        it('should report invalid connection attributes', function() {
            validate({
                vhosts: {
                    v1: {
                        connection: {
                            invalid: true
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Vhost: v1 connection refers to an unsupported attribute: invalid', err.message)
            })
        })

        it('should report invalid exchange attributes', function() {
            validate({
                vhosts: {
                    v1: {
                        exchanges: {
                            e1: {
                                invalid: true
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Exchange: e1 in vhost: v1 refers to an unsupported attribute: invalid', err.message)
            })
        })

        it('should report invalid queues attributes', function() {
            validate({
                vhosts: {
                    v1: {
                        queues: {
                            q1: {
                                invalid: true
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Queue: q1 in vhost: v1 refers to an unsupported attribute: invalid', err.message)
            })
        })

        it('should report invalid binding attributes', function() {
            validate({
                vhosts: {
                    v1: {
                        bindings: {
                            b1: {
                                invalid: true
                            }
                        }
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Binding: b1 in vhost: v1 refers to an unsupported attribute: invalid', err.message)
            })
        })

        it('should report invalid publication attributes', function() {
            validate({
                publications: {
                    p1: {
                        invalid: true
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Publication: p1 refers to an unsupported attribute: invalid', err.message)
            })
        })

        it('should report invalid subscription attributes', function() {
            validate({
                subscriptions: {
                    s1: {
                        invalid: true
                    }
                }
            }, function(err) {
                assert.ok(err)
                assert.equal('Subscription: s1 refers to an unsupported attribute: invalid', err.message)
            })
        })
    })

})
