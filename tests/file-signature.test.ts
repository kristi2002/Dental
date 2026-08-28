import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sniffMimeType } from '../src/lib/file-signature';
import { isAllowedMimeType } from '../src/lib/file-constants';

/**
 * The one check standing between the public booking form and the practice's
 * disk.
 *
 * Everywhere else in this application a file arrives from somebody who signed
 * in, and `file.type` — a string the browser guessed from the extension — is
 * good enough to store. The request form is the exception: anybody with a
 * browser can post to it, that string is entirely under the sender's control,
 * and it is the string the app later hands back to a member of staff as a
 * `Content-Type` header.
 *
 * So these are not tests about file formats. They are tests about the two ways
 * this function can be wrong, and both are answered below: **it must not name a
 * type for bytes that are not that type** (the second block), and **it must
 * recognise the five things a patient actually sends** (the first), because the
 * cost of a false refusal is a real person's radiograph bounced off a form with
 * a message they cannot act on.
 */

/** A buffer beginning with `head`, padded out to something file-shaped. */
function head(...bytes: number[]): Uint8Array {
  const buffer = new Uint8Array(64);
  buffer.set(bytes, 0);
  return buffer;
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

describe('what a file actually is', () => {
  it('knows a JPEG, whatever flavour follows the marker', () => {
    // JFIF and Exif differ from byte four onwards, and a phone writes one and a
    // scanner the other. Only the first three are the format.
    assert.equal(sniffMimeType(head(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
    assert.equal(sniffMimeType(head(0xff, 0xd8, 0xff, 0xe1)), 'image/jpeg');
  });

  it('knows a PNG by its whole eight-byte signature', () => {
    assert.equal(
      sniffMimeType(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
      'image/png',
    );
  });

  it('knows a WebP, and does not take every RIFF file for one', () => {
    assert.equal(sniffMimeType(head(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'))), 'image/webp');

    // A WAV is a RIFF container too. Matching on `RIFF` alone would file a sound
    // recording as an image and then serve it to the desk as one.
    assert.equal(sniffMimeType(head(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'))), null);
  });

  it('knows an iPhone photograph, and not the video beside it', () => {
    // HEIC is an MP4 container wearing a different hat: the brand at byte eight
    // is the only thing separating the two.
    assert.equal(sniffMimeType(head(0, 0, 0, 0x18, ...ascii('ftypheic'))), 'image/heic');
    assert.equal(sniffMimeType(head(0, 0, 0, 0x18, ...ascii('ftypmif1'))), 'image/heic');
    assert.equal(sniffMimeType(head(0, 0, 0, 0x18, ...ascii('ftypisom'))), null);
    assert.equal(sniffMimeType(head(0, 0, 0, 0x18, ...ascii('ftypmp42'))), null);
  });

  it('knows a PDF, including one with a stray byte or two in front of it', () => {
    assert.equal(sniffMimeType(head(...ascii('%PDF-1.7'))), 'application/pdf');
    // Readers tolerate a small offset and producers occasionally leave one; a
    // referral letter should not be refused over two bytes of rubbish.
    assert.equal(sniffMimeType(head(0x0a, 0x0a, ...ascii('%PDF-1.4'))), 'application/pdf');
  });
});

describe('what a file is not', () => {
  it('refuses an HTML page called an X-ray', () => {
    // The whole reason this function exists. `file.type` on this upload would
    // say whatever the sender wanted it to say.
    assert.equal(sniffMimeType(head(...ascii('<!DOCTYPE html>'))), null);
  });

  it('refuses a script, an archive and a Windows executable', () => {
    assert.equal(sniffMimeType(head(...ascii('#!/bin/sh'))), null);
    assert.equal(sniffMimeType(head(0x50, 0x4b, 0x03, 0x04)), null);
    assert.equal(sniffMimeType(head(0x4d, 0x5a, 0x90, 0x00)), null);
  });

  it('refuses an empty file and a couple of stray bytes', () => {
    assert.equal(sniffMimeType(new Uint8Array(0)), null);
    assert.equal(sniffMimeType(new Uint8Array([0xff, 0xd8])), null);
  });

  it('never names a type the practice does not accept', () => {
    // The two lists are separate on purpose — one says what these bytes are, the
    // other what the practice will keep — so this is the assertion that they
    // cannot drift apart into a file that is stored because it was recognised.
    for (const bytes of [
      head(0xff, 0xd8, 0xff, 0xe0),
      head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      head(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')),
      head(0, 0, 0, 0x18, ...ascii('ftypheic')),
      head(...ascii('%PDF-1.7')),
    ]) {
      const type = sniffMimeType(bytes);
      assert.ok(type && isAllowedMimeType(type), `sniffed ${type}, which is not on the allowlist`);
    }
  });
});
