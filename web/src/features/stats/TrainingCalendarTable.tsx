import { CALENDAR_WEEKDAYS, type TrainingCalendar } from '../../lib/stats/training-calendar-rules.ts';

export function TrainingCalendarTable({ calendar }: { calendar: TrainingCalendar }) {
  return (
    <table className="training-calendar">
      <caption>{calendar.title}</caption>
      <thead>
        <tr>
          {CALENDAR_WEEKDAYS.map((weekday) => (
            <th key={weekday.short} scope="col">
              <abbr title={weekday.long}>{weekday.short}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {calendar.weeks.map((week, weekIndex) => (
          <tr key={weekIndex}>
            {week.map((day, dayIndex) =>
              day ? (
                <td
                  key={day.localDate}
                  className={`calendar-day heat-${day.heat}`}
                  aria-current={day.isToday ? 'date' : undefined}
                >
                  <span aria-hidden="true">{day.dayOfMonth}</span>
                  <span className="visually-hidden">{day.label}</span>
                </td>
              ) : (
                <td key={`blank-${dayIndex}`} />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
