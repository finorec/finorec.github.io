// --- FICHIER : js/ent-matching.js ---
// Rôle : Import CSV ENT et rapprochement élèves / responsables (monlycee.net).

import { state } from './state.js';
import { isAbsent, damerauLevenshtein, normalizeName, removeTiersTempsBadge } from './engine.js';
import { escapeHTML } from './addons.js';

/**
 * Importation du CSV ENT (format Pronote web : UTF-8 BOM, séparateur point-virgule).
 * Colonnes requises : Nom, Prénom, Identifiant, Type. Colonne optionnelle : Parents.
 */
export function processEntImport(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const rows = e.target.result.replace(/^\uFEFF/, '').split(/\r\n|\n/).filter(r => r.trim() !== "");

        if (rows.length < 2) {
            alert("Erreur : Le fichier est vide ou ne contient qu'une seule ligne.");
            return;
        }

        const headers = rows[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());
        const idxNom = headers.indexOf("Nom");
        const idxPrenom = headers.indexOf("Prénom");
        const idxId = headers.indexOf("Identifiant");
        const idxType = headers.indexOf("Type");
        const idxParents = headers.indexOf("Parents");

        if (idxNom === -1 || idxPrenom === -1 || idxId === -1 || idxType === -1) {
            const detected = headers.slice(0, 8).join(', ') || '(aucune colonne détectée)';
            alert(
                `Erreur : Colonnes obligatoires introuvables dans ce fichier.\n\n` +
                `Colonnes requises : Nom, Prénom, Identifiant, Type\n` +
                `Colonnes détectées : ${detected}\n\n` +
                `Vérifiez que vous importez bien le bon fichier CSV (export annuaire/trombinoscope de l'ENT).`
            );
            return;
        }

        const entStudents = [];
        const entParents = [];

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].split(';').map(c => c.replace(/^"|"$/g, '').trim());
            if (cells.length <= Math.max(idxNom, idxPrenom, idxId, idxType)) continue;
            const typeValue = cells[idxType];
            const item = {
                nom: cells[idxNom],
                prenom: cells[idxPrenom],
                fullName: `${cells[idxNom]} ${cells[idxPrenom]}`,
                normName: normalizeName(`${cells[idxNom]}${cells[idxPrenom]}`),
                normInverted: normalizeName(`${cells[idxPrenom]}${cells[idxNom]}`),
                email: `${cells[idxId]}@monlycee.net`,
                parentsRaw: idxParents !== -1 ? cells[idxParents] : ""
            };
            if (typeValue === "Élève") entStudents.push(item);
            else if (typeValue === "Parent") entParents.push(item);
        }

        state.entStudents = entStudents;
        state.entParents = entParents;

        document.getElementById('matchingTableBody').innerHTML = `
            <tr>
                <td colspan="3" class="text-center text-success fw-bold">
                    🚀 Base ENT synchronisée avec succès !<br>
                    Élèves détectés : ${state.entStudents.length} | Responsables détectés : ${state.entParents.length}<br>
                    Cliquez sur "Lancer le rapprochement" pour générer le tableau.
                </td>
            </tr>`;
    };
    reader.readAsText(file, 'UTF-8');
}

function getCandidates(searchName, list) {
    const normSearch = normalizeName(searchName);
    const candidates = [];
    let foundPerfectMatches = false;

    list.forEach(person => {
        if (person.normName === normSearch || person.normInverted === normSearch) {
            candidates.push({ person, score: 100 });
            foundPerfectMatches = true;
            return;
        }

        if (foundPerfectMatches) return;

        const distNormal = damerauLevenshtein(normSearch, person.normName);
        const distInverted = damerauLevenshtein(normSearch, person.normInverted);
        const minDist = Math.min(distNormal, distInverted);

        if (minDist === 1) {
            candidates.push({ person, score: 90 });
        } else if (minDist === 2) {
            candidates.push({ person, score: 80 });
        } else if (person.normName.includes(normSearch) || normSearch.includes(person.normName)) {
            candidates.push({ person, score: 75 });
        } else {
            const normNom = normalizeName(person.nom);
            if (normNom.length > 2 && normSearch.includes(normNom)) {
                candidates.push({ person, score: 40 });
            }
        }
    });

    return candidates.sort((a, b) => b.score - a.score);
}

