/** Plain, serializable shapes handed from server pages to (client) components. */

export type AppointmentView = {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  durationMin: number;
  status: string;
  serviceName: string;
  notes: string;
  /** The patient answered the confirmation link themselves. */
  confirmed: boolean;
  /** They answered, and said no — the slot is free again. */
  declined: boolean;
  /** Who is treating. Empty when the practice does not track it. */
  staffUserId: string;
  staffName: string;
  /** Which chair. Empty when the practice has only one. */
  operatoryId: string;
  operatoryName: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    /** Their own language, so a reminder is not written in the reader's. */
    locale: string;
    /** `null` means nobody has asked whether they may be messaged. */
    contactConsent: boolean | null;
  };
};
