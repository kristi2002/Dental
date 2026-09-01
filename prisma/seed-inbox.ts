/**
 * Correspondence for the demo practice — posted the way a real one arrives.
 *
 *     npx tsx prisma/seed-inbox.ts                     # against localhost:3000
 *     npx tsx prisma/seed-inbox.ts --url=http://localhost:3001
 *     npx tsx prisma/seed-inbox.ts --twice             # also proves the dedupe
 *
 * **Why the webhook and not the database.** `prisma/seed.ts` writes rows because
 * everything it seeds is something the practice typed. An email is the one thing
 * in this app that came from outside, and rows written straight into
 * `EmailThread` would be a demo inbox that never went through the parser — so
 * the screen would look right while `parseBrevoInbound`, `matchThread`,
 * `threadSubject`, the spam rule, the automated rule and the `providerMessageId`
 * dedupe all stayed untested. Every message below is a Brevo payload handed to
 * `/api/mail/inbound` exactly as Brevo would hand it over, which makes this
 * script a seeder and an integration test at the same time.
 *
 * Requires `MAIL_INBOUND_SECRET` in `.env` — at least 16 characters, any value
 * locally. Without it the route answers 404 to everything, on purpose: see the
 * note on `authorised` in the route.
 *
 * Safe to run twice. The second run stores nothing new, which is the point of
 * `--twice`.
 */
try {
  process.loadEnvFile();
} catch {
  // Rely on the ambient environment when there is no `.env`.
}

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const BASE = (arg('url') ?? process.env.SEED_INBOX_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TWICE = process.argv.includes('--twice');
const SECRET = process.env.MAIL_INBOUND_SECRET ?? '';

/** The mailbox `MAIL_REPLY_TO` names, which is what every one of these is sent to. */
const PRACTICE = process.env.MAIL_REPLY_TO ?? 'info@klinika.al';

type Case = {
  /** What this one is for, printed beside the result. */
  what: string;
  /** What should come back, so a wrong answer is visible without opening the app. */
  expect: string;
  /**
   * Whether a redelivery of this one should be refused.
   *
   * True for everything with a `Message-ID`, which is what `providerMessageId`
   * is unique on. False for the message that arrived without one — it has
   * nothing to be recognised by, so a provider sending it twice writes it
   * twice, and that is the honest outcome rather than a hole in the dedupe.
   */
  dedupes: boolean;
  item: Record<string, unknown>;
};

/**
 * One well-formed Brevo item, which each case then varies.
 *
 * The shape is `parseBrevoInbound`'s and nothing else — `Uuid`, `MessageId`,
 * `From`, `To`, `Subject`, `RawTextBody`, `RawHtmlBody`,
 * `ExtractedMarkdownMessage`, `SpamScore`, `Attachments`, `Headers`.
 */
function item(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    Uuid: ['seed'],
    To: [{ Address: PRACTICE, Name: 'Klinika' }],
    RawHtmlBody: '',
    ExtractedMarkdownMessage: '',
    SpamScore: 0.4,
    Attachments: [],
    Headers: {},
    ...overrides,
  };
}

/**
 * The stories, oldest first — so the list reads top-down the way a real morning
 * would, `lastMessageAt` being stamped at write time.
 */
