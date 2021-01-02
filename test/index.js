const { EOL } = require('os');
const { Harness, Suite, SpecReporter, syntax } = require('zunit');

Object.entries(syntax).forEach(([keyword, fn]) => {
  global[keyword] = fn;
});

const suite = new Suite('Rascal').discover({ pattern: /\w+\.tests\.js/ });
const harness = new Harness(suite);

const interactive = String(process.env.CI).toLowerCase() !== 'true';
const reporter = new SpecReporter({ colours: interactive });

harness.run(reporter).then((report) => {
  if (report.failed) process.exit(1);
  if (report.incomplete) {
    console.log(`One or more tests were not run!${EOL}`);
    process.exit(2);
  }
});
