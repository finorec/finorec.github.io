// --- FICHIER : js/engine.js ---
import { TT_FACTOR, STUDENT_PASSWORD_LENGTH } from './constants.js';

// Exclut les caractères ambigus : 0, 1, l, I, O
const PWD_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const PWD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PWD_DIGIT = '23456789';
const PWD_CHARSET = PWD_LOWER + PWD_UPPER + PWD_DIGIT;

/** Renvoie true si le nom de l'élève contient le badge Tiers-Temps "(TT)". */
export function isTiersTemps(name) {
    return typeof name === 'string' && name.toUpperCase().includes('(TT)');
}

/** Renvoie true si le nom de l'élève contient le badge Absent "(ABS)". */
export function isAbsent(name) {
    return typeof name === 'string' && name.toUpperCase().includes('(ABS)');
}

/** Supprime le badge "(ABS)" où qu'il se trouve dans le nom. */
export function removeAbsentBadge(name) {
    if (!name) return "";
    return name.replace(/\s*\(ABS\)\s*/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Itère sur toutes les questions d'un barème, quelle que soit sa structure (avec ou sans parties).
 * @param {Array} baremeConfig
 * @param {Function} callback - (question, questionId, exoIdx, partIdx|null, qIdx)
 */
export function forEachQuestion(baremeConfig, callback) {
    baremeConfig.forEach((exo, eIdx) => {
        if (exo.parts) {
            exo.parts.forEach((part, pIdx) => {
                part.questions.forEach((q, qIdx) => {
                    callback(q, `e${eIdx}-p${pIdx}-q${qIdx}`, eIdx, pIdx, qIdx);
                });
            });
        } else if (exo.questions) {
            exo.questions.forEach((q, qIdx) => {
                callback(q, `e${eIdx}-q${qIdx}`, eIdx, null, qIdx);
            });
        }
    });
}

export function calculateMaxScore(baremeConfig) {
    let total = 0;
    forEachQuestion(baremeConfig, (q) => { total += q.max; }); 
    return total;
}

/**
 * Calcule tous les totaux d'une copie (par exercice, par partie et global).
 * Applique le coefficient Tiers-Temps si nécessaire.
 * @param {Object}  studentScores - Map { questionId: valeur|"" }
 * @param {Array}   baremeConfig
 * @param {boolean} isTT - L'élève bénéficie-t-il du Tiers-Temps ?
 * @returns {{ isComplete, total, maxPossible, exoTotals, partTotals, hasMissing, missingQuestions }}
 */
export function computeScore(studentScores, baremeConfig, isTT) {
    let globalTotalRaw = 0;
    let globalMax = 0;
    let allQuestionsGraded = true;
    let exoTotals = {};  
    let partTotals = {}; 
    let hasMissing = { exo: {}, part: {} };
    let missingQuestions = [];

    baremeConfig.forEach((exo, eIdx) => {
        exoTotals[eIdx] = { total: 0, max: 0 };
        hasMissing.exo[eIdx] = false;
        if (exo.parts) {
            exo.parts.forEach((part, pIdx) => {
                partTotals[`${eIdx}-${pIdx}`] = { total: 0, max: 0 };
                hasMissing.part[`${eIdx}-${pIdx}`] = false;
            });
        }
    });

    forEachQuestion(baremeConfig, (q, qId, eIdx, pIdx) => {
        globalMax += q.max;
        exoTotals[eIdx].max += q.max;
        if (pIdx !== null) partTotals[`${eIdx}-${pIdx}`].max += q.max;

        const val = studentScores[qId];
        if (val === "" || val === undefined || val === null) {
            allQuestionsGraded = false;
            hasMissing.exo[eIdx] = true;
            if (pIdx !== null) hasMissing.part[`${eIdx}-${pIdx}`] = true;
            missingQuestions.push(qId);
        } else {
            const score = parseFloat(val);
            if (pIdx !== null) partTotals[`${eIdx}-${pIdx}`].total += score;
            else exoTotals[eIdx].total += score;
        }
    });

    baremeConfig.forEach((exo, eIdx) => {
        if (exo.parts) {
            let sumParts = 0;
            exo.parts.forEach((part, pIdx) => {
                sumParts += partTotals[`${eIdx}-${pIdx}`].total;
            });
            exoTotals[eIdx].total = sumParts;
        }
        globalTotalRaw += exoTotals[eIdx].total;
    });

    return {
        isComplete: allQuestionsGraded,
        total: isTT ? Math.min(globalMax, globalTotalRaw * TT_FACTOR) : globalTotalRaw,
        maxPossible: globalMax,
        exoTotals,
        partTotals,
        hasMissing,
        missingQuestions
    };
}

/**
 * Normalise les chaînes pour purger les accents, majuscules et espaces.
 */
export function normalizeName(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

async function hmacSha256(keyBytes, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return new Uint8Array(sig);
}

/** Index sans biais modulo (16 bits HMAC par tentative, rejet si hors plage). */
function nextUnbiasedIndex(bytes, byteState, mod) {
    const threshold = Math.floor(65536 / mod) * mod;
    while (byteState.offset + 1 < bytes.length) {
        const val = (bytes[byteState.offset] << 8) | bytes[byteState.offset + 1];
        byteState.offset += 2;
        if (val < threshold) return val % mod;
    }
    return null;
}

async function drawIndex(keyBytes, payload, byteState, mod) {
    let idx = nextUnbiasedIndex(byteState.bytes, byteState, mod);
    while (idx === null) {
        byteState.round++;
        if (byteState.round > 32) throw new Error('Échec de la dérivation du mot de passe.');
        byteState.bytes = await hmacSha256(keyBytes, `${payload}\0${byteState.round}`);
        byteState.offset = 0;
        idx = nextUnbiasedIndex(byteState.bytes, byteState, mod);
    }
    return idx;
}

/**
 * Dérive un mot de passe PDF (14 car. alphanum. + HMAC-SHA256) à partir de la clé établissement
 * et du nom d'élève (normalisé). Même clé + même nom → même mot de passe pour tous les profs.
 */
export async function deriveStudentPassword(establishmentKey, studentName) {
    if (!establishmentKey?.trim() || !studentName?.trim()) return null;
    if (!globalThis.crypto?.subtle) return null;

    const payload = normalizeName(studentName);
    if (!payload) return null;

    try {
        const keyBytes = new TextEncoder().encode(establishmentKey.trim());
        const byteState = {
            bytes: await hmacSha256(keyBytes, payload),
            offset: 0,
            round: 0
        };
        const len = STUDENT_PASSWORD_LENGTH;
        const chars = [];
        chars.push(PWD_LOWER[await drawIndex(keyBytes, payload, byteState, PWD_LOWER.length)]);
        chars.push(PWD_UPPER[await drawIndex(keyBytes, payload, byteState, PWD_UPPER.length)]);
        chars.push(PWD_DIGIT[await drawIndex(keyBytes, payload, byteState, PWD_DIGIT.length)]);
        for (let i = 3; i < len; i++) {
            chars.push(PWD_CHARSET[await drawIndex(keyBytes, payload, byteState, PWD_CHARSET.length)]);
        }
        for (let i = len - 1; i > 0; i--) {
            const j = await drawIndex(keyBytes, payload, byteState, i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        return chars.join('');
    } catch {
        return null;
    }
}

/**
 * Dérive les mots de passe PDF pour une liste d'élèves (clé établissement + nom normalisé).
 * @returns {Promise<Array<{ student, cleanName, password }>>}
 */
export async function derivePasswordsForStudents(establishmentKey, students, options = {}) {
    const { skipAbsent = false, skipIncomplete = false, baremeConfig = null } = options;
    if (!establishmentKey?.trim() || !globalThis.crypto?.subtle) return [];

    const results = [];
    for (const student of students) {
        if (!student.name?.trim()) continue;
        if (skipAbsent && isAbsent(student.name)) continue;
        if (skipIncomplete && baremeConfig) {
            const isTT = isTiersTemps(student.name);
            if (!computeScore(student.scores || {}, baremeConfig, isTT).isComplete) continue;
        }
        const cleanName = removeAbsentBadge(removeTiersTempsBadge(student.name));
        const password = await deriveStudentPassword(establishmentKey, cleanName);
        if (!password) continue;
        results.push({ student, cleanName, password });
    }
    return results;
}

/**
 * Calcule la distance de Damerau-Levenshtein entre deux chaînes.
 * (Compte les insertions, suppressions, substitutions ET transpositions).
 */
export function damerauLevenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const d = [];
    for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
    }
    for (let j = 1; j <= b.length; j++) {
        d[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            let cost = (a[i - 1] === b[j - 1]) ? 0 : 1;

            d[i][j] = Math.min(
                d[i - 1][j] + 1,       // Suppression
                d[i][j - 1] + 1,       // Insertion
                d[i - 1][j - 1] + cost // Substitution
            );

            // Transposition
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
            }
        }
    }
    return d[a.length][b.length];
}

export function removeTiersTempsBadge(name) {
    if (!name) return "";
    return name.replace(/\s*\(TT\)\s*/gi, " ").replace(/\s+/g, " ").trim();
}