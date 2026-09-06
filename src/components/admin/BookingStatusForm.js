'use client';

import { useActionState } from 'react';
import { updateBooking } from '@/lib/actions/admin';
import { BOOKING_STATUSES } from '@/lib/constants';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Notice, STATUS_LABEL, SubmitButton } from '@/components/admin/ui';

export default function BookingStatusForm({ booking }) {
  const [state, action, pending] = useActionState(updateBooking, null);
  return (
    <form action={action} className="space-y-4">
      {state?.ok ? <Notice>Réservation mise à jour.</Notice> : null}
      <input type="hidden" name="id" value={booking.id} />
      <Field label="Statut" htmlFor="status">
        <Select id="status" name="status" defaultValue={booking.status}>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes internes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={booking.notes || ''} />
      </Field>
      <SubmitButton disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</SubmitButton>
    </form>
  );
}
