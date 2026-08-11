/**
 * Shared vocabulary between the booking form and the action behind it.
 */

/**
 * Patient-select value meaning "this person is not in the drawer yet". Booking
 * a first-time patient used to mean leaving the calendar, creating the record,
 * and coming back; the form now carries their details along instead, and the
 * action creates both in one transaction.
 */
export const NEW_PATIENT_VALUE = '__new__';
