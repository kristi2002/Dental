'use client';

import { FolderClock, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveLabCaseDetail } from '@/lib/actions/lab';
import { IDLE_STATE } from '@/lib/actions/types';
import { LAB_CARE_GUIDES, LAB_STATUSES } from '@/lib/lab';
import type { ToothNumbering } from '@/lib/teeth';
import { cn } from '@/lib/utils';
import { LabToothChart } from './LabToothChart';

export type LabOrderItem = {
  /** Empty for a line added in the browser and not yet saved. */
  id: string;
  name: string;
  serviceId: string;
  notes: string;
};

export type LabOrderValues = {
  id: string;
  labName: string;
  kind: string;
  teeth: string;
  status: string;
  /** All `YYYY-MM-DD`; empty string for unset. */
  sentAt: string;
  dueAt: string;
  receivedAt: string;
  tryInAt: string;
  /** `HH:mm`, or empty. */
  deliveryFrom: string;
  deliveryTo: string;
  careInstructions: string;
  notes: string;
  items: LabOrderItem[];
};

/**
 * One lab order, on one screen.
 *
 * Everything the case knows is a single form with a single save, including the
 * docket: lines are added and removed in the browser and written as a set. The
 * alternative — a server round trip per line — would mean a half-built order
 * living in the database while the person is still deciding what is on it.
 */
