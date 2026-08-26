import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchesMessageId,
  normaliseMessageId,
  readMessageId,
  referencedMessageIds,
} from '../src/lib/messages/email';
import {
  matchThread,
  parseBrevoInbound,
  threadSubject,
  SPAM_SCORE_LIMIT,
  type InboundEmail,
} from '../src/lib/messages/inbound';

/**
 * The half of the mail system that reads input chosen by a stranger.
 *
 * Everything here is exercised against no provider, no network and no database,
 * which is the whole reason `inbound.ts` is pure: the alternative to a test is
 * finding out the parser mishandled something by having it mishandle a real
 * patient's message.
 */

/** One well-formed item, which each test then breaks in exactly one way. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        Uuid: ['abc'],
        MessageId: '<reply-1@mail.example.al>',
        InReplyTo: '<sent-1@smtp-relay.brevo.com>',
        From: { Address: 'Dritan.Basha@Example.al', Name: 'Dritan Basha' },
        To: [{ Address: 'reply@klinika.al', Name: 'Klinika' }],
        Subject: 'Re: Kujtesë për takimin',
        RawTextBody: 'A mund ta zhvendosim të enjten?\n\n> On Monday you wrote:',
        RawHtmlBody: '<p>A mund ta zhvendosim të enjten?</p>',
        ExtractedMarkdownMessage: 'A mund ta zhvendosim të enjten?',
        SpamScore: 0.4,
        Attachments: [],
        Headers: { 'Message-Id': '<reply-1@mail.example.al>' },
        ...overrides,
      },
    ],
  };
}

describe('parseBrevoInbound — the shape that arrives', () => {
  it('reads one ordinary reply', () => {
    const [email] = parseBrevoInbound(payload());

    assert.equal(email.messageId, 'reply-1@mail.example.al');
    assert.equal(email.subject, 'Re: Kujtesë për takimin');
    assert.equal(email.fromName, 'Dritan Basha');
    assert.equal(email.spamScore, 0.4);
    assert.equal(email.automated, false);
  });

  it('lower-cases both addresses, because a mailbox is not case-sensitive', () => {
    // The whole threading story hangs off this: `Dritan.Basha@` and
    // `dritan.basha@` are one person, and matching raw would open two threads.
    const [email] = parseBrevoInbound(payload());
    assert.equal(email.fromAddress, 'dritan.basha@example.al');
    assert.equal(email.toAddress, 'reply@klinika.al');
  });

  it("prefers the provider's extraction over the raw part", () => {
    // The raw body carries the quoted history; the extraction does not, and a
    // list showing "> On Monday you wrote:" as the preview is a useless list.
    const [email] = parseBrevoInbound(payload());
    assert.equal(email.text, 'A mund ta zhvendosim të enjten?');
    assert.ok(!email.text.includes('>'));
  });

  it('falls back to the raw text, then to the markup, for a message with no extraction', () => {
    const [noExtract] = parseBrevoInbound(
      payload({ ExtractedMarkdownMessage: '', RawTextBody: 'plain only' }),
    );
    assert.equal(noExtract.text, 'plain only');

    const [htmlOnly] = parseBrevoInbound(
      payload({
        ExtractedMarkdownMessage: '',
        RawTextBody: '',
        RawHtmlBody: '<p>Faleminderit!</p><script>alert(1)</script>',
      }),
    );
    assert.equal(htmlOnly.text, 'Faleminderit!');
    assert.ok(!htmlOnly.text.includes('alert'));
  });

  it('drops a message with no sender, and keeps the rest of the batch', () => {
    // Nothing to reply to and nothing to file it against. The batch matters:
    // one unusable item must never discard the others.
    const both = {
      items: [
        { ...payload().items[0], From: { Address: '', Name: '' } },
        payload().items[0],
      ],
    };
    assert.equal(parseBrevoInbound(both).length, 1);
  });

  it('refuses a sender that is not an address at all', () => {
    assert.equal(parseBrevoInbound(payload({ From: { Address: 'not an address' } })).length, 0);
  });

  it('survives every shape it should never receive', () => {
    for (const hostile of [null, undefined, 42, 'items', {}, { items: {} }, { items: [null, 7] }]) {
      assert.deepEqual(parseBrevoInbound(hostile), []);
    }
  });

  it('gives a subjectless message a subject rather than an empty heading', () => {
    const [email] = parseBrevoInbound(payload({ Subject: '   ' }));
    assert.equal(email.subject, '(no subject)');
  });
});

describe('parseBrevoInbound — attachments', () => {
  const attach = (extra: Record<string, unknown>) =>
    parseBrevoInbound(
      payload({
        Attachments: [
          {
            Name: 'xray.jpg',
            ContentType: 'image/jpeg',
            ContentLength: 2048,
            DownloadToken: 'tok-1',
            ...extra,
          },
        ],
      }),
    )[0].attachments;

  it('keeps the types a practice actually receives', () => {
    assert.equal(attach({}).length, 1);
    assert.equal(attach({ ContentType: 'application/pdf', Name: 'referral.pdf' }).length, 1);
  });

  it('drops anything outside the upload allowlist', () => {
    // The same list the upload form enforces. A patient emailing an executable
    // is not a patient this app is going to help.
    for (const mimeType of ['application/x-msdownload', 'text/html', 'application/zip', '']) {
      assert.equal(attach({ ContentType: mimeType }).length, 0, mimeType);
    }
  });

  it('tolerates a charset on the content type', () => {
    assert.equal(attach({ ContentType: 'image/jpeg; charset=binary' }).length, 1);
  });

  it('drops one with no download token, which is one that cannot be fetched', () => {
    assert.equal(attach({ DownloadToken: '' }).length, 0);
  });

  it('drops one whose claimed size is absurd or missing', () => {
    assert.equal(attach({ ContentLength: 0 }).length, 0);
    assert.equal(attach({ ContentLength: 500 * 1024 * 1024 }).length, 0);
  });

  it('takes the path separators out of the filename', () => {
    // It never reaches the filesystem — `storeFile` generates the name on disk —
    // but it does reach a screen, and a name that reads as a location is a name
    // somebody eventually trusts.
    const [file] = attach({ Name: '../../etc/passwd' });
    assert.ok(!file.fileName.includes('/'));
    assert.ok(!file.fileName.includes('\\'));
  });

  it('caps how many one message may bring', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      Name: `x${index}.jpg`,
      ContentType: 'image/jpeg',
      ContentLength: 1024,
      DownloadToken: `tok-${index}`,
    }));
    assert.equal(parseBrevoInbound(payload({ Attachments: many }))[0].attachments.length, 10);
  });
});

describe('parseBrevoInbound — machines writing to the practice', () => {
  it('recognises the four ways a mailer says nobody is reading this', () => {
    const cases = [
      { Headers: { 'Auto-Submitted': 'auto-replied' } },
      { Headers: { Precedence: 'bulk' } },
      { Headers: { 'X-Autoreply': 'yes' } },
      { From: { Address: 'mailer-daemon@example.al', Name: '' } },
    ];
    for (const shape of cases) {
      assert.equal(parseBrevoInbound(payload(shape))[0].automated, true, JSON.stringify(shape));
    }
  });

  it('does not mistake a person for a machine', () => {
    assert.equal(parseBrevoInbound(payload({ Headers: { 'Auto-Submitted': 'no' } }))[0].automated, false);
    assert.equal(parseBrevoInbound(payload())[0].automated, false);
  });

  it('reads a header whatever case it was written in', () => {
    assert.equal(parseBrevoInbound(payload({ Headers: { PRECEDENCE: 'bulk' } }))[0].automated, true);
  });
});

describe('threadSubject — the prefixes three languages stack', () => {
  it('strips one, and then the next', () => {
    assert.equal(threadSubject('Re: Kujtesë'), 'Kujtesë');
    assert.equal(threadSubject('Re: R: Fwd: Kujtesë'), 'Kujtesë');
    assert.equal(threadSubject('RE: AW: Reminder'), 'Reminder');
    assert.equal(threadSubject('Re[2]: Reminder'), 'Reminder');
  });

  it('leaves a subject that merely starts with those letters alone', () => {
    // "Referral for Mrs Hoxha" begins with `Re` and is not a reply. Without the
    // colon in the pattern this would become "ferral for Mrs Hoxha".
    assert.equal(threadSubject('Referral for Mrs Hoxha'), 'Referral for Mrs Hoxha');
    assert.equal(threadSubject('Result of the scan'), 'Result of the scan');
  });

  it('keeps something rather than nothing when the subject was only a prefix', () => {
    assert.equal(threadSubject('Re:'), 'Re:');
  });
});

describe('message ids — the two providers do not answer the same question', () => {
  it('reads the header Brevo returns', () => {
    assert.equal(
      readMessageId('brevo', JSON.stringify({ messageId: '<202608@smtp-relay.brevo.com>' })),
      '<202608@smtp-relay.brevo.com>',
    );
  });

  it("reads the id Resend returns, which is not a header", () => {
    assert.equal(readMessageId('resend', JSON.stringify({ id: 'b1f2-uuid' })), 'b1f2-uuid');
  });

  it('never turns an unreadable success into a failure', () => {
    // A send that worked and whose body will not parse has still gone out. The
    // thread is lost; the message is not.
    for (const body of ['', 'OK', '<html>', '{"messageId":null}', '{"messageId":"  "}']) {
      assert.equal(readMessageId('brevo', body), null, body);
    }
  });

  it('normalises away the differences that are not differences', () => {
    assert.equal(normaliseMessageId('  <A@B.com> '), 'a@b.com');
    assert.equal(normaliseMessageId('a@b.com'), 'a@b.com');
  });

  it('matches a Brevo id exactly and a Resend id by containment', () => {
    assert.ok(matchesMessageId('<sent-1@brevo.com>', 'sent-1@brevo.com'));
    assert.ok(matchesMessageId('4f9a1c2b8e7d6501', '<4f9a1c2b8e7d6501@send.klinika.al>'));
  });

  it('refuses to thread on an id short enough to collide by accident', () => {
    assert.ok(!matchesMessageId('abc', '<abcdef@example.al>'));
    assert.ok(!matchesMessageId('', 'anything'));
  });
});

describe('referencedMessageIds — the parent first, then back up the chain', () => {
  it('puts In-Reply-To ahead of the References ancestry', () => {
    assert.deepEqual(
      referencedMessageIds('<parent@a>', '<oldest@a> <middle@a> <parent@a>'),
      ['parent@a', 'middle@a', 'oldest@a'],
    );
  });

  it('reverses References so the nearest ancestor is tried first', () => {
    assert.deepEqual(referencedMessageIds(null, '<one@a> <two@a> <three@a>'), [
      'three@a',
      'two@a',
      'one@a',
    ]);
  });

  it('copes with headers that have no angle brackets', () => {
    assert.deepEqual(referencedMessageIds('parent@a', null), ['parent@a']);
  });

  it('is empty when there is nothing to go on', () => {
    assert.deepEqual(referencedMessageIds(null, null), []);
    assert.deepEqual(referencedMessageIds('', '   '), []);
  });
});

describe('matchThread — header first, address second, stranger third', () => {
  const email = (overrides: Partial<InboundEmail> = {}): InboundEmail => ({
    messageId: 'm@a',
    fromAddress: 'dritan@example.al',
    fromName: 'Dritan',
    toAddress: 'reply@klinika.al',
    subject: 'Re: Kujtesë',
    text: 'po',
    html: null,
    references: ['sent-1@brevo.com'],
    spamScore: 0,
    automated: false,
    attachments: [],
    ...overrides,
  });

  it('threads on the header when there is one, without asking about the address', () => {
    let askedAboutAddress = false;
    const match = matchThread(email(), {
      threadByReference: async () => 'thread-7',
      patientByEmail: async () => {
        askedAboutAddress = true;
        return 'patient-1';
      },
    });

    return match.then((result) => {
      assert.deepEqual(result, { kind: 'reply', threadId: 'thread-7' });
      assert.equal(askedAboutAddress, false);
    });
  });

  it('falls back to the address when the header leads nowhere', async () => {
    // One person writing from two mailboxes is why the header wins; two people
    // sharing one `info@` is why the address is only the fallback.
    const result = await matchThread(email(), {
      threadByReference: async () => null,
      patientByEmail: async () => 'patient-1',
    });
    assert.deepEqual(result, { kind: 'known', patientId: 'patient-1' });
  });

  it('skips the header lookup entirely when the sender set no headers', async () => {
    let asked = false;
    await matchThread(email({ references: [] }), {
      threadByReference: async () => {
        asked = true;
        return null;
      },
      patientByEmail: async () => null,
    });
    assert.equal(asked, false);
  });

  it('leaves a stranger unmatched rather than guessing', async () => {
    // A new patient making first contact. The thread is opened and flagged for
    // somebody to attach by hand — not attached to whoever seems closest.
    const result = await matchThread(email({ references: [] }), {
      threadByReference: async () => null,
      patientByEmail: async () => null,
    });
    assert.deepEqual(result, { kind: 'unknown' });
  });
});

describe('the spam threshold', () => {
  it('sits where a provider means "confident" and not where it means "maybe"', () => {
    // Filed, never dropped: the classifier is somebody else's and it is wrong
    // occasionally, so the practice has to be able to go and look.
    assert.ok(SPAM_SCORE_LIMIT > 5 && SPAM_SCORE_LIMIT <= 10);
  });
});
