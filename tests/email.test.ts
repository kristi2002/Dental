import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyStatus,
  isEmailAddress,
  mailRequest,
  parseFrom,
  readMailerConfig,
  type MailerConfig,
} from '../src/lib/messages/email';

const CONFIG: MailerConfig = {
  provider: 'brevo',
  apiKey: 'key-123',
  fromAddress: 'no-reply@klinika.al',
  fromName: 'Klinika Dentare',
  replyTo: 'info@klinika.al',
  testTo: 'info@klinika.al',
};

describe('isEmailAddress — conservative on purpose', () => {
  it('accepts the addresses a clinic actually has', () => {
    for (const address of [
      'arta@example.al',
      'no-reply@klinika.al',
      'first.last@sub.domain.co.uk',
      'a+tag@example.com',
      "o'brien@example.ie",
    ]) {
      assert.ok(isEmailAddress(address), `should accept ${address}`);
    }
  });

  /**
   * The one that would have bitten immediately. A character class written as
   * `[\s<>",; -]` puts a literal hyphen at the end, and `no-reply@` is the
   * commonest sending address there is.
   */
  it('accepts a hyphen in the local part', () => {
    assert.ok(isEmailAddress('no-reply@klinika.al'));
    assert.ok(isEmailAddress('front-desk@klinika-dentare.al'));
  });

  it('refuses what is not an address', () => {
    for (const value of [
      '',
      '   ',
      'arta',
      '@example.al',
      'arta@',
      'arta@example',
      'arta@.al',
      'arta@example.',
      'arta@exa..mple.al',
      'arta example@x.al',
      'arta<@x.al',
      'a,b@x.al',
      'a;b@x.al',
    ]) {
      assert.equal(isEmailAddress(value), false, `should refuse ${JSON.stringify(value)}`);
    }
  });

  it('refuses control characters', () => {
    assert.equal(isEmailAddress(`arta${String.fromCharCode(0)}@x.al`), false);
    assert.equal(isEmailAddress(`arta${String.fromCharCode(10)}@x.al`), false);
    assert.equal(isEmailAddress(`arta${String.fromCharCode(127)}@x.al`), false);
  });

  it('refuses an address longer than a mailbox can be', () => {
    assert.equal(isEmailAddress(`${'a'.repeat(65)}@example.al`), false, 'local part');
    assert.equal(isEmailAddress(`a@${'b'.repeat(260)}.al`), false, 'whole address');
  });
});

describe('parseFrom — what MAIL_FROM is allowed to look like', () => {
  it('takes a bare address', () => {
    assert.deepEqual(parseFrom('no-reply@klinika.al'), {
      name: '',
      address: 'no-reply@klinika.al',
    });
  });

  it('takes a display name and an address', () => {
    assert.deepEqual(parseFrom('Klinika Dentare <no-reply@klinika.al>'), {
      name: 'Klinika Dentare',
      address: 'no-reply@klinika.al',
    });
  });

  it('strips the quotes a mail header would want and JSON does not', () => {
    assert.deepEqual(parseFrom('"Klinika Dentare" <no-reply@klinika.al>'), {
      name: 'Klinika Dentare',
      address: 'no-reply@klinika.al',
    });
  });

  it('refuses one that is not an address at all', () => {
    assert.equal(parseFrom(''), null);
    assert.equal(parseFrom('Klinika Dentare'), null);
    assert.equal(parseFrom('Klinika <not an address>'), null);
  });
});

