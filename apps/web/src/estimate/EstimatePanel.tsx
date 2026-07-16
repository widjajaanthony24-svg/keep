import { useMemo, useState } from "react";
import { computeEstimate, type BuildingGraph } from "@keep/building-graph";
import { NumberField } from "../editor/NumberField";

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

export function EstimatePanel({
  graph,
  onLaborRateChange,
}: {
  graph: BuildingGraph;
  onLaborRateChange?: (rate: number) => void;
}) {
  const [pendingRate, setPendingRate] = useState<number | null>(null);
  const laborRate = pendingRate ?? graph.metadata.laborRatePerHour;
  const estimate = useMemo(() => computeEstimate(graph, laborRate), [graph, laborRate]);

  function handleRateChange(rate: number) {
    setPendingRate(rate);
    onLaborRateChange?.(rate);
  }

  return (
    <div className="estimate-panel">
      <div className="estimate-panel__header">
        <div>
          <div className="eyebrow">Rough estimate</div>
          <div className="estimate-panel__total">{formatMoney(estimate.totalCost, estimate.currency)}</div>
        </div>
        <label className="estimate-panel__labor-rate">
          Labor rate ({estimate.currency}/hr)
          <NumberField value={laborRate} onChange={handleRateChange} step={1} min={0} max={500} />
          <span className="estimate-panel__labor-rate-hint">Typical range: 15–50, varies by region/trade</span>
        </label>
      </div>

      {estimate.lineItems.length === 0 ? (
        <p className="muted">Nothing to estimate yet — add walls, a roof, or openings.</p>
      ) : (
        <>
          <table className="estimate-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Quantity</th>
                <th>Unit cost</th>
                <th>Material cost</th>
                <th>Labor hrs</th>
                <th>Labor cost</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lineItems.map((li) => (
                <tr key={li.materialId}>
                  <td>{li.materialName}</td>
                  <td>
                    {li.quantity.toFixed(li.unit === "unit" ? 0 : 2)} {li.unit === "unit" ? "" : li.unit}
                  </td>
                  <td>
                    {li.unitCost.toFixed(2)} {estimate.currency}
                  </td>
                  <td>{formatMoney(li.materialCost, estimate.currency)}</td>
                  <td>{li.laborHours.toFixed(1)}</td>
                  <td>{formatMoney(li.laborCost, estimate.currency)}</td>
                  <td className="estimate-table__total-cell">{formatMoney(li.totalCost, estimate.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                <td>{estimate.totalLaborHours.toFixed(0)}</td>
                <td>{formatMoney(estimate.totalLaborCost, estimate.currency)}</td>
                <td className="estimate-table__total-cell">{formatMoney(estimate.totalCost, estimate.currency)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="estimate-panel__hint">
            Quantities come straight from your model's geometry. Unit costs are the built-in
            defaults for now — a materials-catalog editor to adjust them per project is the
            natural next step, not yet built. Cost breakdown by floor (rather than by material
            across the whole building) is also not yet available.
          </p>
        </>
      )}

      <p className="estimate-panel__exclusions">{estimate.exclusions}</p>
      <p className="estimate-panel__disclaimer">{estimate.disclaimer}</p>
    </div>
  );
}
