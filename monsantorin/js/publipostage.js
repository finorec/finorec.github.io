// --- FICHIER : js/publipostage.js ---
// Rôle : Orchestration de la communication des notes (modale, scripts Python, mots de passe, ZIP chiffré).

import { state, saveCurrentState } from './state.js';
import { COMM_MODES } from './constants.js';
import { computeScore, isTiersTemps, isAbsent, normalizeName, removeTiersTempsBadge, removeAbsentBadge, deriveStudentPassword, derivePasswordsForStudents, calculateMaxScore } from './engine.js';
import { buildSmtpPythonScript, buildCloudPythonScript, buildCloudPasswordPythonScript } from './python-generator.js';
import { escapeHTML } from './addons.js';
import { generatePdfForStudent } from './pdf.js';
import { encryptPdfBytes } from './pdf-encrypt.js';
import { prepareStudentsForZipExport } from './io.js';

export { processEntImport, renderMatchingTable } from './ent-matching.js';

/**
 * Ouvre la modale de communication des notes et charge les paramètres enregistrés.
 */
export function openPublipostageModal() {
    const modalEl = document.getElementById('publipostageModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    const tbody = document.getElementById('matchingTableBody');
    if (state.entStudents && state.entStudents.length > 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-success fw-bold">Base ENT chargée en mémoire (${state.entStudents.length} élèves, ${state.entParents.length} parents). Cliquez sur "Lancer le rapprochement".</td></tr>`;
    } else {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Veuillez importer le fichier CSV de l\'ENT pour lancer le rapprochement.</td></tr>';
    }

    document.getElementById('smtpSubject').value = state.smtpSubject || "Correction de votre devoir";
    document.getElementById('smtpBody').value = state.smtpBody !== null ? state.smtpBody : "Bonjour,\n\nVeuillez trouver ci-joint le bilan et la correction détaillée de la copie.\n\nCordialement.";

    const commMode = state.commMode;
    COMM_MODES.forEach(({ id }) => {
        const panel = document.getElementById(`tab-${id}`);
        if (panel) panel.classList.toggle('d-none', id !== commMode);
    });

    const modeMeta = COMM_MODES.find(m => m.id === commMode);
    const titleLogo = document.getElementById('comm-mode-logo');
    if (titleLogo) {
        if (modeMeta?.logo) {
            titleLogo.src = modeMeta.logo;
            titleLogo.alt = modeMeta.logoAlt || '';
            titleLogo.classList.remove('d-none');
        } else {
            titleLogo.src = '';
            titleLogo.classList.add('d-none');
        }
    }
    const titleLabel = document.getElementById('comm-mode-label');
    if (titleLabel) titleLabel.textContent = modeMeta?.panelLabel ?? '';

    const pwdContainerId = commMode === 'encrypted-manual'
        ? 'encryptedPasswordTableContainer'
        : 'passwordMappingTableContainer';
    const pwdContainer = document.getElementById(pwdContainerId);
    if (pwdContainer) {
        pwdContainer.innerHTML = '<p class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Chargement…</p>';
    }

    const onShown = () => {
        modalEl.removeEventListener('shown.bs.modal', onShown);
        if (commMode === 'cloud-password') {
            renderPasswordTable('passwordMappingTableContainer', 'passwordImportStatus');
        } else if (commMode === 'encrypted-manual') {
            renderPasswordTable('encryptedPasswordTableContainer', 'encryptedPasswordStatus');
        }
    };
    modalEl.addEventListener('shown.bs.modal', onShown);

    modal.show();
}

export function generatePublipostageScript() {
    const smtpHost    = state.smtpHost;
    const smtpPort    = state.smtpPort || '465';
    const smtpUser    = state.smtpUser;
    const smtpSubject = document.getElementById('smtpSubject').value.trim();
    const smtpBody    = document.getElementById('smtpBody').value;

    if (!smtpHost || !smtpUser) {
        alert("Veuillez d'abord renseigner le serveur SMTP et votre adresse e-mail dans ⚙️ Paramètres.");
        return;
    }
    if (!smtpSubject || !smtpBody) {
        alert("Veuillez renseigner le sujet et le corps de l'e-mail.");
        return;
    }

    state.smtpSubject = smtpSubject;
    state.smtpBody = smtpBody;

    saveCurrentState();

    const emailMapping = {};
    let count = 0;

    state.students.forEach((student, idx) => {
        if (!student.name || student.name.trim() === "") return;
        if (isAbsent(student.name)) return;

        const isTT = isTiersTemps(student.name);
        if (!computeScore(student.scores || {}, state.baremeConfig, isTT).isComplete) return;

        const cleanName = removeTiersTempsBadge(student.name);

        const previewCell = document.getElementById(`global-preview-${idx}`);
        const dests = previewCell ? previewCell.innerText.trim() : "";

        if (dests && dests !== "À définir") {
            const filename = `Correction_${cleanName.replace(/[^a-z0-9]/gi, '_')}.pdf`;
            emailMapping[filename] = dests;
            count++;
        }
    });

    if (count === 0) {
        alert("Aucun destinataire valide n'a pu être extrait.");
        return;
    }

    const pythonScript = buildSmtpPythonScript(smtpHost, smtpPort, smtpUser, emailMapping, smtpSubject, smtpBody);
    const pyBlob = new Blob([pythonScript], {type: "text/x-python;charset=utf-8"});
    saveAs(pyBlob, "envoi_mails.py");
}

export function copyGradesToClipboard() {
    const maxGlobal = calculateMaxScore(state.baremeConfig);

    const grades = state.students
        .filter(s => s.name && s.name.trim() !== "")
        .map(s => {
            const res = computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name));

            if (!res.isComplete) {
                return "";
            }

            let finalValue = res.total;
            if (state.globalScaleTo20 && maxGlobal > 0) {
                finalValue = (res.total / maxGlobal) * 20;
            }

            finalValue = Math.ceil(finalValue * 2) / 2;

            return finalValue.toString().replace('.', ',');
        })
        .join('\n');

    if (navigator.clipboard) {
        navigator.clipboard.writeText(grades).then(() => {
            alert("Notes copiées dans le presse-papier !\nVous pouvez maintenant les coller dans la première case de votre colonne (version Client de Pronote).");
        }).catch(err => {
            console.error("Erreur lors de la copie :", err);
            alert("Erreur lors de la copie. Vérifiez que vous êtes bien sur une page sécurisée (HTTPS).");
        });
    } else {
        alert("Erreur : La fonction de copie requiert un environnement sécurisé (HTTPS).");
    }
}

