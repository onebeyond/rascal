# Change Log

## 14.4.0

- Report validation error when no vhosts are specified - See https://github.com/guidesmiths/rascal/issues/181

## 14.3.0

- Clone config instead of freezing it so buffers will work - See https://github.com/guidesmiths/rascal/issues/92

## 14.2.1

- Fix schema bug

## 14.2.0

- Add json schema (lib/config/schema.json) - See https://github.com/guidesmiths/rascal/issues/168

## 14.1.0

- Adds support for custom user agents - See https://github.com/guidesmiths/rascal/issues/170

## 14.0.1

- Fixes https://github.com/guidesmiths/rascal/issues/178

## 14.0.0

- Rather than waiting an arbitrary time for channels to close when cancelling a subscription, Rascal now waits until any outstanding messages have been acknowledged. By default, Rascal will wait indefinitely, but this behaviour can be overriden by specifying a subscription.closeTimeout. If the timeout is exceeded following a direct call to `broker.unsubscribeAll` or `subscription.cancel` then an error will be yielded. If the timeout is exceeded following an indirect call to `subscription.cancel` (e.g. by `broker.shutdown`) then an error will be emitted but the operation will be allowed to continue.
- Messages which cannot be recovered by the republish or forward strategies are nacked resulting in message loss unless a dead letter is configured.

## 13.1.4

- Fixed potential for returned messages cause the forward error strategy to yield twice
- Report returned messages from republish error strategy
- Tweak prettier rules

## 13.1.3

- Fixed minor memory leak in recovery strategy loop
- Move to prettier
- Remove unnecessary eslint install from github

## 13.1.2

- Fixed various issues when queue names contained period characters. Reported in https://github.com/guidesmiths/rascal/issues/166

## 13.1.1

- Moved setMaxListeners to createConnection task to suppress misleading 'Possible EventEmitter memory leak detected' warning. See https://github.com/guidesmiths/rascal/issues/164 for more details.

## 13.1.0

- Fixed bug where Rascal could wait indefinitely for channels to be destroyed if shutdown was called following a heartbeat timeout. See https://github.com/guidesmiths/rascal/issues/158 for more details.

## 13.0.6

- Fixed bug where Rascal attempted to remove a listener from a nulled connection and crashed.

## 13.0.5

- Set channel pool acquireTimeoutMillis in default configuration - thanks @matej-prokop
- Add snyk package health badge

## 13.0.4

- Fixed https://github.com/guidesmiths/rascal/issues/156

## 13.0.3

- Bump dev deps

## 13.0.2

- Fixed https://github.com/guidesmiths/rascal/issues/150

## 13.0.1

- Improved readme
- Update zUnit

## 13.0.0

- Switched to eslint-config-esnext and updated style
- Update production dependencies
- Fix vhost management cluster support

## 12.0.4

- Bump dev dependencies
- Upgraded to husky 5

## 12.0.3

- Fix https://github.com/guidesmiths/rascal/issues/141
- Fix error message typos
- Bump lodash

## 12.0.2

- Exclude various files (including the 12M cc-test-reporter binary) from the npm package.

## 12.0.1