function generateParentUI(entStudent, studentIndex) {
    const showParents = document.getElementById('chk-add-parents')?.checked || false;
    if (!showParents || !entStudent.parentsRaw) return "";

    const parentsList = entStudent.parentsRaw.split(',').map(p => p.trim()).filter(p => p !== "");
    if (parentsList.length === 0) return "";

    let html = `<div class="mt-2 p-2 bg-white rounded border small text-dark">`;
    html += `<div class="text-muted fw-bold mb-1">👨‍👩‍👦 Représentants à associer :</div>`;

    parentsList.forEach((parentName) => {
        const normSearch = normalizeName(parentName);

        const pMatch = state.entParents.find(p =>
            p.normName === normSearch ||
            p.normInverted === normSearch ||
            p.normName.includes(normSearch) ||
            normSearch.includes(p.normName)
        );

        html += `<div class="d-flex flex-wrap align-items-center gap-1 mb-1 border-bottom pb-1">`;
        html += `<span class="fw-semibold text-secondary me-2">${escapeHTML(parentName)} :</span>`;

        if (pMatch) {
            html += `<span class="badge bg-success">✅ ${escapeHTML(pMatch.email)}</span>`;
            html += `<input type="hidden" class="parent-resolved-email" data-student-index="${studentIndex}" value="${escapeHTML(pMatch.email)}">`;
        } else {
            html += `<span class="badge bg-danger">❌ Absent de la base Parent</span>`;
        }
        html += `</div>`;
    });
    html += `</div>`;
    return html;
}

export function renderMatchingTable(forceReset = false) {
    const tbody = document.getElementById('matchingTableBody');
    if (!tbody) return;

    const savedSelections = {};
    const savedManuals = {};

    if (!forceReset) {
        tbody.querySelectorAll('.student-select-matcher').forEach(select => {
            const idx = select.getAttribute('data-student-index');
            if (select.value) savedSelections[idx] = select.value;
        });
        tbody.querySelectorAll('.student-manual-input').forEach(input => {
            const idx = input.getAttribute('data-student-index');
            if (input.value.trim() !== "") savedManuals[idx] = input.value.trim();
        });
    }

    tbody.innerHTML = '';

    if (!state.entStudents || state.entStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Aucune base ENT en mémoire. Veuillez importer un fichier CSV.</td></tr>';
        return;
    }

    state.students.forEach((student, originalIndex) => {
        if (!student.name || student.name.trim() === "" || isAbsent(student.name)) return;

        const cleanName = removeTiersTempsBadge(student.name);
        const studentCandidates = getCandidates(cleanName, state.entStudents);

        let studentCellHtml = "";
        let rowClass = "table-danger";
        let finalEmails = [];

        const previouslySelectedEmail = savedSelections[originalIndex];
        const previouslyEnteredManual = savedManuals[originalIndex];

        if (studentCandidates.length > 0 && studentCandidates[0].score === 100) {
            const perfectMatches = studentCandidates.filter(c => c.score === 100);

            if (perfectMatches.length > 1) {
                rowClass = "table-warning border-danger";
                const currentSelection = previouslySelectedEmail || "";

                studentCellHtml = `
                    <div class="mb-1"><span class="badge bg-danger text-white"><i class="bi bi-exclamation-triangle-fill"></i> HOMONYMES DÉTECTÉS</span></div>
                    <div class="small text-muted mb-1">Veuillez sélectionner le bon élève pour <strong>${escapeHTML(student.name)}</strong> ${student.className ? '(Classe copie: ' + escapeHTML(student.className) + ')' : ''} :</div>
                    <select class="form-select form-select-sm border-danger student-select-matcher fw-bold text-danger" data-student-index="${originalIndex}">
                        <option value="">-- DÉPARTAGEZ LES HOMONYMES --</option>
                        ${perfectMatches.map(c => {
                            const isSelected = c.person.email === currentSelection ? 'selected' : '';
                            let details = [];
                            if (c.person.className) details.push(c.person.className);
                            if (c.person.birthDate) details.push(c.person.birthDate);
                            const detailStr = details.length > 0 ? ` [${details.join(' - ')}]` : '';
                            return `<option value="${escapeHTML(c.person.email)}" ${isSelected}>${escapeHTML(c.person.fullName)} (${escapeHTML(c.person.email)})${escapeHTML(detailStr)}</option>`;
                        }).join('')}
                    </select>
                    <div id="parent-container-${originalIndex}">
                `;

                if (currentSelection) {
                    const entStudent = state.entStudents.find(s => s.email === currentSelection);
                    if (entStudent) {
                        studentCellHtml += generateParentUI(entStudent, originalIndex);
                    }
                }
                studentCellHtml += `</div>`;

            } else {
                rowClass = "table-success";
                const perfectMatch = perfectMatches[0].person;
                finalEmails.push(perfectMatch.email);

                studentCellHtml = `
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-success">✅ ${escapeHTML(perfectMatch.email)}</span>
                        <input type="hidden" class="student-resolved-email" data-student-index="${originalIndex}" value="${escapeHTML(perfectMatch.email)}">
                    </div>
                `;
                studentCellHtml += generateParentUI(perfectMatch, originalIndex);
            }

        } else if (studentCandidates.length > 0) {
            rowClass = "table-warning";
            const currentSelection = previouslySelectedEmail || "";

            studentCellHtml = `
                <div class="mb-1"><span class="badge bg-warning text-dark">⚠️ Rapprochement incertain</span></div>
                <select class="form-select form-select-sm student-select-matcher" data-student-index="${originalIndex}">
                    <option value="">-- Sélectionner l'élève de la shortlist --</option>
                    ${studentCandidates.map(c => {
                        const isSelected = c.person.email === currentSelection ? 'selected' : '';
                        return `<option value="${escapeHTML(c.person.email)}" ${isSelected}>[Confiance ${c.score}%] ${escapeHTML(c.person.fullName)} (${escapeHTML(c.person.email)})</option>`;
                    }).join('')}
                </select>
                <div id="parent-container-${originalIndex}">
            `;

            if (currentSelection) {
                const entStudent = state.entStudents.find(s => s.email === currentSelection);
                if (entStudent) {
                    studentCellHtml += generateParentUI(entStudent, originalIndex);
                }
            }
            studentCellHtml += `</div>`;

        } else {
            const currentManual = previouslyEnteredManual || "";
            studentCellHtml = `
                <div class="mb-1"><span class="badge bg-danger">❌ Aucune correspondance automatique</span></div>
                <input type="text" class="form-control form-control-sm student-manual-input" data-student-index="${originalIndex}" value="${escapeHTML(currentManual)}" placeholder="Saisir l'adresse email manuellement">
            `;
        }

        const previewText = finalEmails.length > 0 ? finalEmails.join(', ') : "À définir";

        tbody.innerHTML += `
            <tr class="${rowClass}" id="matching-row-${originalIndex}">
                <td class="align-middle fw-bold px-3" style="width: 25%;">${escapeHTML(student.name)}</td>
                <td class="align-middle py-2" style="width: 45%;">${studentCellHtml}</td>
                <td class="align-middle fw-bold text-primary px-3 global-mail-preview" id="global-preview-${originalIndex}" style="width: 30%; font-size: 0.85em;">
                    ${escapeHTML(previewText)}
                </td>
            </tr>
        `;
    });

    const handleStudentSelectChange = (e) => {
        const selectEl = e.target;
        const idx = selectEl.getAttribute('data-student-index');
        const parentContainer = document.getElementById(`parent-container-${idx}`);

        if (parentContainer) {
            if (selectEl.value) {
                const selectedEmail = selectEl.value;
                const entStudent = state.entStudents.find(s => s.email === selectedEmail);
                if (entStudent) {
                    parentContainer.innerHTML = generateParentUI(entStudent, idx);
                    parentContainer.querySelectorAll('.parent-select-matcher').forEach(sel => {
                        sel.addEventListener('change', () => recomputeAllPreviews());
                    });
                } else {
                    parentContainer.innerHTML = "";
                }
            } else {
                parentContainer.innerHTML = "";
            }
        }
        recomputeAllPreviews();
    };

    document.querySelectorAll('.student-select-matcher').forEach(select => select.addEventListener('change', handleStudentSelectChange));
    document.querySelectorAll('.parent-select-matcher').forEach(select => select.addEventListener('change', () => recomputeAllPreviews()));
    document.querySelectorAll('.student-manual-input').forEach(input => input.addEventListener('input', () => recomputeAllPreviews()));

    recomputeAllPreviews();
}

