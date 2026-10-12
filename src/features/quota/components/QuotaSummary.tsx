/**
 * Provider summary cards above the credential rows.
 *
 * The headline is remaining allowance. Claude Max is shown against a 500%
 * pool (base usage subtracted from 500), matching the dense quota board.
 * Every other provider stays on a 100% scale.
 */

import { useTranslation } from 'react-i18next';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import type { ResolvedTheme } from '@/types';
import { QUOTA_PROGRESS_HIGH_THRESHOLD, QUOTA_PROGRESS_MEDIUM_THRESHOLD } from './QuotaMeter';
import { QUOTA_TAB_ORDER } from '../constants';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import type { QuotaProviderType } from '../providers/types';
import styles from './QuotaSummary.module.scss';

type SummaryWindow = {
  id?: string;
  label: string;
  usedPercent: number | null;
  resetLabel: string;
};

type Level = 'high' | 'medium' | 'low' | 'empty';

const allowanceCap = (type: QuotaProviderType, planType: string | null): number =>
  type === 'claude' && planType === 'plan_max' ? 500 : 100;

const windowRank = (window: SummaryWindow): number => {
  const id = (window.id ?? '').toLowerCase();
  const label = window.label.toLowerCase();
  if (id.includes('fable') || label.includes('fable')) return 0;
  if (id.includes('week') || label.includes('week') || label.includes('7-day')) return 1;
  return 2;
};

const readWindows = (
  quota: QuotaCardState | undefined
): { windows: SummaryWindow[]; planType: string | null } => {
  if (!quota || quota.status !== 'success') return { windows: [], planType: null };
  const record = quota as unknown as Record<string, unknown>;
  const planType = typeof record.planType === 'string' ? record.planType : null;

  if (Array.isArray(record.windows)) {
    return {
      planType,
      windows: record.windows.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const window = item as Record<string, unknown>;
        return [
          {
            id: typeof window.id === 'string' ? window.id : undefined,
            label: typeof window.label === 'string' ? window.label : '',
            usedPercent: typeof window.usedPercent === 'number' ? window.usedPercent : null,
            resetLabel: typeof window.resetLabel === 'string' ? window.resetLabel : '',
          },
        ];
      }),
    };
  }

  if (Array.isArray(record.rows)) {
    return {
      planType,
      windows: record.rows.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        const limit = typeof row.limit === 'number' ? row.limit : 0;
        const used = typeof row.used === 'number' ? row.used : 0;
        return [
          {
            id: typeof row.id === 'string' ? row.id : undefined,
            label: typeof row.label === 'string' ? row.label : '',
            usedPercent: limit > 0 ? (used / limit) * 100 : null,
            resetLabel: typeof row.resetHint === 'string' ? row.resetHint : '',
          },
        ];
      }),
    };
  }

  if (Array.isArray(record.groups)) {
    const windows: SummaryWindow[] = [];
    for (const group of record.groups) {
      if (!group || typeof group !== 'object') continue;
      const buckets = (group as { buckets?: unknown[] }).buckets ?? [];
      for (const bucket of buckets) {
        if (!bucket || typeof bucket !== 'object') continue;
        const item = bucket as Record<string, unknown>;
        const remaining =
          typeof item.remainingFraction === 'number' ? item.remainingFraction : null;
        windows.push({
          id: typeof item.id === 'string' ? item.id : undefined,
          label: typeof item.label === 'string' ? item.label : '',
          usedPercent: remaining === null ? null : (1 - remaining) * 100,
          resetLabel: typeof item.resetTime === 'string' ? item.resetTime : '',
        });
      }
    }
    return { planType, windows };
  }

  return { planType, windows: [] };
};

const levelFor = (barPercent: number | null): Level => {
  if (barPercent === null) return 'empty';
  if (barPercent >= QUOTA_PROGRESS_HIGH_THRESHOLD) return 'high';
  if (barPercent >= QUOTA_PROGRESS_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
};

export type QuotaSummaryProps = {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
};

export function QuotaSummary({ entries, quotaFor, resolvedTheme }: QuotaSummaryProps) {
  const { t } = useTranslation();
  const groups = QUOTA_TAB_ORDER.flatMap((type) => {
    const group = entries.filter((entry) => entry.type === type);
    return group.length > 0 ? [{ type, entries: group }] : [];
  });

  if (groups.length === 0) return null;

  return (
    <div className={styles.strip}>
      {groups.map((group) => {
        const label = getTypeLabel(t, group.type);
        const iconSrc = getAuthFileIcon(group.type, resolvedTheme);
        let best: {
          window: SummaryWindow;
          windows: SummaryWindow[];
          planType: string | null;
          remaining: number;
          cap: number;
        } | null = null;

        for (const entry of group.entries) {
          const parsed = readWindows(quotaFor(entry));
          const window = [...parsed.windows].sort((a, b) => windowRank(a) - windowRank(b))[0];
          if (!window || window.usedPercent === null) continue;
          const cap = allowanceCap(group.type, parsed.planType);
          const remaining = Math.max(0, cap - window.usedPercent);
          if (
            !best ||
            windowRank(window) < windowRank(best.window) ||
            (windowRank(window) === windowRank(best.window) && remaining < best.remaining)
          ) {
            best = { window, windows: parsed.windows, planType: parsed.planType, remaining, cap };
          }
        }

        const cap = best?.cap ?? 100;
        const remaining = best ? Math.round(best.remaining) : null;
        const barPercent = remaining === null ? null : Math.max(0, Math.min(100, (remaining / cap) * 100));
        const secondary = best?.windows
          .filter((window) => window !== best?.window && window.usedPercent !== null)
          .sort((a, b) => windowRank(a) - windowRank(b))[0];
        const secondaryCap = best ? allowanceCap(group.type, best.planType) : 100;
        const secondaryRemaining =
          secondary?.usedPercent === null || secondary?.usedPercent === undefined
            ? null
            : Math.max(0, Math.round(secondaryCap - secondary.usedPercent));

        return (
          <article key={group.type} className={styles.card}>
            <header className={styles.head}>
              <span className={styles.identity}>
                <span
                  className={styles.iconWrap}
                  style={
                    isThemeSurfaceIconProvider(group.type)
                      ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
                      : undefined
                  }
                >
                  {iconSrc ? (
                    <img src={iconSrc} alt="" className={styles.icon} />
                  ) : (
                    <span className={styles.iconFallback}>{label.slice(0, 1)}</span>
                  )}
                </span>
                <span className={styles.name}>{label}</span>
              </span>
              <span className={styles.count}>
                {t('quota_management.meta_credentials', { count: group.entries.length })}
              </span>
            </header>
            <p className={styles.windowLabel}>{best?.window.label || '—'}</p>
            <p className={styles.figure}>
              <span className={styles.figureValue}>{remaining === null ? '--' : `${remaining}%`}</span>
              <span className={styles.figureCap}>
                {t('quota_management.of_cap', { cap, defaultValue: 'of {{cap}}%' })}
              </span>
            </p>
            <div className={styles.track} aria-hidden="true">
              <span
                className={styles.fill}
                data-level={levelFor(barPercent)}
                style={{ width: `${barPercent ?? 0}%` }}
              />
            </div>
            <p className={styles.reset}>{best?.window.resetLabel || ''}</p>
            {secondary && secondaryRemaining !== null && (
              <p className={styles.secondary}>
                {secondary.label} {secondaryRemaining}%
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
