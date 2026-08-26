/**
 * What a drug *is*, so an allergy recorded under one name can be recognised
 * under another.
 *
 * The allergy cross-check used to compare two strings. That catches "Penicilinë"
 * against "Penicilin 500 mg" and misses "Amoxicillin 875 mg" completely — which
 * is the one that matters, because amoxicillin is the antibiotic a dentist
 * actually reaches for and a penicillin allergy is the one half the patients
 * have recorded. A check that quietly passes the common case is worse than no
 * check at all, because it is trusted.
 *
 * So: a small catalogue of what gets prescribed in a dental practice, each name
 * tied to its family, in the spellings and brand names actually written here —
 * English, Albanian, Italian, and the boxes on the shelf.
 *
 * ## What this is not
 *
 * Not a formulary, not a drug database, and not clinical decision support. It
 * knows nothing about doses, interactions, renal function, or pregnancy. It
 * answers exactly one question — *is this the same kind of drug as that?* — and
 * its only output is a sentence asking a dentist to look twice.
 *
 * Nothing here is stored. The wording a dentist types stays free text, as it
 * must: a structured drug field would be one more box to fill at the fastest
 * moment of the appointment, and a box that gets skipped protects nobody. This
 * reads what was already written.
 */

import { fold } from '@/lib/utils';

export type DrugFamily =
  | 'PENICILLIN'
  | 'CEPHALOSPORIN'
  | 'MACROLIDE'
  | 'LINCOSAMIDE'
  | 'NITROIMIDAZOLE'
  | 'TETRACYCLINE'
  | 'QUINOLONE'
  | 'SULFONAMIDE'
  | 'AMINOGLYCOSIDE'
  | 'NSAID'
  | 'PARACETAMOL'
  | 'PYRAZOLONE'
  | 'OPIOID'
  | 'ANAESTHETIC_AMIDE'
  | 'ANAESTHETIC_ESTER'
  | 'CORTICOSTEROID'
  | 'CHLORHEXIDINE'
  | 'IODINE'
  | 'LATEX';

/**
 * Terms are **stems**, folded and matched against the start of a word, because
 * the same drug is written five ways: `penicil` covers penicillin, penicilinë,
 * and penicillina without three entries. A term containing a space or a hyphen
 * is matched as a phrase anywhere in the text instead.
 *
 * Class names sit alongside member drugs deliberately — an allergy is recorded
 * as "Penicilinë" far more often than as a specific salt, and that record has to
 * resolve to the family for any of this to work.
 */
