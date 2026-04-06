import { useEffect, useState, useCallback } from 'react';

export interface JournalEntry {
  id: string;
  journal_date: string;
  body: string;
  alerts_count: number;
  max_severity: 'info' | 'warning' | 'critical';
  created_at: string;
  updated_at: string;
}

export interface CalendarDot {
  journal_date: string;
  alerts_count: number;
  max_severity: 'info' | 'warning' | 'critical';
}

interface UseChantierJournalReturn {
  entry: JournalEntry | null;
  calendarDots: CalendarDot[];
  currentDate: string;
  loading: boolean;
  goToDate: (date: string) => void;
  goToPrev: () => void;
  goToNext: () => void;
  refresh: () => Promise<void>;
}

function formatDateISO(d: Date): string {
  // Use local time components (not UTC) to avoid off-by-one near midnight
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

export function useChantierJournal(
  chantierId: string | null,
  token: string | null | undefined,
): UseChantierJournalReturn {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [calendarDots, setCalendarDots] = useState<CalendarDot[]>([]);
  const [currentDate, setCurrentDate] = useState(formatDateISO(new Date()));
  const [loading, setLoading] = useState(true);

  // Fetch single day entry
  const fetchEntry = useCallback(async (date: string) => {
    if (!chantierId || !token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/journal?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntry(data.entry ?? null);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [chantierId, token]);

  // Fetch calendar dots (last 30 days)
  const fetchCalendar = useCallback(async () => {
    if (!chantierId || !token) return;
    const to = formatDateISO(new Date());
    const from = addDays(to, -30);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/journal?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarDots(data.entries ?? []);
      }
    } catch { /* silent */ }
  }, [chantierId, token]);

  useEffect(() => { fetchEntry(currentDate); }, [fetchEntry, currentDate]);
  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const goToDate = useCallback((date: string) => setCurrentDate(date), []);
  const goToPrev = useCallback(() => setCurrentDate(d => addDays(d, -1)), []);
  const goToNext = useCallback(() => {
    const today = formatDateISO(new Date());
    setCurrentDate(d => {
      const next = addDays(d, 1);
      return next > today ? d : next; // Can't go past today
    });
  }, []);

  const refresh = useCallback(async () => {
    await fetchEntry(currentDate);
    await fetchCalendar();
  }, [fetchEntry, fetchCalendar, currentDate]);

  return { entry, calendarDots, currentDate, loading, goToDate, goToPrev, goToNext, refresh };
}