describe('readMailerConfig — configured, unconfigured, or wrong', () => {
  it('reads a complete configuration', () => {
    const result = readMailerConfig({
      MAIL_PROVIDER: 'brevo',
      MAIL_API_KEY: 'key-123',
      MAIL_FROM: 'Klinika Dentare <no-reply@klinika.al>',
      MAIL_REPLY_TO: 'info@klinika.al',
    });
    assert.deepEqual(result, { ok: true, config: CONFIG });
  });

  it('accepts resend, and is not case-fussy about the name', () => {
    const result = readMailerConfig({
      MAIL_PROVIDER: 'Resend',
      MAIL_API_KEY: 're_x',
      MAIL_FROM: 'no-reply@klinika.al',
    });
    assert.equal(result.ok && result.config.provider, 'resend');
  });

  /**
   * An empty environment is the ordinary state of a practice that has not got
   * to this yet, and must not read as a misconfiguration — the queue still
   * works, it just opens drafts. Telling those two apart is the whole reason
   * `MailerProblem` exists.
   */
  it('calls an empty environment unset, not broken', () => {
    assert.deepEqual(readMailerConfig({}), { ok: false, problem: 'unset' });
  });

  it('names the specific thing that is wrong', () => {
    assert.deepEqual(readMailerConfig({ MAIL_API_KEY: 'k', MAIL_FROM: 'a@b.al' }), {
      ok: false,
      problem: 'unknown-provider',
    });
    assert.deepEqual(readMailerConfig({ MAIL_PROVIDER: 'brevo', MAIL_FROM: 'a@b.al' }), {
      ok: false,
      problem: 'no-key',
    });
    assert.deepEqual(readMailerConfig({ MAIL_PROVIDER: 'brevo', MAIL_API_KEY: 'k' }), {
      ok: false,
      problem: 'bad-from',
    });
    assert.deepEqual(
      readMailerConfig({ MAIL_PROVIDER: 'brevo', MAIL_API_KEY: 'k', MAIL_FROM: 'nonsense' }),
      { ok: false, problem: 'bad-from' },
    );
    assert.deepEqual(
      readMailerConfig({
        MAIL_PROVIDER: 'brevo',
        MAIL_API_KEY: 'k',
        MAIL_FROM: 'a@b.al',
        MAIL_REPLY_TO: 'not an address',
      }),
      { ok: false, problem: 'bad-reply-to' },
    );
  });

  /**
   * Reply-to is the one setting that is fine to leave out, so an absent one must
   * not be reported as a mistake — only a present-and-wrong one.
   */
  it('is happy without a reply-to, and says so as null rather than an empty string', () => {
    const result = readMailerConfig({
      MAIL_PROVIDER: 'brevo',
      MAIL_API_KEY: 'k',
      MAIL_FROM: 'a@b.al',
    });
    assert.equal(result.ok && result.config.replyTo, null);
  });

  it('treats whitespace as absence', () => {
    assert.deepEqual(
      readMailerConfig({
        MAIL_PROVIDER: '  ',
        MAIL_API_KEY: ' ',
        MAIL_FROM: '',
        MAIL_TEST_TO: '   ',
      }),
      { ok: false, problem: 'unset' },
    );
  });

  /**
   * A test address on its own is still a configuration somebody started, and
   * calling it `unset` would report "not set up" on a settings card that has a
   * value sitting in it — the one thing `MailerProblem` exists to avoid.
   */
  it('does not call an environment unset just because only the test address is in it', () => {
    assert.deepEqual(readMailerConfig({ MAIL_TEST_TO: 'owner@klinika.al' }), {
      ok: false,
      problem: 'unknown-provider',
    });
  });

  it('refuses a test address that is set and wrong', () => {
    assert.deepEqual(
      readMailerConfig({
        MAIL_PROVIDER: 'brevo',
        MAIL_API_KEY: 'k',
        MAIL_FROM: 'a@b.al',
        MAIL_TEST_TO: 'not an address',
      }),
      { ok: false, problem: 'bad-test-to' },
    );
  });

  /**
   * The whole point of the setting: the test goes somewhere the person wiring
   * up DNS is watching, and patient replies keep going to the front desk. If
   * these two ever collapsed into one value the setting would be decorative.
   */
  it('sends the test where MAIL_TEST_TO says, leaving reply-to alone', () => {
    const result = readMailerConfig({
      MAIL_PROVIDER: 'brevo',
      MAIL_API_KEY: 'k',
      MAIL_FROM: 'Klinika Dentare <no-reply@klinika.al>',
      MAIL_REPLY_TO: 'info@klinika.al',
      MAIL_TEST_TO: 'owner@example.com',
    });
    assert.equal(result.ok && result.config.testTo, 'owner@example.com');
    assert.equal(result.ok && result.config.replyTo, 'info@klinika.al');
  });

  /**
   * The fallback, which is what this did before the setting existed. A
   * deployment that never names one must keep behaving exactly as it always
   * has — reply-to first, and the sending address when there is not one.
   */
  it('falls back to reply-to, then to the sending address', () => {
    const withReply = readMailerConfig({
      MAIL_PROVIDER: 'brevo',
      MAIL_API_KEY: 'k',
      MAIL_FROM: 'no-reply@klinika.al',
      MAIL_REPLY_TO: 'info@klinika.al',
    });
    assert.equal(withReply.ok && withReply.config.testTo, 'info@klinika.al');

    const withNeither = readMailerConfig({
      MAIL_PROVIDER: 'brevo',
      MAIL_API_KEY: 'k',
      MAIL_FROM: 'Klinika Dentare <no-reply@klinika.al>',
    });
    // The bare address, not the `Name <address>` form the settings card prints.
    assert.equal(withNeither.ok && withNeither.config.testTo, 'no-reply@klinika.al');
  });
});

