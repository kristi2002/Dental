import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_NOTES_LENGTH,
  MAX_TITLE_LENGTH,
  SNOOZE_DAYS,
  bellCounts,
  clampNotes,
  clampTitle,
  daysOverdue,
  followUpLink,
  followUpStatus,
  linkHref,
  snoozeUntil,
  sortFollowUps,
  type FollowUpLike,
  type LinkedRecords,
} from '../src/lib/follow-ups';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The day every date-sensitive test below is asked "as of". */
const TODAY = day('2026-08-15');

type Row = FollowUpLike & { id: string };

function item(over: Partial<Row> = {}): Row {
  return {
    id: 'a',
    dueAt: TODAY,
    doneAt: null,
    priority: 'NORMAL',
    createdAt: day('2026-08-01'),
    ...over,
  };
}

const NO_LINKS: LinkedRecords = { patient: null, work: null, stockItem: null };

describe('followUpStatus — where a line stands today', () => {
  it('reads the three open states off the due date', () => {
    assert.equal(followUpStatus(item({ dueAt: day('2026-08-14') }), TODAY), 'overdue');
    assert.equal(followUpStatus(item({ dueAt: day('2026-08-15') }), TODAY), 'today');
    assert.equal(followUpStatus(item({ dueAt: day('2026-08-16') }), TODAY), 'upcoming');
  });

  it('calls a ticked line done however far past its date it is', () => {
    const done = item({ dueAt: day('2026-01-01'), doneAt: day('2026-08-10') });
    assert.equal(followUpStatus(done, TODAY), 'done');
    assert.equal(daysOverdue(done, TODAY), 0, 'a finished line is not late');
  });

  it('counts the days a line has been sitting there', () => {
    assert.equal(daysOverdue(item({ dueAt: day('2026-08-05') }), TODAY), 10);
    assert.equal(daysOverdue(item({ dueAt: TODAY }), TODAY), 0, 'today is not late');
    assert.equal(daysOverdue(item({ dueAt: day('2026-09-01') }), TODAY), 0);
  });
});

describe('sortFollowUps — the board’s reading order', () => {
  it('reads late, then today, then coming up', () => {
    const rows = sortFollowUps(
      [
        item({ id: 'upcoming', dueAt: day('2026-08-20') }),
        item({ id: 'today', dueAt: TODAY }),
        item({ id: 'late', dueAt: day('2026-08-10') }),
      ],
      TODAY,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ['late', 'today', 'upcoming'],
    );
  });

  it('does not let an urgent flag outrank something that is actually late', () => {
    const rows = sortFollowUps(
      [
        item({ id: 'urgent-next-week', dueAt: day('2026-08-21'), priority: 'URGENT' }),
        item({ id: 'late-and-ordinary', dueAt: day('2026-08-11') }),
      ],
      TODAY,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ['late-and-ordinary', 'urgent-next-week'],
      'overdue is a fact; urgent is an opinion somebody typed',
    );
  });

  it('uses urgency to break a tie inside one bucket', () => {
    const rows = sortFollowUps(
      [
        item({ id: 'normal', dueAt: TODAY }),
        item({ id: 'urgent', dueAt: TODAY, priority: 'URGENT' }),
      ],
      TODAY,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ['urgent', 'normal'],
    );
  });

  it('falls back on which was written first, so the order never wobbles', () => {
    const rows = sortFollowUps(
      [
        item({ id: 'second', dueAt: TODAY, createdAt: day('2026-08-09') }),
        item({ id: 'first', dueAt: TODAY, createdAt: day('2026-08-02') }),
      ],
      TODAY,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ['first', 'second'],
    );
  });

  it('sends ticked lines to the end and leaves the input alone', () => {
    const input = [
      item({ id: 'done', dueAt: day('2026-08-01'), doneAt: day('2026-08-02') }),
      item({ id: 'open', dueAt: day('2026-08-20') }),
    ];
    const rows = sortFollowUps(input, TODAY);

    assert.deepEqual(
      rows.map((row) => row.id),
      ['open', 'done'],
    );
    assert.equal(input[0].id, 'done', 'sorting must not reorder the caller’s array');
  });
});

describe('bellCounts — what the badge says', () => {
  it('counts only what is still open', () => {
    const counts = bellCounts(
      [
        item({ dueAt: day('2026-08-10') }),
        item({ dueAt: TODAY, priority: 'URGENT' }),
        item({ dueAt: day('2026-08-30') }),
        item({ dueAt: day('2026-08-01'), doneAt: day('2026-08-02'), priority: 'URGENT' }),
      ],
      TODAY,
    );

    assert.deepEqual(counts, { open: 3, overdue: 1, urgent: 1 });
  });

  it('says nothing at all about an empty board', () => {
    assert.deepEqual(bellCounts([], TODAY), { open: 0, overdue: 0, urgent: 0 });
  });
});

describe('the way in — what a line is about, and where pressing it goes', () => {
  it('names the patient when there is one', () => {
    const link = followUpLink({
      ...NO_LINKS,
      patient: { id: 'p1', firstName: 'Arta', lastName: 'Krasniqi' },
    });
    assert.deepEqual(link, { kind: 'patient', id: 'p1', label: 'Krasniqi Arta' });
    assert.equal(linkHref(link!), '/patients/p1');
  });

  it('opens the register at the case, across every month', () => {
    const link = followUpLink({ ...NO_LINKS, work: { number: 42, patientName: 'Blerim' } });
    assert.deepEqual(link, { kind: 'work', number: 42, label: '#42 Blerim' });
    assert.equal(
      linkHref(link!),
      '/works?q=42&month=all',
      'the register opens on this month, and a late case is usually an older one',
    );
  });

  it('opens the shelf at the material, escaping whatever it is called', () => {
    const link = followUpLink({ ...NO_LINKS, stockItem: { name: 'Composite A2 & A3' } });
    assert.equal(linkHref(link!), '/stock?q=Composite%20A2%20%26%20A3');
  });

  it('is happy to be about nothing in particular', () => {
    assert.equal(followUpLink(NO_LINKS), null, '"order more gloves" is a real follow-up');
  });
});

describe('snoozeUntil — what "later" means', () => {
  it('measures from today, not from the date the line already carries', () => {
    assert.equal(
      snoozeUntil(1, TODAY).toISOString(),
      '2026-08-16T00:00:00.000Z',
      'a week-overdue line snoozed a day is being asked about tomorrow',
    );
    assert.equal(snoozeUntil(7, TODAY).toISOString(), '2026-08-22T00:00:00.000Z');
  });

  it('never lands in the past, whatever it is handed', () => {
    for (const days of [0, -5, 0.4]) {
      assert.ok(snoozeUntil(days, TODAY).getTime() > TODAY.getTime(), `days=${days}`);
    }
  });

  it('offers a few choices rather than a date picker', () => {
    assert.deepEqual([...SNOOZE_DAYS], [1, 3, 7]);
  });
});

describe('clamping — what may actually be stored', () => {
  it('trims a title and cuts it to something a row can print', () => {
    assert.equal(clampTitle('  ring the lab  '), 'ring the lab');
    assert.equal(clampTitle('x'.repeat(500)).length, MAX_TITLE_LENGTH);
  });

  it('turns an empty note into no note, so the column stays NULL', () => {
    assert.equal(clampNotes('   '), null);
    assert.equal(clampNotes(null), null);
    assert.equal(clampNotes(' shade A2 '), 'shade A2');
    assert.equal(clampNotes('x'.repeat(5000))!.length, MAX_NOTES_LENGTH);
  });
});