const CATALOGUE: ReadonlyArray<{ family: DrugFamily; terms: readonly string[] }> = [
  {
    family: 'PENICILLIN',
    terms: [
      'penicil',
      'betalaktam',
      'betalactam',
      'beta-lactam',
      'beta lactam',
      'beta-lattam',
      'amoxicil',
      'amoksicil',
      'ampicil',
      'amoxiclav',
      'amoksiklav',
      'augmentin',
      'clavulan',
      'klavulan',
      'zimox',
      'piperacil',
      'oxacil',
      'oksacil',
      'cloxacil',
      'flucloxacil',
      'benzatin',
      'fenoksimetil',
      'fenossimetil',
    ],
  },
  {
    family: 'CEPHALOSPORIN',
    terms: [
      'cefalospor',
      'cephalospor',
      'kefalospor',
      'betalaktam',
      'betalactam',
      'beta-lactam',
      'beta lactam',
      'beta-lattam',
      'cefalexin',
      'cephalexin',
      'cefaleksin',
      'cefuroxim',
      'cefuroksim',
      'ceftriaxon',
      'ceftriakson',
      'rocefin',
      'cefixim',
      'cefiksim',
      'cefaclor',
      'cefazolin',
      'cefpodoxim',
      'ceftazidim',
      'cefadroxil',
    ],
  },
  {
    family: 'MACROLIDE',
    terms: [
      'macrolid',
      'makrolid',
      'eritromicin',
      'erythromycin',
      'azitromicin',
      'azithromycin',
      'zitromax',
      'claritromicin',
      'clarithromycin',
      'klaritromicin',
      'klacid',
      'spiramicin',
      'spiramycin',
      'roxitromicin',
      'roxithromycin',
    ],
  },
  {
    family: 'LINCOSAMIDE',
    terms: [
      'lincosamid',
      'linkozamid',
      'clindamicin',
      'clindamycin',
      'klindamicin',
      'dalacin',
      'lincomicin',
      'lincomycin',
      'linkomicin',
    ],
  },
  {
    family: 'NITROIMIDAZOLE',
    terms: ['nitroimidazol', 'metronidazol', 'flagyl', 'tinidazol', 'ornidazol', 'secnidazol'],
  },
  {
    family: 'TETRACYCLINE',
    terms: [
      'tetraciklin',
      'tetracyclin',
      'tetraciclin',
      'doxiciclin',
      'doxycyclin',
      'doksiciklin',
      'minociclin',
      'minocyclin',
      'minociklin',
      'limeciclin',
      'vibramicin',
      'bassado',
    ],
  },
  {
    family: 'QUINOLONE',
    terms: [
      'quinolon',
      'kinolon',
      'chinolon',
      'fluoroquinolon',
      'fluorochinolon',
      'ciprofloxacin',
      'ciprofloksacin',
      'levofloxacin',
      'levofloksacin',
      'moxifloxacin',
      'moksifloksacin',
      'norfloxacin',
      'ofloxacin',
    ],
  },
  {
    family: 'SULFONAMIDE',
    terms: [
      'sulfonamid',
      'sulfamid',
      'sulfamet',
      'sulfadiaz',
      'cotrimoxazol',
      'kotrimoksazol',
      'bactrim',
      'trimetoprim',
      'trimethoprim',
    ],
  },
  {
    family: 'AMINOGLYCOSIDE',
    terms: [
      'aminoglikozid',
      'aminoglycosid',
      'aminoglicosid',
      'gentamicin',
      'streptomicin',
      'streptomycin',
      'amikacin',
      'tobramicin',
      'neomicin',
      'neomycin',
    ],
  },
  {
    // Hypersensitivity to one NSAID is usually hypersensitivity to the class —
    // it is the shared COX-1 blockade doing it, not the individual molecule. So
    // the whole family firing on any member is correct here, not over-eager.
    family: 'NSAID',
    terms: [
      'nsaid',
      'fans',
      'antinfiammator',
      'antiinflamator',
      'ibuprofen',
      'brufen',
      'nurofen',
      'ketoprofen',
      'dexketoprofen',
      'deksketoprofen',
      'enantyum',
      'ketorolac',
      'ketorolak',
      'toradol',
      'naproxen',
      'naprossen',
      'diclofenac',
      'diklofenak',
      'voltaren',
      'dicloreum',
      'nimesulid',
      'aulin',
      'nimesil',
      'aspirin',
      'acetilsalicil',
      'acetylsalicyl',
      'asetilsalicil',
      'indometacin',
      'indomethacin',
      'piroxicam',
      'piroksikam',
      'meloxicam',
      'meloksikam',
      'celecoxib',
      'celekoksib',
      'etoricoxib',
      'etorikoksib',
      'flurbiprofen',
    ],
  },
  {
    // Its own family, with no edge to the NSAIDs: paracetamol is precisely what
    // an NSAID-sensitive patient gets instead, and warning about it would teach
    // the dentist to click through the warnings that matter.
    family: 'PARACETAMOL',
    terms: [
      'paracetamol',
      'acetaminofen',
      'acetaminophen',
      'tachipirina',
      'takipirina',
      'panadol',
      'efferalgan',
      'perfalgan',
    ],
  },
  {
    family: 'PYRAZOLONE',
    terms: ['pirazolon', 'pyrazolon', 'metamizol', 'dipiron', 'dipyron', 'novalgin', 'optalgin'],
  },
  {
    family: 'OPIOID',
    terms: [
      'opioid',
      'opiaceo',
      'opiat',
      'codein',
      'kodein',
      'tramadol',
      'contramal',
      'morfin',
      'morphin',
      'oxycodon',
      'ossicodon',
      'oksikodon',
      'fentanil',
      'fentanyl',
    ],
  },
  {
    // The two anaesthetic families are kept apart on purpose. Ester
    // hypersensitivity is real and cross-reacts within the esters; the amides
    // are the answer to it. Bridging them would put a warning on the injection
    // that happens at every single appointment, for no reason.
    family: 'ANAESTHETIC_AMIDE',
    terms: [
      'anestetik amid',
      'anestetici amidici',
      'amide anaesthetic',
      'amide anesthetic',
      'lidocain',
      'lidokain',
      'lignocain',
      'xilocain',
      'xylocain',
      'articain',
      'artikain',
      'ubistesin',
      'septanest',
      'mepivacain',
      'mepivakain',
      'scandonest',
      'carbocain',
      'karbokain',
      'bupivacain',
      'bupivakain',
      'prilocain',
      'prilokain',
      'citanest',
      'ropivacain',
    ],
  },
  {
    family: 'ANAESTHETIC_ESTER',
    terms: [
      'anestetik ester',
      'anestetici estere',
      'ester anaesthetic',
      'ester anesthetic',
      'procain',
      'prokain',
      'novocain',
      'novokain',
      'benzocain',
      'benzokain',
      'tetracain',
      'tetrakain',
      'cloroprocain',
      'chloroprocain',
      'ametocain',
    ],
  },
  {
    family: 'CORTICOSTEROID',
    terms: [
      'corticosteroid',
      'kortikosteroid',
      'corticoid',
      'cortison',
      'kortizon',
      'steroid',
      'prednisolon',
      'prednison',
      'dexametason',
      'dexamethason',
      'deksametazon',
      'betametason',
      'betamethason',
      'metilprednisolon',
      'methylprednisolon',
      'idrocortison',
      'hydrocortison',
      'hidrokortizon',
      'triamcinolon',
      'bentelan',
      'deltacortene',
    ],
  },
  {
    family: 'CHLORHEXIDINE',
    terms: [
      'clorexidin',
      'chlorhexidin',
      'klorheksidin',
      'corsodyl',
      'curasept',
      'plakout',
      'eludril',
    ],
  },
  {
    family: 'IODINE',
    terms: ['iodin', 'iodio', 'jodin', 'povidon', 'betadin', 'iodopovidon'],
  },
  {
    family: 'LATEX',
    terms: ['latex', 'lateks', 'lattice'],
  },
];

