import type { InterviewStatus } from '../api/types';
import { statusMeta } from '../lib/status';
import type { IconName } from './ui/Icon';
import { Icon } from './ui/Icon';

// Status is carried by three redundant channels — colour, icon shape and the
// written label — so it survives colour blindness, a greyscale print and a
// screenshot pasted into a chat.
const ICONS: Record<InterviewStatus, IconName> = {
  recebida: 'chevronRight',
  transcrevendo: 'pulse',
  diarizando: 'pulse',
  pontuando: 'pulse',
  aguardando_aprovacao: 'gavel',
  aprovada: 'check',
  rejeitada: 'close',
  falhou: 'alert',
};

interface Props {
  status: InterviewStatus;
  /** `sm` for dense tables, `md` for headers. */
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const meta = statusMeta(status);
  return (
    <span
      className={`status status--${meta.category} status--${status} status--${size}`}
      title={meta.description}
    >
      <Icon name={ICONS[status] ?? 'chevronRight'} />
      <span>{meta.label}</span>
    </span>
  );
}
