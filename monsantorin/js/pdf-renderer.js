// pdf-renderer.js — backend Typst-WASM pour MonSantorin
import { computeScore, removeTiersTempsBadge } from './engine.js';
import { wrapCodeText, convertMsCodeTags } from './addons.js';
import { TYPST_VERSION } from './constants.js';

const CDN = 'https://cdn.jsdelivr.net/npm';

let _typstReady = null;

async function ensureTypst() {
  if (_typstReady) return _typstReady;
  _typstReady = (async () => {
    const { $typst } = await import(`${CDN}/@myriaddreamin/typst.ts@${TYPST_VERSION}/dist/esm/contrib/snippet.mjs`);
    $typst.setCompilerInitOptions({
      getModule: () => `${CDN}/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`,
    });
    $typst.setRendererInitOptions({
      getModule: () => `${CDN}/@myriaddreamin/typst-ts-renderer@${TYPST_VERSION}/pkg/typst_ts_renderer_bg.wasm`,
    });
    return $typst;
  })();
  return _typstReady;
}

// ---------- Échappement / conversion ----------

function escTypstStr(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escTypstInlineKeepMd(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([#\$@<>~`\[\]])/g, '\\$1');
}

function tryRenderArrayBlock(inner) {
  const m = inner.match(/^\s*\\begin\{array\}\{([^}]*)\}([\s\S]*?)\\end\{array\}\s*$/);
  if (!m) return null;
  const spec = m[1];
  let body = m[2];

  const colsAlign = [];
  const vbars = new Set();
  let pendingBar = false;
  for (const ch of spec) {
    if (ch === '|') pendingBar = true;
    else if (ch === 'c' || ch === 'l' || ch === 'r') {
      if (pendingBar) vbars.add(colsAlign.length);
      pendingBar = false;
      colsAlign.push(ch);
    }
  }
  if (pendingBar) vbars.add(colsAlign.length);

  const HMARK = '@@H@@';
  body = body.replace(/\\hline/g, HMARK).replace(/\\cline\{[^}]*\}/g, '');
  const rawSegments = body.split(/\\\\/);
  const rows = [];
  const hbars = new Set();
  for (let i = 0; i < rawSegments.length; i++) {
    let seg = rawSegments[i];
    while (/^\s*@@H@@/.test(seg)) {
      hbars.add(rows.length);
      seg = seg.replace(/^\s*@@H@@\s*/, '');
    }
    if (seg.trim().length > 0) rows.push(seg);
  }

  if (rows.length === 0) return null;

  let N = colsAlign.length;
  const splitRows = rows.map(r => r.split('&').map(c => c.trim()));
  for (const r of splitRows) if (r.length > N) N = r.length;
  if (N === 0) return null;

  const alignMap = { c: 'center', l: 'left', r: 'right' };
  const aligns = [];
  for (let i = 0; i < N; i++) aligns.push(alignMap[colsAlign[i]] || 'center');

  const NR = splitRows.length;
  const cells = [];
  for (const r of splitRows) {
    for (let i = 0; i < N; i++) {
      const c = (r[i] || '').trim();
      if (!c) cells.push('[]');
      else cells.push('[' + mitexInline(c) + ']');
    }
  }

  const vbarsArr = [...vbars].sort((a, b) => a - b);
  const hbarsArr = [...hbars].sort((a, b) => a - b);
  const vbarsLit = '(' + vbarsArr.join(', ') + (vbarsArr.length === 1 ? ',' : '') + ')';
  const hbarsLit = '(' + hbarsArr.join(', ') + (hbarsArr.length === 1 ? ',' : '') + ')';

  const stroke =
    `(x, y) => (` +
    `left: if x in ${vbarsLit} { 0.5pt }, ` +
    `right: if x == ${N - 1} and (${N} in ${vbarsLit}) { 0.5pt }, ` +
    `top: if y in ${hbarsLit} { 0.5pt }, ` +
    `bottom: if y == ${NR - 1} and (${NR} in ${hbarsLit}) { 0.5pt },` +
    `)`;

  return (
    `#table(\n` +
    `  columns: ${N},\n` +
    `  align: (${aligns.join(', ')}),\n` +
    `  stroke: ${stroke},\n` +
    `  inset: 5pt,\n` +
    `  ${cells.join(', ')}\n` +
    `)`
  );
}

function mitexInline(latex) {
  const esc = String(latex).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return '#mi("' + esc + '")';
}

function escTypstCode(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

function inlineToTypst(text) {
  if (text == null) return '';
  let s = convertMsCodeTags(String(text));

  // 1. Extraire les blocs de code avant tout traitement LaTeX / Markdown
  const codeBlocks = [];
  s = s.replace(/```([\w+\-.]*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang.trim(), code: code.replace(/\r?\n$/, '') });
    return `\u0000CB${idx}\u0000`;
  });

  const inlineCodes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `\u0000IC${idx}\u0000`;
  });

  // 2. Traitement LaTeX + Markdown classique (logique inchangée)
  const parts = s.split(/(\$\s*[^$]*\s*\$|\\\([\s\S]*?\\\))/g);
  let result = parts.map(p => {
    if (!p) return '';
    if (p.startsWith('$') && p.endsWith('$') && p.length >= 2) {
      const inner = p.slice(1, -1);
      const tbl = tryRenderArrayBlock(inner);
      if (tbl !== null) return tbl;
      return mitexInline(inner);
    }
    if (p.startsWith('\\(') && p.endsWith('\\)')) {
      const inner = p.slice(2, -2);
      const tbl = tryRenderArrayBlock(inner);
      if (tbl !== null) return tbl;
      return mitexInline(inner);
    }
    let t = escTypstInlineKeepMd(p);
    t = t.replace(/\*\*(.*?)\*\*/g, '#strong[$1]');
    t = t.replace(/\*([^\s*](?:.*?[^\s*])?)\*/g, '#emph[$1]');
    t = t.replace(/\*/g, '\\*');
    t = t.replace(/\r?\n/g, ' \\\n');
    return t;
  }).join('');

  // 3. Restaurer le code inline → #raw("...")
  inlineCodes.forEach((code, idx) => {
    result = result.split(`\u0000IC${idx}\u0000`).join(
      `#raw("${escTypstCode(code)}")`
    );
  });

  // 4. Restaurer les blocs de code → #raw(block: true, lang: "...", "...")
  codeBlocks.forEach((block, idx) => {
    const langArg = block.lang ? `lang: "${block.lang}", ` : '';
    const escaped = escTypstCode(block.code);
    result = result.split(`\u0000CB${idx}\u0000`).join(
      ` \\\n#block(width: 100%, fill: luma(97%), stroke: (left: 2pt + luma(60%)), radius: (right: 3pt), inset: (x: 8pt, y: 6pt))[#text(font: ("Courier New", "Courier", "monospace"), size: 0.85em)[#raw(${langArg}"${escaped}")]] \\\n`
    );
  });

  return result;
}

