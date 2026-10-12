/**
 * Formatted Excel / PDF export for a closed salary period (admin disbursement).
 */

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  loadSalaryPeriodDetail,
  type SalaryPeriodDetail,
  type SalaryPayeeRow,
} from './salaryPeriodView';
import { summarizeHostSettlementLines } from '../../shared/finance/hostEarningsBreakdown';

function formatUsd(n: number) {
  return Number(n || 0).toFixed(4);
}

function componentCols(payee: SalaryPayeeRow | null | undefined) {
  if (!payee) {
    return { call: '0', gift: '0', trueUp: '0', tierBonus: '0', coins: 0 };
  }
  if (payee.role === 'team_leader') {
    return {
      call: formatUsd(payee.amountUsd),
      gift: '0',
      trueUp: '0',
      tierBonus: '0',
      coins: payee.amountCoins,
    };
  }
  const b = summarizeHostSettlementLines(payee.components || []);
  return {
    call: formatUsd(b.callEarningsUsd),
    gift: formatUsd(b.giftEarningsUsd),
    trueUp: formatUsd(b.targetShareTrueUpUsd),
    tierBonus: formatUsd(b.targetBonusUsd),
    coins: payee.amountCoins,
  };
}

function formatWindow(start: string, end: string) {
  try {
    return `${new Date(start).toISOString().slice(0, 10)} → ${new Date(end).toISOString().slice(0, 10)} UTC`;
  } catch {
    return `${start} → ${end}`;
  }
}

function pegFromDetail(detail: SalaryPeriodDetail): string {
  const snap = detail.period.configSnapshot || {};
  const peg = Number(snap.coin_usd_peg ?? snap.female_payout_ratio_usd ?? 0);
  return peg ? peg.toFixed(6) : '—';
}