/**
 * Families that are not the same thing but react as if they were.
 *
 * Exactly one edge, and it stays that way until another is as well established.
 * Penicillin/cephalosporin cross-reactivity is the one every dental text warns
 * about — the textbook 10% is now understood to be nearer 1–2%, and it is still
 * the reason nobody hands a cephalosporin to a patient with a recorded
 * penicillin allergy without thinking about it first.
 *
 * The temptation is to fill this in generously. Resisted: every invented edge is
 * an alarm on the drug that was the safe alternative, and a dentist who learns
 * the alarms are noise stops reading the one that is not.
 */
const CROSS_REACTIVE: ReadonlyArray<readonly [DrugFamily, DrugFamily]> = [
  ['PENICILLIN', 'CEPHALOSPORIN'],
];

/** A name found in a piece of text, quoted as it was written. */
export type DrugHit = {
  /** The word or phrase as it appeared, so a warning can echo it back. */
  text: string;
  families: DrugFamily[];
};

/** Shorter than this and a stem matches half the dictionary. */
const MIN_TERM_LENGTH = 4;

type Index = {
  stems: ReadonlyArray<readonly [string, DrugFamily[]]>;
  phrases: ReadonlyArray<readonly [string, DrugFamily[]]>;
};

let cached: Index | null = null;

function index(): Index {
  if (cached) return cached;

  const stems = new Map<string, DrugFamily[]>();
  const phrases = new Map<string, DrugFamily[]>();

  for (const { family, terms } of CATALOGUE) {
    for (const term of terms) {
      const key = fold(term);
      if (key.length < MIN_TERM_LENGTH) continue;

      // A term with a space or a hyphen cannot be found by looking at one word.
      const into = /[\s-]/.test(key) ? phrases : stems;
      const existing = into.get(key);
      if (existing) {
        if (!existing.includes(family)) existing.push(family);
      } else {
        into.set(key, [family]);
      }
    }
  }

  cached = { stems: [...stems], phrases: [...phrases] };
  return cached;
}

/** Split on anything that is not a letter, a digit, or an internal hyphen. */
function wordsOf(text: string): string[] {
  return text.split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
}

/**
 * Every drug or drug class named in a piece of text.
 *
 * Runs over the prescription wording and over the allergy record alike — the
 * same question is being asked of both, and an allergy is as likely to be
 * written as a sentence ("Alergji ndaj penicilinës") as a single word.
 */
export function drugsIn(text: string): DrugHit[] {
  const folded = fold(text);
  if (!folded) return [];

  const { stems, phrases } = index();
  const found = new Map<string, Set<DrugFamily>>();

  const add = (label: string, families: readonly DrugFamily[]) => {
    const bucket = found.get(label) ?? new Set<DrugFamily>();
    for (const family of families) bucket.add(family);
    found.set(label, bucket);
  };

  for (const [phrase, families] of phrases) {
    if (folded.includes(phrase)) add(phrase, families);
  }

  for (const raw of wordsOf(text)) {
    const word = fold(raw);
    if (word.length < MIN_TERM_LENGTH) continue;

    for (const [stem, families] of stems) {
      // The start of the word, not anywhere inside it: "penicil" has to find
      // "penicilinës" without "cain" finding "cocaine".
      if (word.startsWith(stem)) add(raw, families);
    }
  }

  return [...found].map(([label, families]) => ({ text: label, families: [...families] }));
}

/** Every family named in a piece of text, flattened. */
export function familiesIn(text: string): Set<DrugFamily> {
  const families = new Set<DrugFamily>();
  for (const hit of drugsIn(text)) {
    for (const family of hit.families) families.add(family);
  }
  return families;
}

/** The families a reaction to this one should make somebody think about. */
export function crossReactingWith(family: DrugFamily): DrugFamily[] {
  const related: DrugFamily[] = [];
  for (const [left, right] of CROSS_REACTIVE) {
    if (left === family) related.push(right);
    if (right === family) related.push(left);
  }
  return related;
}