- Moved from travis to github actions
- Fix broker waiting indefinitely when shutdown is called after losing a connection. See [#126](https://github.com/guidesmiths/rascal/issues/126)

## 12.0.0

- Removed node 8 support

## 11.0.1

- Replaced mocha with zunit

## 11.0.0

- Reworked tests to remove mocha --exit flag
- Exposed partially initialied brokerAsPromised on the rejected error via a symbol
- clear keep active interval on broker nuke
- Updated engine >= 8.0.0

## 10.2.6

### Updated

- Dependencies
- Removing Synk

## 10.2.5

### Updated

- Improved readme as per issue [#111](https://github.com/guidesmiths/rascal/issues/111)

### Fixed

- Fixed issue [#123](https://github.com/guidesmiths/rascal/issues/123), where a race condition was causing channels to be closed twice. Thanks @cinnq346.

## 10.2.4

### Fixed

- Fixed issue [#122](https://github.com/guidesmiths/rascal/issues/122), where error listeners were registered once, so repeated errors could bubble up and crash node

## 10.2.3

### Fixed

- Fixed second part of issue [#121](https://github.com/guidesmiths/rascal/issues/121), where the generic-pool could cause tight loops and memory leaks

## 10.2.2

### Fixed

- Fixed issue [#121](https://github.com/guidesmiths/rascal/issues/121), which caused rascals connection index to permanently increment rather than cycling back to 0. Consequently if all nodes in a cluster failed, Rascal could crash the application.

## 10.2.1

### Updated

- Support amqplib 0.6.0

## 10.2.0

### Added

- Added broker.getConnections()

### Updated

- Updated dependencies

## 10.1.0

### Added

- Added publication statistics
- Support for node 14

## 10.0.1

### Updated

- Set vhost max event listeners to inifinity (see https://github.com/guidesmiths/rascal/issues/99)

## 10.0.0

### Updated

- Using rascal to consume messages published with broker.forward no longer restores original routing headers by default, unless used in the context of a recovery strategy. See the broker.forward section of the readme for more information.

## 9.4.0

### Added

- vhost_initialised event
- publication paused notifications
- publication.abort

### Updated

- broker error events now include vhost connection details

## 9.3.0

### Updated

- [Fixed #78](https://github.com/guidesmiths/rascal/issues/78) by using a baseline config, and only laying connection options via withDefaultConfig

## 9.2.0

### Added

- [Fixed #93](https://github.com/guidesmiths/rascal/issues/93) through use of setInterval to keep node process active in the event of broker restart.

### Updated

- Dependencies
- Patched lodash
- Added snyk

## 9.1.3

### Updated

- Fixed bug where channels were destroyed instead of returned to the pool

## 9.1.2

### Updated

- Test to see whether setTimeout.unref is available before calling it

## 9.1.1

### Added

- Expose cloned subscription config on session

## 9.1.0

### Added

- Optionally promisify ackOrNack

## 9.0.0

### Updated

- Broker functions (publish, forward, nuke, etc) no longer return the broker.

### Added

- Added broker.subscribeAll

## 8.2.0

### Added

- Publication timeouts (default value is 10 seconds).

## 8.1.0

### Updated

- Fixed [#86](https://github.com/guidesmiths/rascal/issues/85)
- Fixed [#84](https://github.com/guidesmiths/rascal/issues/84). Thanks @huikaihoo

### Added

- Added a new subscription `subscribed` event

## 8.0.1

### Updated

- emit error when publishFn err Channel closed as oer https://github.com/guidesmiths/rascal/pull/81. Thanks @zijin-m

## 8.0.0

### Updated

- Drop support for Node 6
- Updated dependencies as per https://github.com/guidesmiths/rascal/pull/75. Thanks @ravihara

## 7.0.0

### Updated

- Rascal attempts to resubscribe following a consumer cancel. See the README for more details
- Undocumented SubscriberSession.close function has been removed (Use .cancel instead)

## 6.0.3

### Fixed

- Fixed [#72](https://github.com/guidesmiths/rascal/issues/72) which meant published messages waiting for a channel would be lost on connection error

## 6.0.2

### Fixed

- Fixed bug that caused management credentials to be ignored. Thanks @juliendangers

## 6.0.1

### Updated

## 6.0.0

- Improved channel pool management (includes a breaking config change - see https://github.com/guidesmiths/rascal#channel-pooling).

## 5.1.0

### Added

- Added potential for flow control / throttling via broker 'busy' and 'ready' events.

## 5.0.0

### Updated

- Wait for subscriber channels to be closed before shutting down the broker
- Reduced default close channel deferral from 1 minute to 10 seconds in default config and from 1 minute to 100ms in test config

## 4.7.0

### Updated

- Dependencies

### Added

- Support for active/passive connection management

## 4.6.2

### Fixed

- Fixed a bug where you could not re-initialise a vhost

## 4.6.1

### Added

- Automated codeclimate reporting

### Fixed

- Fixed a bug where the connection index could be undefined

## 4.6.0

### Updated

- Fixes for #60 and #61. Thanks @rossj.
- Depend on amqplib ^0.5.5

## 4.5.2

### Updated

- Depend on version 0.5.3 of amqplib (peer) until https://github.com/squaremo/amqp.node/issues/534 is fixed

## 4.5.1

### Updated

- Depend on version 0.5.3 of amqplib until https://github.com/squaremo/amqp.node/issues/534 is fixed
- Update dependencies

## 4.5.0

### Updated

- Replaced request with superagent. Thanks @ksnll
- Updated dependencies
- Added node 12 to travis config

## 4.4.0

### Updated

- Throw error when using cluster based redeliveries counter outside of a cluster

## 4.3.1

### Updated

- Dependencies
- Moved amqplib to peer dependency

## Added

- broker.connect(vhost)

## 4.2.1

### Updated

- Dependencies
- Fixed vararg related bug in Broker.create

## 4.2.2

### Updated

- Updated various dev dependencies
- Readme
- Switched from istanbul to nyc
- Fix flakey travis tests

## 4.2.1

### Updated

- Updated lodash

## 4.2.0

### Added

- Support for RabbitMQs default exchange

## 4.1.0

### Added

- Publisher error events are passed the messageId where possible

## 4.0.0

### Updated

- Improved connection failure error message
- It is possible to go async between broker.subscribe and subscription.on('message'). This unlocks the possibility of promise support.
- Support promises
- Discourage use of broker.init

## 3.2.3

### Updated

- Fix connection handler leak caused by re-subscription
- Fix channel leak when channel.consume fails
- amqplib version to 0.5.3
- test on Node 11

## 3.2.2

### Added

- Some additional debug

## 3.2.1

### Fixed

- Catch and return encryption errors via publish callback

### Added

- Assert vhosts into exhistence using the RabbitMQ management API

### Updated

- Changed new Buffer() to Buffer.from to silence Node 10 deprecation warning

## 3.2.0

### Added

- Transparent encryption / decryption

## 3.1.3

### Updated

- Modernise code style

## 3.1.2

### Updated

- Fix redelivery counter defaults

## 3.1.1

### Updated

- Fix channelMax default

## 3.1.0

### Added

- Handling of redelivery counter errors and timeouts

## 3.0.0

### Updated

- Using lodash defaultsDeep instead of merge-defaults (fixes hoek vulnerability). The behaviour seems consistent but releasing as a breaking change as a precaution.
- Unqualified default publications and subscriptions are no longer supported. See https://github.com/guidesmiths/rascal/issues/20
- Testing on node 10

## 2.12.2

### Updated

- Update dependencies (fixes hoek vulnerability)

## 2.12.1

### Updated

- Fixed bug that prevented publication from emitting channel errors

## 2.12.0

### Updated

- Update dependencies
- Update dev dependencies

## 2.11.3

### Updated

- npm issue

## 2.11.2

### Updated

- npm issue

## 2.11.1

### Fixed

- Fixed undefined error in Vhost.bounce

## 2.11.0

### Fixed

- Support for queue and exchange names containeing period and hyphens

## 2.10.0

### Fixed

- Workaround for non deterministic amqplib channel handling, see https://github.com/squaremo/amqp.node/issues/388

## 2.9.0

### Fixed

- Randomising vhost connections on startup rather than on each connection request

## 2.8.0

### Fixed

- Workaround for non deterministic amqplib connection handling, see https://github.com/squaremo/amqp.node/issues/388

## 2.7.0

### Added

- AckOrNack emits/returns an error if an attempt was made to ack/nack a message using a closed channel
- Adjusting default connection_timeout and channel_max url parameters

## 2.6.0

### Added

- Exponential backoff for re-connections and channel re-subscriptions
- Fixed typo in deprecation warning

## 2.5.0

### Fixed

- Subscriber session could attempt to ack/nack messages using a closed channel. Leaving the channel open for 1 minute after cancelling subscription.

## 2.4.0

### Added

- Socket options can be specified in the vhost connection configuration. Connection timeout defaults to 1 minute.

## 2.3.2

### Updated

- Use self instead of this for code which called broker.nuke without binding context

## 2.3.1

### Updated

- Updated dependences

## 2.3.0

### Added

- Broker.unsubscribeAll to remove subscriptons. Mostly useful for automated tests

## 2.2.0

### Added

- Decorate inbound messages with originalVhost header

## 2.1.0

### Added

- Default publications and subscriptions are marked with an autoCreated flag

### Changed

- Default publications and subscriptions are are qualified with the vhost

### Deprecated

- Unqualified publications and subscriptions have been deprecated. A console.warn is logged once per subscription and publication but can be disabled by setting RASCAL_DISABLE_ALL_DEPRECATION_WARNINGS=true or RASCAL_DISABLE_UNQUALIFIED_NAME_DEPRECATION_WARNING=true

## 2.0.0

### Fixed

- Connection pool was leaking connections following a connection error. With a pool size of 1, this locked up all publishers
- Listening to close and error events caused multiple channels to be created which appears to result in an unknown delivery tag error. See https://github.com/squaremo/amqp.node/issues/271
- Incorrect documenation said to listen for invalid_content, but in reality the event was invalid_message. Now emitting invalid_message only if invalid_content is not handled.
- Fixed examples

## 1.4.1

### Fixed

- confirmPoolSize option as per https://github.com/guidesmiths/rascal/pull/19

## 1.4.0

### Added

- Listing to connection close events as per #18
- Fixed bug with configuration which caused vhost config errors to be masked

## 1.3.1

### Added

- Channel pooling (makes publishing much faster)

### Updated

- Dependencies

## 1.2.1

### Updated

- Used wrong argument in callback

## 1.2.0

### Added

- Workaround for https://github.com/guidesmiths/rascal/issues/17

## 1.1.0

### Added

- This changelog
- License
- Badges
- Upgrading dependencies

The format is based on [Keep a Changelog](http://keepachangelog.com/)