export function generateCloudUploadScript() {
    const webdavUrl  = state.webdavUrl;
    const webdavUser = state.webdavUser;
    const devoirTitre = document.getElementById('mainTitle').innerText.trim();

    if (!webdavUrl || !webdavUser) {
        alert("Veuillez d'abord renseigner l'URL et l'identifiant WebDAV dans ⚙️ Paramètres.");
        return;
    }

    saveCurrentState();

    let studentMapping = {};
    let count = 0;

    state.students.forEach((student) => {
        if (!student.name || student.name.trim() === "") return;
        if (isAbsent(student.name)) return;

        const isTT = isTiersTemps(student.name);
        if (!computeScore(student.scores || {}, state.baremeConfig, isTT).isComplete) return;

        const cleanName = removeTiersTempsBadge(student.name);
        const filename = `Correction_${cleanName.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        studentMapping[filename] = cleanName;
        count++;
    });

    if (count === 0) {
        alert("Aucun élève valide trouvé dans votre liste de copies pour générer le script.");
        return;
    }

    const config = { webdavUrl, webdavUser, devoirTitre };
    const pythonScript = buildCloudPythonScript(config, studentMapping);

    const pyBlob = new Blob([pythonScript], { type: "text/x-python;charset=utf-8" });
    saveAs(pyBlob, "depot_nuage.py");
}

/**
 * Affiche le tableau des mots de passe PDF calculés pour la classe actuelle.
 */
export async function renderPasswordTable(
    containerId = 'passwordMappingTableContainer',
    statusId = 'passwordImportStatus'
) {
    const container = document.getElementById(containerId);
    const statusDiv = document.getElementById(statusId);
    if (!container) return;

    const establishmentKey = state.establishmentKey.trim();
    if (!establishmentKey) {
        container.innerHTML = '<p class="text-warning small mb-0">⚠️ Renseignez la <strong>clé secrète de l\'établissement</strong> dans <strong>⚙️ Paramètres</strong> pour afficher les mots de passe.</p>';
        if (statusDiv) statusDiv.innerHTML = '';
        return;
    }

    if (!globalThis.crypto?.subtle) {
        container.innerHTML = '<p class="text-danger small mb-0">❌ La génération des mots de passe nécessite une connexion sécurisée (HTTPS).</p>';
        if (statusDiv) statusDiv.innerHTML = '';
        return;
    }

    const normCounts = {};
    state.students.forEach(s => {
        if (!s.name?.trim()) return;
        const norm = normalizeName(removeAbsentBadge(removeTiersTempsBadge(s.name)));
        if (norm) normCounts[norm] = (normCounts[norm] || 0) + 1;
    });

    let html = `
        <table class="table table-sm table-bordered table-hover mb-0" style="font-size: 0.85em; background: white;">
            <thead class="table-light sticky-top">
                <tr>
                    <th>Élève (Copie)</th>
                    <th>Mot de passe PDF</th>
                    <th>Statut</th>
                </tr>
            </thead>
            <tbody>
    `;

    let totalClassStudents = 0;

    for (let originalIndex = 0; originalIndex < state.students.length; originalIndex++) {
        const student = state.students[originalIndex];
        if (!student.name || student.name.trim() === "") continue;
        totalClassStudents++;

        const cleanName = removeAbsentBadge(removeTiersTempsBadge(student.name));
        const pwd = await deriveStudentPassword(establishmentKey, cleanName);
        const isHomonym = normCounts[normalizeName(cleanName)] > 1;

        if (pwd) {
            html += `
                <tr class="${isHomonym ? 'table-warning' : 'table-success'}">
                    <td class="align-middle fw-bold px-2">${escapeHTML(student.name)}</td>
                    <td class="align-middle"><code>${escapeHTML(pwd)}</code></td>
                    <td class="align-middle">
                        ${isHomonym
                            ? '<span class="badge bg-warning text-dark">⚠️ Homonyme possible</span>'
                            : '<span class="badge bg-success">✅ Généré</span>'}
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr class="table-danger">
                    <td class="align-middle fw-bold px-2">${escapeHTML(student.name)}</td>
                    <td class="align-middle text-muted fst-italic">—</td>
                    <td class="align-middle"><span class="badge bg-danger">❌ Nom invalide</span></td>
                </tr>
            `;
        }
    }

    html += `</tbody></table>`;
    container.innerHTML = html;

    if (statusDiv) {
        if (totalClassStudents === 0) {
            statusDiv.innerHTML = '⚠️ Aucun élève dans la classe.';
        } else {
            statusDiv.innerHTML = `✅ ${totalClassStudents} mot(s) de passe calculé(s) à partir de la clé établissement.`;
        }
    }
}

/**
 * Génère et télécharge un CSV avec la liste des élèves et leurs mots de passe PDF.
 */
export async function downloadPasswordCsv() {
    const establishmentKey = state.establishmentKey.trim();
    if (!establishmentKey) {
        alert('Veuillez d\'abord renseigner la clé secrète de l\'établissement dans ⚙️ Paramètres.');
        return;
    }

    const rows = [['Élève', 'Mot de passe']];
    const entries = await derivePasswordsForStudents(establishmentKey, state.students, { skipAbsent: true });
    for (const { cleanName, password } of entries) {
        rows.push([cleanName, password]);
    }

    if (rows.length === 1) {
        alert('Aucun élève à exporter.');
        return;
    }

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mots_de_passe_eleves.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Génère et télécharge un ZIP de PDF chiffrés (@cantoo/pdf-lib) avec mot de passe par élève.
 */
export async function downloadEncryptedClassZip() {
    const btn = document.getElementById('btn-download-encrypted-zip');
    if (!btn) return;

    const establishmentKey = state.establishmentKey.trim();
    if (!establishmentKey) {
        alert('Veuillez d\'abord renseigner la clé secrète de l\'établissement dans ⚙️ Paramètres.');
        return;
    }
    if (!globalThis.crypto?.subtle) {
        alert('Le chiffrement des PDF nécessite un contexte sécurisé (HTTPS ou localhost).');
        return;
    }

    saveCurrentState();

    const prepared = await prepareStudentsForZipExport({ confirmTitle: 'Export PDF chiffrés', confirmBtnClass: 'btn-primary' });
    if (!prepared.ok) {
        if (prepared.reason === 'no_students') alert('Aucun élève à exporter.');
        else if (prepared.reason === 'no_complete') alert('Il n\'y a aucune copie complète à exporter.');
        return;
    }
    const validStudents = prepared.students;

    const originalText = btn.innerText;
    btn.disabled = true;

    const zip = new JSZip();
    const failedStudents = [];
    let firstError = null;

    for (let i = 0; i < validStudents.length; i++) {
        const s = validStudents[i];
        btn.innerText = `⏳ PDF ${i + 1}/${validStudents.length}…`;
        await new Promise(resolve => setTimeout(resolve, 10));

        const cleanName = removeAbsentBadge(removeTiersTempsBadge(s.name));
        const pwd = await deriveStudentPassword(establishmentKey, cleanName);
        if (!pwd) {
            failedStudents.push(s.name);
            continue;
        }

        try {
            const pdfData = await generatePdfForStudent(s, false);
            if (!pdfData?.blob) {
                failedStudents.push(s.name);
                continue;
            }
            const plainBytes = new Uint8Array(await pdfData.blob.arrayBuffer());
            const encryptedBytes = await encryptPdfBytes(plainBytes, pwd);
            const finalName = 'Correction_' + removeTiersTempsBadge(s.name).replace(/[^a-z0-9]/gi, '_') + '.pdf';
            zip.file(finalName, encryptedBytes);
        } catch (e) {
            console.error('Erreur chiffrement PDF : ' + s.name, e);
            if (!firstError) firstError = e;
            failedStudents.push(s.name);
        }
    }

    if (Object.keys(zip.files).length === 0) {
        const detail = firstError?.message ? `\n\nDétail : ${firstError.message}` : '';
        alert(`Aucun PDF chiffré n'a pu être généré.${detail}\n\nOuvrez la console du navigateur (F12) pour plus d'informations.`);
        btn.innerText = originalText;
        btn.disabled = false;
        return;
    }

    btn.innerText = '📦 Compression…';
    const content = await zip.generateAsync({ type: 'blob' });
    const titre = document.getElementById('mainTitle')?.innerText.trim().replace(/[^a-z0-9]/gi, '_') || 'evaluation';
    saveAs(content, 'Corrections_chiffrees_' + titre + '.zip');

    if (failedStudents.length > 0) {
        alert(`⚠️ Attention : ${failedStudents.length} PDF n'ont pas pu être générés ou chiffrés :\n\n${failedStudents.join('\n')}`);
    }

    btn.innerText = '✅ Terminé !';
    setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
    }, 3000);
}

