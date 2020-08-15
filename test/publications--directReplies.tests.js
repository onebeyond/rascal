var assert = require('assert');
var _ = require('lodash');
var amqplib = require('amqplib/callback_api');
var testConfig = require('../lib/config/tests');
var uuid = require('uuid').v4;
var BrokerAsPromised = require('..').BrokerAsPromised;

describe('Publications -- directReplies', function() {
  this.timeout(2000);
  this.slow(1000);

  var broker;
  var namespace;
  var vhosts;

  beforeEach(function(done) {
    namespace = uuid();

    vhosts = getVhosts(namespace);

    amqplib.connect(done);
  });

  afterEach(() => {
    if (broker) return broker.nuke();
  });

  it('should enable replying to a message whose publication has directReplies enabled', async () => {
    broker = await createBroker();

    const subscription = await broker.subscribe('s1');

    subscription.on('message', async (message, content, ackOrNack) => {
      await ackOrNack();
      return broker.reply('/', message, { outcome: 'success' });
    });

    const publication = await broker.publish('publicationWithDirectReplies', 'ahoy hoy');

    await new Promise((resolve) => {
      publication.replies.on('message', (msg, content) => {
        assert.equal(content.outcome, 'success');
        return resolve();
      });
    });
  });

  it('should handle multiple replies', async () => {
    broker = await createBroker();

    const subscription = await broker.subscribe('s1');

    subscription.on('message', async (message, content, ackOrNack) => {
      const publishReply = () => broker.reply('/', message, { outcome: 'success' });
      await publishReply();
      await publishReply();
      await publishReply();
    });

    const publicationWithDirectReplies = await broker.publish('publicationWithDirectReplies', 'ahoy hoy');

    await new Promise((resolve) => {
      let replies = 0;
      publicationWithDirectReplies.replies.on('message', () => {
        replies++;
        if (replies === 3) resolve();
      });
    });
  });

  it('should support cancelling/removing a reply handler', async () => {
    broker = await createBroker();

    const subscription = await broker.subscribe('s1');

    const [message, publication] = await Promise.all([
      new Promise((resolve) => subscription.on('message', resolve)),
      broker.publish('publicationWithDirectReplies', 'ahoy hoy'),
    ]);

    let counter = 0;
    publication.replies.on('message', () => { counter++; });
    publication.replies.cancel();

    await broker.reply('/', message, { outcome: 'success' });

    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(counter, 0);
  });

  it('should send replies to the right place', async () => {
    broker = await createBroker();

    const subscription = await broker.subscribe('s1');
    subscription.on('message', async (message, content) => {
      await new Promise(resolve => setTimeout(resolve, content.delay));
      return broker.reply('/', message, content.letter);
    });

    const originalMessages = [
      { letter: 'a', delay: 50 },
      { letter: 'b', delay: 0 },
      { letter: 'c', delay: 100 },
    ];

    const publications = await Promise.all(originalMessages.map(m => broker.publish('publicationWithDirectReplies', m)));
    const responses = await Promise.all(publications.map(p => new Promise(resolve => p.replies.on('message', (_, content) => resolve(content)))));
    assert.deepEqual(responses, ['a', 'b', 'c']);
  });

  it('should not place a replies property on publications without directReplies enabled', async () => {
    broker = await createBroker();

    const publication = await broker.publish('publicationWithoutDirectReplies', 'ahoy hoy');
    assert.equal(publication.replies, undefined);
  });

  it('should not include a replyTo property on messages published to publications without directReplies enabled', async () => {
    broker = await createBroker();

    const subscription = await broker.subscribe('s1');

    await broker.publish('publicationWithoutDirectReplies', 'ahoy hoy');

    const replyTo = await new Promise((resolve) =>
      subscription.on('message', (message) => resolve(message.properties.replyTo)));

    assert.equal(replyTo, undefined);
  });

  function createBroker() {
    const config = _.defaultsDeep(getStandardConfig(vhosts), testConfig);
    return BrokerAsPromised.create(config).then(function(_broker) {
      broker = _broker;
      return broker;
    });
  }
});

function getVhosts(namespace) {
  return {
    '/': {
      namespace: namespace,
      exchanges: {
        e1: {
          assert: true,
        },
      },
      queues: {
        q1: {
          assert: true,
        },
      },
      bindings: {
        b1: {
          source: 'e1',
          destination: 'q1',
        },
      },
    },
  };
}

function getStandardConfig(vhosts) {
  return {
    vhosts: vhosts,
    publications: {
      publicationWithDirectReplies: {
        queue: 'q1',
        directReplies: true,
      },
      publicationWithoutDirectReplies: {
        queue: 'q1',
      },
    },
    subscriptions: {
      s1: {
        queue: 'q1',
      },
    },
  };
}