export function LabOrderSheet({
  values,
  services,
  suggestions,
  numbering,
  canEdit,
  history,
}: {
  values: LabOrderValues;
  services: Array<{ id: string; name: string }>;
  /** Services whose category matches what the case is, offered as one tap. */
  suggestions: Array<{ id: string; name: string }>;
  numbering: ToothNumbering;
  canEdit: boolean;
  /** The audit trail for this case, rendered on the server. */
  history: ReactNode;
}) {
  const t = useTranslations('lab');
  const tc = useTranslations('common');
  const uid = useId();

  const [state, formAction] = useActionState(saveLabCaseDetail, IDLE_STATE);
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [items, setItems] = useState<LabOrderItem[]>(values.items);
  const [status, setStatus] = useState(values.status);
  const [picked, setPicked] = useState('');
  const savedTs = useRef<number | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.status !== 'ok' || state.ts === savedTs.current) return;
    savedTs.current = state.ts;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  function addItem(serviceId: string, name: string) {
    if (!canEdit || !name) return;
    setItems((current) => [...current, { id: '', name, serviceId, notes: '' }]);
    setPicked('');
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  const readOnly = !canEdit;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={values.id} />

      {/* Every line as three fields the action can read back index-aligned.
          Hidden rather than rendered as inputs: the list is edited by adding and
          removing, and a name typed over would drift from the service it came
          from. */}
      {items.map((item, index) => (
        <div key={`${item.id}-${index}`} hidden>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="itemName" value={item.name} />
          <input type="hidden" name="itemServiceId" value={item.serviceId} />
          <input type="hidden" name="itemNotes" value={item.notes} />
        </div>
      ))}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-1 text-xl font-bold text-ink">{t('chartTitle')}</h2>
            <p className="mb-4 text-[1.02rem] text-ink-soft">{t('chartSubtitle')}</p>
            <LabToothChart
              name="teeth"
              defaultValue={values.teeth}
              numbering={numbering}
              readOnly={readOnly}
            />
          </section>

          <section className="card p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id={`${uid}-kind`}
                name="kind"
                label={t('kind')}
                hint={t('kindHint')}
                required
                readOnly={readOnly}
                defaultValue={values.kind}
              />
              <TextField
                id={`${uid}-lab`}
                name="labName"
                label={t('labName')}
                required
                readOnly={readOnly}
                defaultValue={values.labName}
              />
            </div>

            <TextAreaField
              className="mt-4"
              id={`${uid}-notes`}
              name="notes"
              label={t('comment')}
              hint={t('commentHint')}
              optional={tc('optional')}
              rows={4}
              readOnly={readOnly}
              defaultValue={values.notes}
            />
          </section>

          {canEdit ? (
            <section className="card p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`${uid}-service`}>
                    {t('addService')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      id={`${uid}-service`}
                      className="field-input"
                      value={picked}
                      onChange={(event) => setPicked(event.target.value)}
                    >
                      <option value="">{t('choose')}</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0"
                      disabled={picked === ''}
                      onClick={() => {
                        const service = services.find((entry) => entry.id === picked);
                        if (service) addItem(service.id, service.name);
                      }}
                    >
                      <Plus size={18} aria-hidden />
                      {t('add')}
                    </button>
                  </div>
                </div>

                {suggestions.length > 0 ? (
                  <div>
                    <p className="field-label">{t('recommended')}</p>
                    <ul className="flex flex-wrap gap-2">
                      {suggestions.map((service) => (
                        <li key={service.id}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => addItem(service.id, service.name)}
                          >
                            <Plus size={16} aria-hidden />
                            {service.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-5">
          <section className="card">
            <div className="flex border-b border-line px-2" role="tablist">
              <TabButton
                active={tab === 'current'}
                onClick={() => setTab('current')}
                icon={<FolderOpen size={18} aria-hidden />}
                label={t('tabCurrent')}
              />
              <TabButton
                active={tab === 'history'}
                onClick={() => setTab('history')}
                icon={<FolderClock size={18} aria-hidden />}
                label={t('tabHistory')}
              />
            </div>

            {tab === 'current' ? (
              <div className="p-4">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-ink-faint">{t('noItems')}</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((item, index) => (
                      <li
                        key={`${item.id}-${index}`}
                        className="flex items-start justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-ink">{item.name}</p>
                          {item.notes ? (
                            <p className="text-[0.92rem] text-ink-soft">{item.notes}</p>
                          ) : null}
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm shrink-0"
                            onClick={() => removeItem(index)}
                            title={tc('delete')}
                          >
                            <Trash2 size={16} aria-hidden />
                            <span className="sr-only">{tc('delete')}</span>
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="p-4">{history}</div>
            )}
          </section>

          <section className="card space-y-4 p-5">
            <SelectField
              id={`${uid}-status`}
              name="status"
              label={t('status')}
              disabled={readOnly}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {LAB_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {t(`status_${option}`)}
                </option>
              ))}
            </SelectField>

            <SelectField
              id={`${uid}-care`}
              name="careInstructions"
              label={t('careInstructions')}
              optional={tc('optional')}
              disabled={readOnly}
              defaultValue={values.careInstructions}
            >
              <option value="">{t('choose')}</option>
              {LAB_CARE_GUIDES.map((guide) => (
                <option key={guide} value={guide}>
                  {t(`care_${guide}`)}
                </option>
              ))}
            </SelectField>

            <TextField
              id={`${uid}-tryin`}
              name="tryInAt"
              type="date"
              label={t('tryInAt')}
              hint={t('tryInHint')}
              optional={tc('optional')}
              readOnly={readOnly}
              defaultValue={values.tryInAt}
            />

            <div>
              <p className="field-label">{t('delivery')}</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  name="dueAt"
                  aria-label={t('dueAt')}
                  className="field-input"
                  readOnly={readOnly}
                  defaultValue={values.dueAt}
                />
                <input
                  type="time"
                  name="deliveryFrom"
                  aria-label={t('deliveryFrom')}
                  className="field-input"
                  readOnly={readOnly}
                  defaultValue={values.deliveryFrom}
                />
                <input
                  type="time"
                  name="deliveryTo"
                  aria-label={t('deliveryTo')}
                  className="field-input"
                  readOnly={readOnly}
                  defaultValue={values.deliveryTo}
                />
              </div>
            </div>

            <TextField
              id={`${uid}-sent`}
              name="sentAt"
              type="date"
              label={t('sentAt')}
              readOnly={readOnly}
              defaultValue={values.sentAt}
            />

            {status === 'RECEIVED' || status === 'FITTED' ? (
              <TextField
                id={`${uid}-received`}
                name="receivedAt"
                type="date"
                label={t('receivedAt')}
                hint={t('receivedHint')}
                optional={tc('optional')}
                readOnly={readOnly}
                defaultValue={values.receivedAt}
              />
            ) : null}
          </section>
        </div>
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft px-4 py-3 font-semibold text-danger"
        >
          {state.message}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3 print:hidden">
          {saved ? (
            <p role="status" className="font-semibold text-ok">
              {tc('saved')}
            </p>
          ) : null}
          <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
        </div>
      ) : null}
    </form>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-3 py-3 text-[0.95rem] font-semibold transition-colors',
        'after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full',
        active
          ? 'text-brand-deep after:bg-brand'
          : 'text-ink-soft after:bg-transparent hover:text-ink',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
