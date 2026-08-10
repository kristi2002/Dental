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
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
};
