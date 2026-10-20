import { type MonthCompare } from '../../lib/stats/period-compare-rules.ts';

export function MonthCompareTable({ compare }: { compare: MonthCompare }) {
  return (
    <table className="stats-table">
      <caption className="visually-hidden">
        {compare.currentTitle} compared with {compare.previousTitle}
      </caption>
      <thead>
        <tr>
          <th scope="col">Total</th>
          <th scope="col">{compare.currentTitle}</th>
          <th scope="col">{compare.previousTitle}</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {compare.rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.current}</td>
            <td>{row.previous}</td>
            <td>{row.change}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
