type Status = 'active' | 'paused' | 'ended' | 'cancelled';

const cls: Record<Status, string> = {
  active:    'badge-active',
  paused:    'badge-paused',
  ended:     'badge-ended',
  cancelled: 'badge-cancelled',
};

export function Badge({ status }: { status: Status }) {
  return (
    <span className={cls[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
