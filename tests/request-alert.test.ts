import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alertRecipient,
  requestAlertMail,
  type RequestAlert,
  type RequestAlertLabels,
} from '../src/lib/messages/request-alert';

const LABELS: RequestAlertLabels = {
  subject: 'Kërkesë e re nga faqja — Arta Krasniqi',
  intro: 'Dikush ka kërkuar një takim. Po pret përgjigje.',
  phone: 'Telefoni',
  email: 'Email',
  topic: 'Për',
  preferred: 'Do të parapëlqente',
  attachments: 'Skedarë të bashkangjitur',
  openIt: 'Hape',
};

const FULL: RequestAlert = {
  name: 'Arta Krasniqi',
  phone: '069 12 34 567',
  email: 'arta@example.al',
  topicLabel: 'Implante',
  preferredLabel: 'e premte, 4 shtator, paradite',
  attachments: 2,
};

const BARE: RequestAlert = {
  name: 'Arta Krasniqi',
  phone: '069 12 34 567',
  email: null,
  topicLabel: null,
  preferredLabel: null,
  attachments: 0,
};

describe('requestAlertMail — what the desk is actually told', () => {
  it('carries every fact the visitor gave', () => {
    const mail = requestAlertMail('info@klinika.al', 'Klinika', FULL, LABELS, 'https://x.al/sq/requests');

    assert.equal(mail.to, 'info@klinika.al');
    assert.equal(mail.toName, 'Klinika');
    assert.equal(mail.subject, LABELS.subject);
    assert.match(mail.text, /Arta Krasniqi/);
    assert.match(mail.text, /Telefoni: 069 12 34 567/);
    assert.match(mail.text, /Email: arta@example\.al/);
    assert.match(mail.text, /Për: Implante/);
    assert.match(mail.text, /Do të parapëlqente: e premte, 4 shtator, paradite/);
    assert.match(mail.text, /Skedarë të bashkangjitur: 2/);
    assert.match(mail.text, /Hape: https:\/\/x\.al\/sq\/requests/);
  });

  it('leaves out the rows nobody filled in, rather than printing them empty', () => {
    const mail = requestAlertMail('info@klinika.al', 'Klinika', BARE, LABELS, null);

    assert.match(mail.text, /Telefoni: 069 12 34 567/);
    for (const absent of ['Email:', 'Për:', 'Do të parapëlqente:', 'Skedarë']) {
      assert.ok(!mail.text.includes(absent), `should not mention ${absent}`);
    }
  });

  it('omits the link when the deployment has no address to build one from', () => {
    const mail = requestAlertMail('info@klinika.al', 'Klinika', FULL, LABELS, null);
    assert.ok(!mail.text.includes('Hape'));
  });

  /**
   * The medical half stays behind the sign-in. A body that quoted what somebody
   * wrote about their own mouth would put it in whatever mailbox this lands in,
   * which is the one thing this notification is not for.
   */
  it('never carries the message the visitor wrote', () => {
    const mail = requestAlertMail('info@klinika.al', 'Klinika', FULL, LABELS, null);
    assert.ok(!Object.keys(FULL).includes('message'));
    assert.ok(!mail.text.includes('undefined'));
  });
});

describe('alertRecipient — which mailbox hears about it', () => {
  it('prefers the address the practice put on its own settings screen', () => {
    assert.equal(alertRecipient('info@klinika.al', 'reply@example.com'), 'info@klinika.al');
  });

  it('falls back to the reply-to a configured deployment already has', () => {
    assert.equal(alertRecipient(null, 'reply@example.com'), 'reply@example.com');
    assert.equal(alertRecipient('   ', 'reply@example.com'), 'reply@example.com');
  });

  it('answers null when there is nowhere to send it, which is not an error', () => {
    assert.equal(alertRecipient(null, undefined), null);
    assert.equal(alertRecipient('', '  '), null);
  });
});
