import { useEffect, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { Skeleton } from '../atoms/skeleton.js';
import { Button } from '../atoms/button.js';
import { StaleMark } from '../molecules/stale-mark.js';
import { ListScreenLayout } from './list-screen-layout.js';

export interface ReadStateProps {
  readonly status: 'loading' | 'ready' | 'stale' | 'failed-empty' | 'empty';
  readonly title: string;
  readonly staleSince?: number;
  readonly retry: () => void;
  readonly children?: ReactNode;
  readonly variant?: 'block' | 'table-row';
}

/** Shared read-state chrome; the page still owns every request and mutation. */
export function ReadState({
  status,
  title,
  staleSince,
  retry,
  children,
  variant = 'block',
}: ReadStateProps): React.JSX.Element {
  const intl = useIntl();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'stale') return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [status]);
  if (status === 'loading' || status === 'failed-empty') {
    return (
      <ListScreenLayout
        title={title}
        listing={
          <Skeleton
            variant={variant}
            label={intl.formatMessage(messages.interactionLoading, { thing: title })}
          />
        }
      />
    );
  }
  const age = staleSince === undefined ? 0 : Math.max(1, Math.floor((now - staleSince) / 60_000));
  return (
    <>
      {status === 'stale' && (
        <>
          <StaleMark
            label={intl.formatMessage(messages.interactionStale)}
            age={intl.formatRelativeTime(-age, 'minute')}
          />
          {age >= 5 && (
            <Button onClick={retry}>{intl.formatMessage(messages.interactionRetry)}</Button>
          )}
        </>
      )}
      {children}
    </>
  );
}