function stripToText(s) {
  let str = String(s ?? '')
    .replace(/\[\[\w+\]\][\s\S]*?\[\[\/\w+\]\]/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return str.replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
}

// ---------- Construction de la source ----------

function fmtNum(n) {
  const v = parseFloat(n);
  if (!isFinite(v)) return String(n);
  return parseFloat(v.toFixed(3)).toString();
}

function buildTable(student, ctx) {
  const baremeConfig = ctx.baremeConfig || [];
  const showAnswers = !!ctx.showAnswersOnPdf;
  const isTT = !!ctx.isTiersTemps;
  
  // Utilisation exclusive du moteur officiel pour la cohérence des totaux
  const res = computeScore(student.scores || {}, baremeConfig, isTT);

  const rows = [];
  rows.push('table.header([*Question*], [*Note*], [*Max*])');

  baremeConfig.forEach((exo, eIdx) => {
    const subRows = [];

    if (exo.parts) {
      exo.parts.forEach((part, pIdx) => {
        const qRows = [];
        part.questions.forEach((q, qIdx) => {
          const sv = student.scores?.[`e${eIdx}-p${pIdx}-q${qIdx}`];
          const num = (sv === '' || sv == null || isNaN(parseFloat(sv))) ? null : parseFloat(sv);
          
          // Notes brutes, sans aucune majoration locale !
          const qScore = num;
          const qMax = q.max;

          const display = qScore == null ? '-' : fmtNum(qScore);

          let label = inlineToTypst(q.label || '');
          if (showAnswers && q.answer != null && String(q.answer).trim() !== '') {
            label += ` \\ #box(fill: rgb(255, 253, 245), stroke: (left: 3pt + rgb(255, 193, 7)), radius: (right: 4pt), width: 100%, inset: 8pt)[#box(width: 1em, baseline: 15%)[#image("/ampoule.png")] #text(size: 0.85em, fill: rgb(108, 117, 125))[#emph[${inlineToTypst(wrapCodeText(String(q.answer)))}]]]`;
          }
          qRows.push(`[#h(1.2em) ${label}], [${display}], [#h(0pt)/ ${fmtNum(qMax)}]`);
        });
        
        // Total de la partie calculé par le moteur
        const pRes = res.partTotals[`${eIdx}-${pIdx}`];
        const partLbl = inlineToTypst(part.name || '');
        subRows.push(`table.cell(fill: luma(98%))[#emph[${partLbl}]], [#strong[${fmtNum(pRes.total)}]], [#h(0pt)/ ${fmtNum(pRes.max)}]`);
        subRows.push(...qRows);
      });
      
      // Total de l'exercice calculé par le moteur
      const eRes = res.exoTotals[eIdx];
      const exoLbl = inlineToTypst(exo.title || '');
      rows.push(`table.cell(fill: luma(94%))[#strong[${exoLbl}]], table.cell(fill: luma(94%))[#strong[${fmtNum(eRes.total)}]], table.cell(fill: luma(94%))[#strong[#h(0pt)/ ${fmtNum(eRes.max)}]]`);
      rows.push(...subRows);
      
    } else if (exo.questions) {
      exo.questions.forEach((q, qIdx) => {
        const sv = student.scores?.[`e${eIdx}-q${qIdx}`];
        const num = (sv === '' || sv == null || isNaN(parseFloat(sv))) ? null : parseFloat(sv);
        
        // Notes brutes, sans aucune majoration locale !
        const qScore = num;
        const qMax = q.max;

        const display = qScore == null ? '-' : fmtNum(qScore);

        let label = inlineToTypst(q.label || '');
        if (showAnswers && q.answer != null && String(q.answer).trim() !== '') {
            label += ` \\ #box(fill: rgb(255, 253, 245), stroke: (left: 3pt + rgb(255, 193, 7)), radius: (right: 4pt), width: 100%, inset: 8pt)[#box(width: 1em, baseline: 15%)[#image("/ampoule.png")] #text(size: 0.85em, fill: rgb(108, 117, 125))[#emph[${inlineToTypst(wrapCodeText(String(q.answer)))}]]]`;
        }
        subRows.push(`[${label}], [${display}], [#h(0pt)/ ${fmtNum(qMax)}]`);
      });
      
      // Total de l'exercice calculé par le moteur
      const eRes = res.exoTotals[eIdx];
      const exoLbl = inlineToTypst(exo.title || '');
      rows.push(`table.cell(fill: luma(94%))[#strong[${exoLbl}]], table.cell(fill: luma(94%))[#strong[${fmtNum(eRes.total)}]], table.cell(fill: luma(94%))[#strong[#h(0pt)/ ${fmtNum(eRes.max)}]]`);
      rows.push(...subRows);
    }
  });

  const isTTNote = isTT ? ` (Note majorée plafonnée)` : ``;
  const footerTitle = `#strong[Total Copie]${isTTNote}`;

  // Total général calculé par le moteur
  rows.push(`table.cell(fill: rgb(240,248,255))[${footerTitle}], table.cell(fill: rgb(240,248,255))[#strong[${fmtNum(res.total)}]], table.cell(fill: rgb(240,248,255))[#strong[#h(0pt)/ ${fmtNum(res.maxPossible)}]]`);

  return {
    src: `#table(columns: (1fr, auto, auto), align: (left, center, right), inset: 6pt, stroke: 0.5pt + luma(80%), ${rows.join(', ')})`,
    grandTotal: res.total,
    grandMax: res.maxPossible
  };
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function generateEmojiBytes(emoji) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '50px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  const dataUrl = canvas.toDataURL('image/png');
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function buildSource(student, ctx, hasChartImage) {
  const fontSize = parseInt(ctx.fontSize || '16', 10);
  const sizePt = Math.max(8, Math.min(16, Math.round(fontSize * 0.75)));

  const docTitle = stripToText(ctx.docTitle || 'Bilan');
  const studentName = stripToText(removeTiersTempsBadge(student.name || 'Sans nom'));

  const { src: tableSrc, grandTotal, grandMax } = buildTable(student, ctx);

  const statusMention = ctx.isIncomplete 
    ? `\n#align(center)[#text(fill: rgb(185, 28, 28), size: 1.1em, weight: "bold")[⚠️ TOTAL PROVISOIRE - CORRECTION INCOMPLÈTE]]\n`
    : '';

  const totalLine = (ctx.scaleTo20 && grandMax > 0)
    ? `#strong[TOTAL : ${fmtNum(grandTotal)} / ${fmtNum(grandMax)}] — Sur 20 : #strong[${fmtNum((grandTotal / grandMax) * 20)}]`
    : `#strong[TOTAL : ${fmtNum(grandTotal)} / ${fmtNum(grandMax)}]`;

  const classLineBlock = (ctx.classAvg != null)
    ? `\n #v(0.5em) #text(size: 0.9em, fill: rgb(100,100,100))[Moyenne classe : #strong[${fmtNum(ctx.classAvg)}]${ctx.scaleTo20 ? ' / 20' : ' / ' + fmtNum(grandMax)}]`
    : '';

  const ttMention = ctx.isTiersTemps ? `\n#align(center)[#text(fill: rgb(22, 163, 74), size: 0.9em, style: "italic")[*Note majorée au titre du tiers-temps*]]\n` : '';

  const chartBlock = hasChartImage ? `\n#v(1em)\n#align(center)[#image("/chart.png", width: 75%)]\n` : '';

  let apprBlock = '';
  if (ctx.showAppreciation) {
    const apprText = student.appreciation ? inlineToTypst(student.appreciation) : '#emph[Aucune appréciation]';
    apprBlock = `\n#v(1em)\n#block(width: 100%, stroke: 0.5pt, inset: 10pt, radius: 5pt)[\n  #strong[Appréciation]\n  #v(0.5em)\n  ${apprText}\n]`;
  }

  let skillsBlock = '';
  if (ctx.showSkills && student.skillBilan && student.skillBilan.trim() !== '') {
    skillsBlock = `\n#v(1em)\n#block(width: 100%, fill: rgb(240, 253, 244), stroke: rgb(187, 247, 208), inset: 10pt, radius: 5pt)[\n  #box(width: 1.2em, baseline: 20%)[#image("/cible.png")] #strong[Bilan des capacités attendues]\n  #v(0.5em)\n`;
    
    let htmlLines = student.skillBilan.split('<br>').map(s => s.trim()).filter(s => s.length > 0);
    htmlLines.forEach(line => {
        let typstLine = stripToText(line);
        if (line.includes('skill-acquis')) {
            skillsBlock += `  #text(fill: rgb(21, 128, 61), weight: "bold")[${inlineToTypst("Acquis :")}] \n`;
        } else if (line.includes('skill-encours')) {
            skillsBlock += `  #v(0.5em) #text(fill: rgb(194, 65, 12), weight: "bold")[${inlineToTypst("En cours d'acquisition :")}] \n`;
        } else if (line.includes('skill-nonacquis')) {
            skillsBlock += `  #v(0.5em) #text(fill: rgb(185, 28, 28), weight: "bold")[${inlineToTypst("Non acquis :")}] \n`;
        } else if (line.startsWith('-')) {
            skillsBlock += `  - ${inlineToTypst(typstLine.substring(1).trim())} \n`;
        }
    });
    skillsBlock += `]`;
  }

  return `
#import "@preview/mitex:0.2.4": *

#set document(title: "${escTypstStr(docTitle)}", author: "MonSantorin")
#set page(paper: "a4", margin: 1.5cm)
#set text(font: ("Arial", "Helvetica", "sans-serif"), size: ${sizePt}pt, lang: "fr")

#grid(
  columns: (1fr, auto),
  align: (left, right),
  [#text(size: 1.5em, weight: "bold")[${escTypstInlineKeepMd(docTitle)}]],
  [#text(size: 1.2em, weight: "bold")[${escTypstInlineKeepMd(studentName)}]]
)
#v(0.5em)
#line(length: 100%, stroke: 2pt)

#v(1em)
${tableSrc}
${statusMention}
${ttMention}

#v(1em)
#align(right)[
  #block(
    stroke: 1pt + rgb(0,0,0), radius: 5pt, inset: 10pt,
    fill: rgb(250,250,250),
    [
      ${totalLine}
      ${classLineBlock}
    ]
  )
]

${chartBlock}
${apprBlock}
${skillsBlock}
`;
}

// ---------- API publique ----------

export async function generatePdfForStudent(student, ctx, isDownload) {
  const $typst = await ensureTypst();
  ctx = ctx || {};
  
  try { await $typst.resetShadow(); } catch (_) {}

  const hasChart = !!ctx.chartImageDataUrl;
  if (hasChart) {
    const bytes = dataUrlToBytes(ctx.chartImageDataUrl);
    await $typst.mapShadow('/chart.png', bytes);
  }

  const ampouleBytes = generateEmojiBytes('💡');
  const cibleBytes = generateEmojiBytes('🎯');
  await $typst.mapShadow('/ampoule.png', ampouleBytes);
  await $typst.mapShadow('/cible.png', cibleBytes);

  const src = buildSource(student, ctx, hasChart);

  let pdfBytes;
  try {
    pdfBytes = await $typst.pdf({ mainContent: src });
  } catch (error) {
    console.error("Erreur fatale du compilateur Typst/Mitex :", error);
    alert("Impossible de générer le PDF.\n\nUne erreur de syntaxe LaTeX a fait échouer le moteur mathématique. Vérifiez votre barème.");
    return null;
  }

  // --- NOUVEAU : Nettoyage du badge (TT) pour le nom du fichier ---
  const cleanName = removeTiersTempsBadge(student.name || 'eleve');
  const safeName = cleanName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Correction_${safeName}.pdf`;
  // ----------------------------------------------------------------
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  if (isDownload) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 50);
    return { blob, name: fileName };
    } else {
    return { blob, name: fileName };
    }
}