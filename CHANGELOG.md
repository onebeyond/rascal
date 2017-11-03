# Change Log

## [2.5.0]
### Fixed
- Subscriber session could attempt to ack/nack messages using a closed channel. Leaving the channel open for 1 minute after cancelling subscription.

## [2.4.0]
### Added
- Socket options can be specified in the vhost connection configuration. Connection timeout defaults to 1 minute.

## [2.3.2]
### Updated
- Use self instead of this for code which called broker.nuke without binding context

## [2.3.1]
### Updated
- Updated dependences

## [2.3.0]
### Added
- Broker.unsubscribeAll to remove subscriptons. Mostly useful for automated tests

## [2.2.0]
### Added
- Decorate inbound messages with originalVhost header

## [2.1.0]
### Added
- Default publications and subscriptions are marked with an autoCreated flag

### Changed
- Default publications and subscriptions are are qualified with the vhost

### Deprecated
- Unqualified publications and subscriptions have been deprecated. A console.warn is logged once per subscription and publication but can be disabled by setting RASCAL_DISABLE_ALL_DEPRECATION_WARNINGS=true or RASCAL_DISABLE_UNQUALIFIED_NAME_DEPRECATION_WARNING=true

## [2.0.0]
### Fixed
- Connection pool was leaking connections following a connection error. With a pool size of 1, this locked up all publishers
- Listening to close and error events caused multiple channels to be created which appears to result in an unknown delivery tag error. See https://github.com/squaremo/amqp.node/issues/271
- Incorrect documenation said to listen for invalid_content, but in reality the event was invalid_message. Now emitting invalid_message only if invalid_content is not handled.
- Fixed examples

## [1.4.1]
### Fixed
- confirmPoolSize option as per https://github.com/guidesmiths/rascal/pull/19

## [1.4.0]
### Added
- Listing to connection close events as per #18
- Fixed bug with configuration which caused vhost config errors to be masked

## [1.3.1]
### Added
- Channel pooling (makes publishing much faster)

### Updated
- Dependencies

## [1.2.1]
### Updated
- Used wrong argument in callback

## [1.2.0]
### Added
- Workaround for https://github.com/guidesmiths/rascal/issues/17

## [1.1.0]
### Added
- This changelog
- License
- Badges
- Upgrading dependencies

The format is based on [Keep a Changelog](http://keepachangelog.com/)
