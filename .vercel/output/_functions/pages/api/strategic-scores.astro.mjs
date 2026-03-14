import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../renderers.mjs';

const prerender = false;
function clampN(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function labelFromIvp(score100) {
  if (score100 >= 90) return "Transformation patrimoniale";
  if (score100 >= 75) return "Potentiel stratégique";
  if (score100 >= 60) return "Valorisation significative";
  if (score100 >= 40) return "Optimisation modérée";
  return "Impact patrimonial limité";
}
function computeStrategicScores(items, matrix) {
  const byJobType = new Map(matrix.map((m) => [m.job_type, m]));
  let totalWeight = 0;
  let ivpAcc = 0, ipiAcc = 0;
  let valueAcc = 0, liqAcc = 0, attrAcc = 0, energyAcc = 0, riskRedAcc = 0;
  let rentAcc = 0, vacAcc = 0, fiscAcc = 0, capexRiskAcc = 0;
  let recoveryAcc = 0;
  for (const it of items) {
    const m = byJobType.get(it.job_type);
    if (!m) continue;
    const w = it.weight_ht > 0 ? it.weight_ht : 1;
    totalWeight += w;
    const value = Number(m.value_intrinseque ?? 0);
    const liq = Number(m.liquidite ?? 0);
    const attr = Number(m.attractivite ?? 0);
    const nrj = Number(m.energie ?? 0);
    const rr = Number(m.reduction_risque ?? 0);
    const rent = Number(m.impact_loyer ?? 0);
    const vac = Number(m.vacance ?? 0);
    const fisc = Number(m.fiscalite ?? 0);
    const capex = Number(m.capex_risk ?? 0);
    const rate = Number(m.recovery_rate ?? 0.5);
    const ivp = 0.3 * value + 0.25 * liq + 0.2 * attr + 0.15 * nrj + 0.1 * rr;
    const ipi = 0.35 * rent + 0.25 * vac + 0.2 * nrj + 0.1 * fisc + 0.1 * (5 - capex);
    ivpAcc += ivp * w;
    ipiAcc += ipi * w;
    valueAcc += value * w;
    liqAcc += liq * w;
    attrAcc += attr * w;
    energyAcc += nrj * w;
    riskRedAcc += rr * w;
    rentAcc += rent * w;
    vacAcc += vac * w;
    fiscAcc += fisc * w;
    capexRiskAcc += capex * w;
    recoveryAcc += rate * w;
  }
  if (totalWeight === 0) {
    return {
      ivp_score: null,
      ipi_score: null,
      label: "Non calculé",
      breakdown_owner: null,
      breakdown_investor: null,
      weighted_recovery_rate: null
    };
  }
  const ivpScore100 = clampN(Math.round(ivpAcc / totalWeight * 20), 0, 100);
  const ipiScore100 = clampN(Math.round(ipiAcc / totalWeight * 20), 0, 100);
  const s = (v) => clampN(Math.round(v / totalWeight / 5 * 10), 0, 10);
  return {
    ivp_score: ivpScore100,
    ipi_score: ipiScore100,
    label: labelFromIvp(ivpScore100),
    breakdown_owner: {
      value: s(valueAcc),
      liquidite: s(liqAcc),
      attractivite: s(attrAcc),
      energie: s(energyAcc),
      reduction_risque: s(riskRedAcc)
    },
    breakdown_investor: {
      impact_loyer: s(rentAcc),
      vacance: s(vacAcc),
      energie: s(energyAcc),
      fiscalite: s(fiscAcc),
      capex_risk: clampN(Math.round(capexRiskAcc / totalWeight / 5 * 10), 0, 10)
    },
    weighted_recovery_rate: recoveryAcc / totalWeight
  };
}
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items[] requis" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQzMjEsImV4cCI6MjA4NjMwMDMyMX0.s1LvwmlSSGaCjiPRI8j4op-7xke7h53Ng8nqIkNAAzI";
    const supabase = createClient(supabaseUrl, supabaseKey);
    const uniqueJobTypes = [...new Set(items.map((i) => i.job_type))];
    const { data: matrixRows, error } = await supabase.from("strategic_matrix").select(
      "job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque, impact_loyer, vacance, fiscalite, capex_risk, recovery_rate"
    ).in("job_type", uniqueJobTypes);
    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
    if (!matrixRows || matrixRows.length === 0) {
      return new Response(
        JSON.stringify({
          ivp_score: null,
          ipi_score: null,
          label: "Non calculé",
          breakdown_owner: null,
          breakdown_investor: null,
          weighted_recovery_rate: null
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }
    const weightedItems = items.map((i) => ({
      job_type: i.job_type,
      weight_ht: i.amount_ht > 0 ? i.amount_ht : 1
    }));
    const scores = computeStrategicScores(weightedItems, matrixRows);
    return new Response(JSON.stringify(scores), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS_HEADERS });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