function recomputeAllPreviews() {
    state.students.forEach((student, idx) => {
        if (!student.name || student.name.trim() === "") return;
        if (isAbsent(student.name)) return;
        const emails = [];

        const perfectInput = document.querySelector(`.student-resolved-email[data-student-index="${idx}"]`);
        if (perfectInput) {
            emails.push(perfectInput.value);
        } else {
            const selectEl = document.querySelector(`.student-select-matcher[data-student-index="${idx}"]`);
            if (selectEl && selectEl.value) {
                emails.push(selectEl.value);
            } else {
                const manualInput = document.querySelector(`.student-manual-input[data-student-index="${idx}"]`);
                if (manualInput && manualInput.value.trim() !== "") {
                    let val = manualInput.value.trim();
                    if (!val.includes('@')) val += '@monlycee.net';
                    emails.push(val);
                }
            }
        }

        document.querySelectorAll(`.parent-resolved-email[data-student-index="${idx}"]`).forEach(inp => emails.push(inp.value));
        document.querySelectorAll(`.parent-select-matcher[data-student-index="${idx}"]`).forEach(sel => {
            if (sel.value) emails.push(sel.value);
        });

        const previewCell = document.getElementById(`global-preview-${idx}`);
        if (previewCell) {
            previewCell.innerText = emails.length > 0 ? emails.join(', ') : "À définir";
        }

        const row = document.getElementById(`matching-row-${idx}`);
        if (row) {
            const hasUnresolvedParent = document.querySelectorAll(`.parent-select-matcher[data-student-index="${idx}"] option[value=""]:checked`).length > 0;
            const isUnresolvedStudent = emails.length === 0;

            if (isUnresolvedStudent || hasUnresolvedParent) {
                row.className = isUnresolvedStudent ? "table-danger" : "table-warning";
            } else {
                row.className = "table-success";
            }
        }
    });
}