export async function buildSalaryPeriodXlsx(
  periodId: string
): Promise<{ success: boolean; buffer?: Buffer; filename?: string; error?: string }> {
  const loaded = await loadSalaryPeriodDetail(periodId);
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error || 'Failed to load period' };
  }
  const d = loaded.data;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Minglecall Finance';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Salary disbursement');
  sheet.columns = [
    { header: 'Section', key: 'section', width: 22 },
    { header: 'Role', key: 'role', width: 14 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'User ID', key: 'userId', width: 38 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Payout method', key: 'payoutMethod', width: 14 },
    { header: 'Payout country', key: 'payoutCountry', width: 12 },
    { header: 'Payout details', key: 'payoutDetails', width: 48 },
    { header: 'Call USD', key: 'call', width: 12 },
    { header: 'Gift USD', key: 'gift', width: 12 },
    { header: 'True-up USD', key: 'trueUp', width: 12 },
    { header: 'Tier bonus USD', key: 'tierBonus', width: 14 },
    { header: 'Amount USD', key: 'usd', width: 14 },
    { header: 'Amount coins', key: 'coins', width: 14 },
    { header: 'Ack status', key: 'ack', width: 14 },
    { header: 'Batch ID', key: 'batchId', width: 38 },
  ];

  sheet.insertRow(1, ['Minglecall — Salary disbursement']);
  sheet.insertRow(2, [
    `Period: ${formatWindow(d.period.periodStart, d.period.periodEnd)} · ${d.period.cycleType}`,
  ]);
  sheet.insertRow(3, [
    `Peg: ${pegFromDetail(d)} · Generated: ${new Date().toISOString()} · Payment refs: ${
      d.paymentReferences.join(', ') || '—'
    }`,
  ]);
  sheet.insertRow(4, [
    `Totals — Due $${formatUsd(d.totals.totalDueUsd)} · Hosts $${formatUsd(
      d.totals.totalHostSalaryUsd
    )} · TL $${formatUsd(d.totals.totalTlCommissionUsd)} · Ack ${d.ackProgress.acknowledged}/${d.ackProgress.total}`,
  ]);
  sheet.insertRow(5, []);

  // Re-apply header at row 6 after inserts
  const headerRow = sheet.getRow(6);
  headerRow.values = [
    'Section',
    'Role',
    'Name',
    'User ID',
    'Email',
    'Payout method',
    'Payout country',
    'Payout details',
    'Call USD',
    'Gift USD',
    'True-up USD',
    'Tier bonus USD',
    'Amount USD',
    'Amount coins',
    'Ack status',
    'Batch ID',
  ];
  headerRow.font = { bold: true };

  const payoutCols = (p: SalaryPeriodDetail['directHosts'][number]) => [
    p.payout?.methodLabel || '—',
    p.payout?.countryCode || '—',
    p.payout?.summary || 'No payout card',
  ];

  let rowIdx = 7;
  for (const section of d.tlSections) {
    const sectionLabel = `TL ${section.teamLeader?.name || section.teamLeaderId.slice(0, 8)}`;
    if (section.teamLeader) {
      const tl = section.teamLeader;
      const c = componentCols(tl);
      sheet.getRow(rowIdx).values = [
        sectionLabel,
        'team_leader',
        tl.name || '',
        tl.userId,
        tl.email || '',
        ...payoutCols(tl),
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(tl.amountUsd),
        tl.amountCoins,
        tl.ackStatus,
        tl.batchId,
      ];
      rowIdx += 1;
    }
    for (const host of section.hosts) {
      const c = componentCols(host);
      sheet.getRow(rowIdx).values = [
        sectionLabel,
        'host',
        host.name || '',
        host.userId,
        host.email || '',
        ...payoutCols(host),
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(host.amountUsd),
        host.amountCoins,
        host.ackStatus,
        host.batchId,
      ];
      rowIdx += 1;
    }
  }

  for (const host of d.directHosts) {
    const c = componentCols(host);
    sheet.getRow(rowIdx).values = [
      'Direct hosts',
      'host',
      host.name || '',
      host.userId,
      host.email || '',
      ...payoutCols(host),
      c.call,
      c.gift,
      c.trueUp,
      c.tierBonus,
      formatUsd(host.amountUsd),
      host.amountCoins,
      host.ackStatus,
      host.batchId,
    ];
    rowIdx += 1;
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `salary-${d.period.cycleType}-${String(d.period.periodStart).slice(0, 10)}.xlsx`;
  return { success: true, buffer, filename };
}

export async function buildSalaryPeriodPdf(
  periodId: string
): Promise<{ success: boolean; buffer?: Buffer; filename?: string; error?: string }> {
  const loaded = await loadSalaryPeriodDetail(periodId);
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error || 'Failed to load period' };
  }
  const d = loaded.data;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.text('Minglecall — Salary disbursement', 40, 36);
  doc.setFontSize(9);
  doc.text(
    `Period: ${formatWindow(d.period.periodStart, d.period.periodEnd)} · ${d.period.cycleType}`,
    40,
    52
  );
  doc.text(
    `Peg: ${pegFromDetail(d)} · Generated: ${new Date().toISOString()} · Refs: ${
      d.paymentReferences.join(', ') || '—'
    }`,
    40,
    66
  );
  doc.text(
    `Totals — Due $${formatUsd(d.totals.totalDueUsd)} · Hosts $${formatUsd(
      d.totals.totalHostSalaryUsd
    )} · TL $${formatUsd(d.totals.totalTlCommissionUsd)} · Ack ${d.ackProgress.acknowledged}/${d.ackProgress.total}`,
    40,
    80
  );

  const body: string[][] = [];
  for (const section of d.tlSections) {
    const sectionLabel = `TL ${section.teamLeader?.name || section.teamLeaderId.slice(0, 8)}`;
    if (section.teamLeader) {
      const tl = section.teamLeader;
      const c = componentCols(tl);
      body.push([
        sectionLabel,
        'TL',
        tl.name || '—',
        tl.payout?.summary || 'No payout card',
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(tl.amountUsd),
        tl.ackStatus,
      ]);
    }
    for (const host of section.hosts) {
      const c = componentCols(host);
      body.push([
        sectionLabel,
        'Host',
        host.name || '—',
        host.payout?.summary || 'No payout card',
        c.call,
        c.gift,
        c.trueUp,
        c.tierBonus,
        formatUsd(host.amountUsd),
        host.ackStatus,
      ]);
    }
  }
  for (const host of d.directHosts) {
    const c = componentCols(host);
    body.push([
      'Direct hosts',
      'Host',
      host.name || '—',
      host.payout?.summary || 'No payout card',
      c.call,
      c.gift,
      c.trueUp,
      c.tierBonus,
      formatUsd(host.amountUsd),
      host.ackStatus,
    ]);
  }

  autoTable(doc, {
    startY: 96,
    head: [
      [
        'Section',
        'Role',
        'Name',
        'Payout',
        'Call',
        'Gift',
        'True-up',
        'Tier bonus',
        'Total USD',
        'Ack',
      ],
    ],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  const arrayBuffer = doc.output('arraybuffer');
  const buffer = Buffer.from(arrayBuffer);
  const filename = `salary-${d.period.cycleType}-${String(d.period.periodStart).slice(0, 10)}.pdf`;
  return { success: true, buffer, filename };
}
