// Pull GA4 + GSC data via OAuth refresh token, output JSON to stdout.
//
// Required env vars:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   GA_PROPERTY_ID         — numeric GA4 property ID (e.g. "123456789")
//   GSC_SITE_URL           — e.g. "sc-domain:verifiermondevis.fr"
//
// Usage: node scripts/seo-fetch-data.mjs > seo-data.json

import { google } from 'googleapis';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};

const oauth2 = new google.auth.OAuth2(
  env('GOOGLE_OAUTH_CLIENT_ID'),
  env('GOOGLE_OAUTH_CLIENT_SECRET'),
);
oauth2.setCredentials({ refresh_token: env('GOOGLE_OAUTH_REFRESH_TOKEN') });

const PROPERTY_ID = env('GA_PROPERTY_ID');
const SITE_URL = env('GSC_SITE_URL');

const isoDate = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const daysAgo = (n) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

// GSC: 28d vs prior 28d (Search Console has 2-3 days lag, so end at -2)
const gscEnd = daysAgo(2);
const gscCurStart = daysAgo(2 + 28);
const gscPrevEnd = daysAgo(2 + 28 + 1);
const gscPrevStart = daysAgo(2 + 28 + 28);

// GA4: 7d vs prior 7d
const gaEnd = daysAgo(1);
const gaCurStart = daysAgo(1 + 7);
const gaPrevEnd = daysAgo(1 + 7 + 1);
const gaPrevStart = daysAgo(1 + 7 + 7);

const log = (...a) => console.error(...a);

// ─── GSC ──────────────────────────────────────────────────────────────────────

async function gscQuery(body) {
  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });
  const res = await searchconsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: body,
  });
  return res.data;
}

async function fetchGSC() {
  log('🔍 GSC: site=' + SITE_URL);

  const out = { available: true, error: null };

  try {
    // 1. Totals current period
    const totalsCur = await gscQuery({
      startDate: isoDate(gscCurStart),
      endDate: isoDate(gscEnd),
      dimensions: [],
      rowLimit: 1,
    });
    const totalsPrev = await gscQuery({
      startDate: isoDate(gscPrevStart),
      endDate: isoDate(gscPrevEnd),
      dimensions: [],
      rowLimit: 1,
    });

    const cur = totalsCur.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const prev = totalsPrev.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    out.totals = {
      current: {
        period: `${isoDate(gscCurStart)} → ${isoDate(gscEnd)}`,
        clicks: cur.clicks || 0,
        impressions: cur.impressions || 0,
        ctr: cur.ctr || 0,
        position: cur.position || 0,
      },
      previous: {
        period: `${isoDate(gscPrevStart)} → ${isoDate(gscPrevEnd)}`,
        clicks: prev.clicks || 0,
        impressions: prev.impressions || 0,
        ctr: prev.ctr || 0,
        position: prev.position || 0,
      },
    };

    // 2. Top queries (current period)
    const topQueries = await gscQuery({
      startDate: isoDate(gscCurStart),
      endDate: isoDate(gscEnd),
      dimensions: ['query'],
      rowLimit: 50,
      orderBy: [{ field: 'clicks', descending: true }],
    });
    out.topQueries = (topQueries.rows || []).map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    // 3. Top pages (current period)
    const topPages = await gscQuery({
      startDate: isoDate(gscCurStart),
      endDate: isoDate(gscEnd),
      dimensions: ['page'],
      rowLimit: 50,
      orderBy: [{ field: 'clicks', descending: true }],
    });
    out.topPages = (topPages.rows || []).map(r => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    // 4. Quick wins: pages position 11-20 with ≥100 impressions
    const allPages = await gscQuery({
      startDate: isoDate(gscCurStart),
      endDate: isoDate(gscEnd),
      dimensions: ['page', 'query'],
      rowLimit: 1000,
      orderBy: [{ field: 'impressions', descending: true }],
    });
    out.quickWins = (allPages.rows || [])
      .filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 100)
      .slice(0, 30)
      .map(r => ({
        page: r.keys[0],
        query: r.keys[1],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    // 5. Meta underperformance: ≥500 imp + CTR<2% + pos≤15 (page-level)
    out.metaUnderperformance = (topPages.rows || [])
      .filter(r => r.impressions >= 500 && r.ctr < 0.02 && r.position <= 15)
      .slice(0, 20)
      .map(r => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    log(`  ✅ GSC OK — ${out.topPages.length} pages, ${out.topQueries.length} queries, ${out.quickWins.length} quick wins`);
  } catch (e) {
    log('  ❌ GSC error: ' + (e?.message || e));
    out.available = false;
    out.error = e?.message || String(e);
  }

  return out;
}

// ─── GA4 ──────────────────────────────────────────────────────────────────────

async function ga4RunReport(body) {
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: oauth2 });
  const res = await analyticsdata.properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: body,
  });
  return res.data;
}