const CASES: Case[] = [
  {
    what: 'a known patient answers a reminder',
    expect: 'a thread linked to Dritan Basha, one unread',
    dedupes: true,
    item: item({
      MessageId: '<seed-reply-1@mail.example.al>',
      InReplyTo: '<seed-sent-1@smtp-relay.brevo.com>',
      From: { Address: 'Dritan.Basha@Example.al', Name: 'Dritan Basha' },
      Subject: 'Re: Kujtesë për takimin',
      RawTextBody: 'A mund ta zhvendosim të enjten?\n\n> Të hënën na shkruat:',
      ExtractedMarkdownMessage: 'A mund ta zhvendosim të enjten pasdite? Faleminderit.',
      Headers: { 'Message-Id': '<seed-reply-1@mail.example.al>' },
    }),
  },
  {
    what: 'the same person writes again from a second mailbox',
    expect: 'joins the thread above by References, not by address',
    dedupes: true,
    item: item({
      MessageId: '<seed-reply-2@mail.example.al>',
      From: { Address: 'd.basha@work.example.al', Name: 'Dritan Basha' },
      Subject: 'R: Re: Kujtesë për takimin',
      ExtractedMarkdownMessage: 'Po shkruaj nga puna — e enjtja në 16:00 do të ishte perfekte.',
      Headers: {
        'Message-Id': '<seed-reply-2@mail.example.al>',
        References: '<seed-sent-1@smtp-relay.brevo.com> <seed-reply-1@mail.example.al>',
      },
    }),
  },
  {
    what: 'a patient whose client sent no text part',
    expect: 'a preview built by stripTags, linked to Suela Cami',
    dedupes: true,
    item: item({
      MessageId: '<seed-html-only@mail.example.al>',
      From: { Address: 'suela.cami@example.al', Name: 'Suela Cami' },
      Subject: 'Pyetje për mbushjen',
      RawTextBody: '',
      RawHtmlBody:
        '<html><head><style>p{color:red}</style></head><body>' +
        '<p>Mbushja e së martës po m&#39;i jep pak siklet kur ha ftohtë.</p>' +
        '<p>A duhet t&#39;ju vij përsëri?</p></body></html>',
      Headers: { 'Message-Id': '<seed-html-only@mail.example.al>' },
    }),
  },
  {
    what: 'a supplier nobody has a record of',
    expect: 'a thread with no patient — the ordinary unlinked case',
    dedupes: true,
    item: item({
      MessageId: '<seed-supplier@dentalmed.al>',
      From: { Address: 'porosi@dentalmed.al', Name: 'DentalMed Shpk' },
      Subject: 'Fatura 2026-1184 dhe dërgesa e së premtes',
      ExtractedMarkdownMessage:
        'Përshëndetje, dërgesa niset të premten. Fatura bashkëngjitur në sistemin tonë.',
      Headers: { 'Message-Id': '<seed-supplier@dentalmed.al>' },
    }),
  },
  {
    what: 'an out-of-office',
    expect: 'stored but already read — no badge, and the thread still exists',
    dedupes: true,
    item: item({
      MessageId: '<seed-ooo@mail.example.al>',
      From: { Address: 'vjollca.m@example.al', Name: 'Vjollca Mehmeti' },
      Subject: 'Automatic reply: Kujtesë për takimin',
      ExtractedMarkdownMessage: 'Jam me pushime deri më 15 shtator.',
      Headers: {
        'Message-Id': '<seed-ooo@mail.example.al>',
        'Auto-Submitted': 'auto-replied',
      },
    }),
  },
  {
    what: 'a message the classifier condemned',
    expect: `SpamScore 9.2 ≥ the limit, so the thread starts filed — look under "Të arkivuara"`,
    dedupes: true,
    item: item({
      MessageId: '<seed-spam@lottery.example>',
      From: { Address: 'winner@lottery.example', Name: 'CLAIM NOW' },
      Subject: 'YOU HAVE WON!!!',
      ExtractedMarkdownMessage: 'Click here to claim your prize.',
      SpamScore: 9.2,
      Headers: { 'Message-Id': '<seed-spam@lottery.example>' },
    }),
  },
  {
    what: 'a stranger whose client set no Message-ID and no subject',
    expect: '(no subject), providerMessageId null — the sparse-but-legal case',
    dedupes: false,
    item: item({
      From: { Address: 'info@example.com', Name: '' },
      Subject: '   ',
      RawTextBody: 'Sa kushton një pastrim dhëmbësh?',
      SpamScore: null,
    }),
  },
];

async function post(one: Case): Promise<{ ok: boolean; body: string }> {
  const url = `${BASE}/api/mail/inbound?key=${encodeURIComponent(SECRET)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [one.item] }),
  });

  const body = await response.text();
  return { ok: response.ok, body: `${response.status} ${body}` };
}

async function main() {
  if (SECRET.length < 16) {
    console.error('MAIL_INBOUND_SECRET is missing or under 16 characters, so the route');
    console.error('answers 404 to every delivery. Put a line like this in .env and restart');
    console.error('the dev server:\n');
    console.error('  MAIL_INBOUND_SECRET="local-inbox-secret-please-change"\n');
    process.exit(1);
  }

  console.log(`Posting ${CASES.length} messages to ${BASE}/api/mail/inbound\n`);

  let stored = 0;
  for (const one of CASES) {
    const result = await post(one);
    console.log(`  ${result.ok ? '✓' : '✗'} ${one.what}`);
    console.log(`      → ${result.body}`);
    console.log(`      expect: ${one.expect}`);
    if (result.body.includes('"stored":1')) stored += 1;
  }

  console.log(`\n${stored}/${CASES.length} stored.`);

  if (TWICE) {
    // The whole idempotency story in one line: same payloads, nothing new. A
    // provider that redelivers — and every provider eventually does — must not
    // double the inbox.
    console.log('\nPosting the same set again — everything with a Message-ID should refuse:');
    let leaked = 0;
    for (const one of CASES) {
      const result = await post(one);
      const landed = result.body.includes('"stored":1');
      if (landed && one.dedupes) {
        leaked += 1;
        console.log(`  ✗ stored a second copy: ${one.what}`);
      } else if (landed) {
        console.log(`  · stored again, as expected — ${one.what}`);
      }
    }
    console.log(
      leaked === 0
        ? '  ✓ the dedupe held.'
        : `  ✗ ${leaked} message(s) stored twice — the dedupe is not holding.`,
    );
  }

  console.log(`\nOpen ${BASE}/sq/inbox — and ${BASE}/sq/inbox?filed=1 for the spam.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