const MAIL = {
  to: 'arta@example.al',
  toName: 'Krasniqi Arta',
  subject: 'Kujtesë',
  text: 'Përshëndetje Arta',
};

describe('mailRequest — the exact payload each provider receives', () => {
  it('builds the Brevo request', () => {
    const request = mailRequest(CONFIG, MAIL);
    assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(request.headers['api-key'], 'key-123');
    assert.deepEqual(JSON.parse(request.body), {
      sender: { name: 'Klinika Dentare', email: 'no-reply@klinika.al' },
      to: [{ email: 'arta@example.al', name: 'Krasniqi Arta' }],
      subject: 'Kujtesë',
      textContent: 'Përshëndetje Arta',
      replyTo: { email: 'info@klinika.al' },
    });
  });

  it('builds the Resend request', () => {
    const request = mailRequest({ ...CONFIG, provider: 'resend', apiKey: 're_x' }, MAIL);
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.headers.authorization, 'Bearer re_x');
    assert.deepEqual(JSON.parse(request.body), {
      from: 'Klinika Dentare <no-reply@klinika.al>',
      to: ['arta@example.al'],
      subject: 'Kujtesë',
      text: 'Përshëndetje Arta',
      reply_to: 'info@klinika.al',
    });
  });

  /**
   * Both providers reject a null reply-to, and leaving `MAIL_REPLY_TO` unset is
   * the common case rather than a rare one. The key has to be absent from the
   * payload, not present and empty.
   */
  it('omits reply-to entirely when the practice has not set one', () => {
    const brevo = JSON.parse(mailRequest({ ...CONFIG, replyTo: null }, MAIL).body);
    assert.equal('replyTo' in brevo, false);

    const resend = JSON.parse(
      mailRequest({ ...CONFIG, provider: 'resend', replyTo: null }, MAIL).body,
    );
    assert.equal('reply_to' in resend, false);
  });

  it('omits the display name when there is none, rather than sending an empty one', () => {
    const brevo = JSON.parse(mailRequest({ ...CONFIG, fromName: '' }, MAIL).body);
    assert.deepEqual(brevo.sender, { email: 'no-reply@klinika.al' });

    const resend = JSON.parse(
      mailRequest({ ...CONFIG, provider: 'resend', fromName: '' }, MAIL).body,
    );
    assert.equal(resend.from, 'no-reply@klinika.al');
  });

  it('sends plain text and never a body a name could be interpolated into', () => {
    const request = mailRequest(CONFIG, { ...MAIL, toName: '<script>x</script>' });
    const body = JSON.parse(request.body);
    assert.equal('htmlContent' in body, false);
    // The name goes into a JSON string field, so the angle brackets are data.
    assert.equal(body.to[0].name, '<script>x</script>');
  });
});

describe('classifyStatus — four failures, four different people fixing them', () => {
  it('separates a bad key from a refused message', () => {
    assert.equal(classifyStatus(401), 'auth');
    assert.equal(classifyStatus(403), 'auth');
    assert.equal(classifyStatus(400), 'rejected');
    assert.equal(classifyStatus(422), 'rejected');
  });

  it('knows the free tier running out', () => {
    assert.equal(classifyStatus(429), 'limit');
  });

  it("treats the provider having a bad day as nobody's to fix", () => {
    assert.equal(classifyStatus(500), 'unreachable');
    assert.equal(classifyStatus(502), 'unreachable');
    assert.equal(classifyStatus(0), 'unreachable');
  });
});
