const run = require('./output/email-writing-app/src/workflow');
(async () => {
  try {
    const sample = {
      subject: 'Quick update for [NAME]',
      body: 'Hi [NAME],\nWe have a new offer for {{company}} at {{website}}.',
      data: [ { Name: 'Alice Johnson', Emails: 'alice@example.com', Website: 'https://aliceco.com' }, { name: 'Bob', emails: 'bob@example.com', website: 'bob.biz' } ]
    };
    const out = await run(sample);
    console.log('RESULT', JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('TEST ERROR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