/**
 * Prépare et télécharge le script Python Cloud avec mots de passe individuels.
 */
export async function generateCloudPasswordScript() {
    const webdavUrl  = state.webdavUrl;
    const webdavUser = state.webdavUser;
    const establishmentKey = state.establishmentKey.trim();
    const devoirTitre = document.getElementById('mainTitle').innerText.trim();

    if (!webdavUrl || !webdavUser) {
        alert("Veuillez d'abord renseigner l'URL et l'identifiant WebDAV dans ⚙️ Paramètres.");
        return;
    }
    if (!establishmentKey) {
        alert("Veuillez d'abord renseigner la clé secrète de l'établissement dans ⚙️ Paramètres.");
        return;
    }
    if (!globalThis.crypto?.subtle) {
        alert('La génération des mots de passe nécessite une connexion sécurisée (HTTPS).');
        return;
    }

    const entries = await derivePasswordsForStudents(establishmentKey, state.students, {
        skipAbsent: true,
        skipIncomplete: true,
        baremeConfig: state.baremeConfig
    });
    const finalPasswordMapping = Object.fromEntries(entries.map(({ cleanName, password }) => [cleanName, password]));

    if (entries.length === 0) {
        alert("Erreur : aucune copie complète trouvée pour générer les mots de passe.\nVérifiez que la classe est renseignée et que les copies sont entièrement notées.");
        return;
    }

    saveCurrentState();

    const config = { webdavUrl, webdavUser, devoirTitre };

    try {
        const pythonScript = buildCloudPasswordPythonScript(config, finalPasswordMapping);
        const pyBlob = new Blob([pythonScript], { type: "text/x-python;charset=utf-8" });
        saveAs(pyBlob, "depot_nuage_securise.py");
    } catch (e) {
        console.error("Erreur lors de la génération du script Python :", e);
        alert("Une erreur est survenue lors de la création du script.");
    }
}