function parseGA4Rows(report, fields) {
  return (report.rows || []).map(r => {
    const o = {};
    r.dimensionValues.forEach((v, i) => { o[report.dimensionHeaders[i].name] = v.value; });
    r.metricValues.forEach((v, i) => {
      const name = report.metricHeaders[i].name;
      o[name] = parseFloat(v.value) || 0;
    });
    return o;
  });
}

async function fetchGA4() {
  log('📊 GA4: property=' + PROPERTY_ID);
  const out = { available: true, error: null };

  try {
    const totals = (range) => ga4RunReport({
      dateRanges: [range],
      metrics: [
        { name: 'totalUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
      ],
    });

    const cur = await totals({ startDate: isoDate(gaCurStart), endDate: isoDate(gaEnd) });
    const prev = await totals({ startDate: isoDate(gaPrevStart), endDate: isoDate(gaPrevEnd) });

    const t = (rep) => {
      const row = rep.rows?.[0];
      if (!row) return { totalUsers: 0, sessions: 0, screenPageViews: 0, engagementRate: 0, averageSessionDuration: 0 };
      const o = {};
      row.metricValues.forEach((v, i) => {
        o[rep.metricHeaders[i].name] = parseFloat(v.value) || 0;
      });
      return o;
    };

    out.totals = {
      current: { period: `${isoDate(gaCurStart)} → ${isoDate(gaEnd)}`, ...t(cur) },
      previous: { period: `${isoDate(gaPrevStart)} → ${isoDate(gaPrevEnd)}`, ...t(prev) },
    };

    // Organic split
    const organic = await ga4RunReport({
      dateRanges: [{ startDate: isoDate(gaCurStart), endDate: isoDate(gaEnd) }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    });
    out.byChannel = parseGA4Rows(organic);

    // Top pages by organic sessions, with engagement
    const topPages = await ga4RunReport({
      dateRanges: [{ startDate: isoDate(gaCurStart), endDate: isoDate(gaEnd) }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 30,
    });
    out.topPages = parseGA4Rows(topPages);

    // Engagement faible: pages >100 sessions, durée<20s, engagement<30%
    out.lowEngagement = out.topPages
      .filter(p => p.sessions >= 100 && p.averageSessionDuration < 20 && p.engagementRate < 0.3)
      .slice(0, 20);

    log(`  ✅ GA4 OK — users ${out.totals.current.totalUsers}, ${out.topPages.length} top pages`);
  } catch (e) {
    log('  ❌ GA4 error: ' + (e?.message || e));
    out.available = false;
    out.error = e?.message || String(e);
  }

  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [gsc, ga4] = await Promise.all([fetchGSC(), fetchGA4()]);

const result = {
  generatedAt: new Date().toISOString(),
  site: SITE_URL,
  ga4PropertyId: PROPERTY_ID,
  gsc,
  ga4,
};

process.stdout.write(JSON.stringify(result, null, 2));
