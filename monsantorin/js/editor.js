import { state, saveConfiguration, saveCurrentState } from './state.js';
import { escapeHTML, escapeAttr, wrapCodeText } from './addons.js';
import { exportConfigJSON } from './io.js'; // NOUVEAU : Import pour la sauvegarde automatique

/** * 1. FONCTIONS LOCALES (Privées au module) */

function syncEditorToState() {
    const d = getConfigFromDOM();
    saveConfiguration({
        newConfig: d.exercises,
        scaleOption: d.scaleTo20,
        showAppOption: d.showAppreciation,
        generateGlobalPdfOption: d.generateGlobalPdf,
        showPublipostageOption: d.showPublipostage,
        showPdfChartOption: d.showPdfChart,
        fontSize: d.pdfFontSize,
        blankPageOption: d.blankPageForDuplex,
        showSkillsOption: d.showSkills,
        thresholdAcquis: d.thresholdAcquis,
        thresholdEncours: d.thresholdEncours,
        aiStep: d.aiStep,
        showAnswersOnPdfOption: d.showAnswersOnPdf
    });
}

export function getConfigFromDOM() {
    const newConf = [];
    const container = document.getElementById('configEditorContent');
    if (!container) return null;
    
    const exoCards = container.children;
    for (let i = 0; i < exoCards.length; i++) {
        const title = document.getElementById(`conf-title-${i}`).value;
        const contentDiv = document.getElementById(`conf-content-${i}`);
        const hasPartsVisual = contentDiv.querySelector('.config-part') !== null;
        let exoObj = { title: title };
        if (hasPartsVisual) {
            exoObj.parts = [];
            const partDivs = contentDiv.querySelectorAll('.config-part');
            partDivs.forEach((partDiv, pIdx) => {
                const pName = document.getElementById(`conf-partname-${i}-${pIdx}`).value;
                const questions = [];
                const qRows = partDiv.querySelectorAll('tbody tr');
                qRows.forEach((row, qIdx) => {
                    let answerVal = document.getElementById(`conf-qanswer-${i}-p${pIdx}-q${qIdx}`).value.trim();
                    let newQ = {
                        label: document.getElementById(`conf-qlabel-${i}-p${pIdx}-q${qIdx}`).value,
                        max: parseFloat(document.getElementById(`conf-qmax-${i}-p${pIdx}-q${qIdx}`).value) || 0,
                        step: parseFloat(document.getElementById(`conf-qstep-${i}-p${pIdx}-q${qIdx}`).value) || 0.25
                    };
                    if (answerVal !== "") newQ.answer = wrapCodeText(answerVal);
                    let badgeTexts = row.querySelectorAll('.skill-badge-text');
                    let parsedSkills = [];
                    badgeTexts.forEach(b => parsedSkills.push(b.getAttribute('data-raw') || b.innerText.trim()));
                    if (parsedSkills.length > 0) newQ.skills = parsedSkills;
                    questions.push(newQ);
                });
                exoObj.parts.push({ name: pName, questions: questions });
            });
        } else {
            exoObj.questions = [];
            const qList = document.getElementById(`conf-qlist-${i}`);
            if (qList) {
                const qRows = qList.querySelectorAll('tbody tr');
                qRows.forEach((row, qIdx) => {
                    let answerVal = document.getElementById(`conf-qanswer-${i}-q${qIdx}`).value.trim();
                    let newQ = {
                        label: document.getElementById(`conf-qlabel-${i}-q${qIdx}`).value,
                        max: parseFloat(document.getElementById(`conf-qmax-${i}-q${qIdx}`).value) || 0,
                        step: parseFloat(document.getElementById(`conf-qstep-${i}-q${qIdx}`).value) || 0.25
                    };
                    if (answerVal !== "") newQ.answer = wrapCodeText(answerVal);
                    let badgeTexts = row.querySelectorAll('.skill-badge-text');
                    let parsedSkills = [];
                    badgeTexts.forEach(b => parsedSkills.push(b.getAttribute('data-raw') || b.innerText.trim()));
                    if (parsedSkills.length > 0) newQ.skills = parsedSkills;
                    exoObj.questions.push(newQ);
                });
            }
        }
        newConf.push(exoObj);
    }
    
    const ansPdfCb = document.getElementById('conf-showAnswersOnPdf');
    const isAnswersPdfChecked = ansPdfCb ? ansPdfCb.checked : state.globalShowAnswersOnPdf;

    return { 
        exercises: newConf, 
        scaleTo20: document.getElementById('conf-scaleTo20').checked,
        showAppreciation: document.getElementById('conf-showAppreciation').checked,
        generateGlobalPdf: document.getElementById('conf-generateGlobalPdf').checked,
        showPublipostage: document.getElementById('conf-showPublipostage').checked,
        showPdfChart: document.getElementById('conf-showPdfChart').checked,
        showAnswersOnPdf: isAnswersPdfChecked,
        pdfFontSize: document.getElementById('conf-pdfFontSize').value,
        blankPageForDuplex: document.getElementById('conf-blankPageForDuplex').checked,
        showSkills: document.getElementById('conf-showSkills').checked,
        thresholdAcquis: parseInt(document.getElementById('conf-threshold-acquis').value) || 75,
        thresholdEncours: parseInt(document.getElementById('conf-threshold-encours').value) || 40,
        aiStep: parseFloat(document.getElementById('conf-ai-step').value) || 0.25
    };
}

export function updateEditorTotals() {
    const container = document.getElementById('configEditorContent');
    if (!container) return;
    const exoCards = container.children;
    let grandTotal = 0;
    for (let i = 0; i < exoCards.length; i++) {
        const contentDiv = document.getElementById(`conf-content-${i}`);
        const hasPartsVisual = contentDiv.querySelector('.config-part') !== null;
        let exoTotal = 0;
        if (hasPartsVisual) {
            const partDivs = contentDiv.querySelectorAll('.config-part');
            partDivs.forEach((partDiv, pIdx) => {
                let partTotal = 0;
                const maxInputs = partDiv.querySelectorAll('.conf-score-input');
                maxInputs.forEach(input => { partTotal += parseFloat(input.value) || 0; });
                const partBadge = document.getElementById(`conf-total-part-${i}-${pIdx}`);
                if (partBadge) partBadge.innerText = parseFloat(partTotal.toFixed(3)) + " pts";
                exoTotal += partTotal;
            });
        } else {
            const qList = document.getElementById(`conf-qlist-${i}`);
            if (qList) {
                const maxInputs = qList.querySelectorAll('.conf-score-input');
                maxInputs.forEach(input => { exoTotal += parseFloat(input.value) || 0; });
            }
        }
        const exoBadge = document.getElementById(`conf-total-exo-${i}`);
        if (exoBadge) exoBadge.innerText = parseFloat(exoTotal.toFixed(3)) + " pts";
        grandTotal += exoTotal;
    }
    const globalBadge = document.getElementById('conf-total-global');
    if (globalBadge) globalBadge.innerText = parseFloat(grandTotal.toFixed(3)) + " pts";
}

function buildSkillsDatalistFromDOM() {
    let skillsSet = new Set();
    document.querySelectorAll('.skill-badge-text').forEach(b => {
        skillsSet.add(b.getAttribute('data-raw') || b.innerText.trim());
    });
    let sortedSkills = Array.from(skillsSet).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    let dl = document.getElementById('skills-datalist');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'skills-datalist';
        document.body.appendChild(dl);
    }
    dl.innerHTML = '';
    sortedSkills.forEach(s => { dl.innerHTML += `<option value="${escapeAttr(s)}">`; });
}

function resizeConfigTextareas(root = document) {
    root.querySelectorAll('.auto-resize').forEach(el => {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    });
}

function renderConfigQuestionsTable(questions, exoIdx, partIdx) {
    let html = `<table class="table table-sm table-borderless mb-0 config-questions-table"><thead><tr class="text-muted" style="font-size:0.85em"><th>Libellé Question</th><th style="width:22%">Réponse courte (opt.)</th><th style="width:72px">Pts Max</th><th style="width:72px">Pas</th><th style="width:64px" class="text-center">Actions</th></tr></thead><tbody>`;
    questions.forEach((q, qIdx) => {
        const pId = partIdx !== null ? `p${partIdx}-` : '';
        const isFirst = qIdx === 0;
        const isLast = qIdx === questions.length - 1;
        const cleanLabel = escapeHTML(String(q.label || '').replace(/<br\s*\/?>/gi, '\n'));
        const cleanAnswer = escapeHTML(String(q.answer || '').replace(/<br\s*\/?>/gi, '\n'));
        const showSkills = document.getElementById('conf-showSkills')?.checked ?? state.globalShowSkills;
        let skills = q.skills || [];
        let skillsHtml = `<div class="mt-1 config-question-skills${showSkills ? '' : ' d-none'}">`;
        skills.forEach(sk => {
            skillsHtml += `<span class="skill-badge"><span class="skill-badge-text" data-raw="${escapeAttr(sk)}">${escapeHTML(sk)}</span><span class="skill-badge-remove" data-action="removeSkillBadge" title="Supprimer">✕</span></span>`;
        });
        skillsHtml += `<div class="skill-input-container"><input type="text" class="skill-input" list="skills-datalist" placeholder="+ capacité attendue..." data-action="handleSkillInput" style="width: 100%; min-width: 150px; max-width: 100%; box-sizing: border-box;"></div></div>`;
        html += `<tr class="question-row">
            <td class="config-question-label-cell"><textarea class="form-control form-control-sm auto-resize config-question-label fw-bold" rows="2" style="resize: vertical; overflow: hidden;" id="conf-qlabel-${exoIdx}-${pId}q${qIdx}">${cleanLabel}</textarea>${skillsHtml}</td>
            <td><textarea class="form-control form-control-sm auto-resize config-question-answer" rows="2" placeholder="💡 Rép: ..." style="resize: vertical; overflow: hidden;" id="conf-qanswer-${exoIdx}-${pId}q${qIdx}">${cleanAnswer}</textarea></td>
            <td><input type="number" step="0.125" min="0.125" class="form-control form-control-sm conf-score-input" value="${q.max}" id="conf-qmax-${exoIdx}-${pId}q${qIdx}"></td>
            <td><input type="number" step="0.125" min="0.125" class="form-control form-control-sm" value="${q.step}" id="conf-qstep-${exoIdx}-${pId}q${qIdx}"></td>
            <td class="align-middle text-center config-question-actions-cell">
                <div class="config-question-actions">
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" data-action="moveConfigQuestion" data-exo="${exoIdx}" data-part="${partIdx}" data-q="${qIdx}" data-dir="-1" ${isFirst ? 'disabled' : ''} title="Monter">↑</button>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1" data-action="moveConfigQuestion" data-exo="${exoIdx}" data-part="${partIdx}" data-q="${qIdx}" data-dir="1" ${isLast ? 'disabled' : ''} title="Descendre">↓</button>
                    <button class="btn btn-sm btn-outline-primary py-0 px-1" data-action="insertConfigQuestion" data-exo="${exoIdx}" data-part="${partIdx}" data-q="${qIdx}" title="Insérer une question">+</button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-1" data-action="removeConfigQuestion" data-exo="${exoIdx}" data-part="${partIdx}" data-q="${qIdx}" title="Supprimer">×</button>
                </div>
            </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    return html;
}

export function openConfigModal() {
    saveCurrentState(); 
    renderConfigEditor();
    const modalEl = document.getElementById('configModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
    modalEl.addEventListener('shown.bs.modal', function onModalShown() {
        resizeConfigTextareas(modalEl);
        modalEl.removeEventListener('shown.bs.modal', onModalShown);
    });
}

export function toggleEntSection(mode) {
    const section = document.getElementById('conf-ent-section');
    if (section) section.classList.toggle('d-none', mode !== 'monlycee');
}

export function openSettingsModal() {
    // Synchronise les champs depuis l'état courant
    document.getElementById('conf-showAppreciation').checked    = state.globalShowAppreciation;
    document.getElementById('conf-showPdfChart').checked        = state.globalShowPdfChart;
    document.getElementById('conf-generateGlobalPdf').checked   = state.globalGenerateGlobalPdf;
    document.getElementById('conf-blankPageForDuplex').checked  = state.globalBlankPageForDuplex;
    document.getElementById('conf-showPublipostage').checked    = state.globalShowPublipostage;
    document.getElementById('conf-pdfFontSize').value           = state.globalPdfFontSize;
    document.getElementById('conf-threshold-acquis').value      = state.globalThresholdAcquis;
    document.getElementById('conf-threshold-encours').value     = state.globalThresholdEncours;
    document.getElementById('conf-ai-step').value               = state.globalAiStep;
    const ansPdfCb = document.getElementById('conf-showAnswersOnPdf');
    if (ansPdfCb) ansPdfCb.checked = state.globalShowAnswersOnPdf;

    const webdavUrlEl = document.getElementById('conf-webdav-url');
    if (webdavUrlEl) webdavUrlEl.value = state.webdavUrl;
    const webdavUserEl = document.getElementById('conf-webdav-user');
    if (webdavUserEl) webdavUserEl.value = state.webdavUser;
    const smtpHostEl = document.getElementById('conf-smtp-host');
    if (smtpHostEl) smtpHostEl.value = state.smtpHost || 'smtps.monlycee.net';
    const smtpPortEl = document.getElementById('conf-smtp-port');
    if (smtpPortEl) smtpPortEl.value = state.smtpPort || '465';
    const smtpUserEl = document.getElementById('conf-smtp-user');
    if (smtpUserEl) smtpUserEl.value = state.smtpUser;
    const establishmentKeyEl = document.getElementById('conf-establishment-key');
    if (establishmentKeyEl) establishmentKeyEl.value = state.establishmentKey;

    const commMode = state.commMode;
    const commRadio = document.getElementById(`conf-comm-${commMode}`);
    if (commRadio) commRadio.checked = true;
    toggleEntSection(commMode);

    bootstrap.Modal.getOrCreateInstance(document.getElementById('settingsModal')).show();
}

export function saveSettingsFromModal() {
    const thresholdAcquis  = parseInt(document.getElementById('conf-threshold-acquis').value)  || 75;
    const thresholdEncours = parseInt(document.getElementById('conf-threshold-encours').value) || 40;
    if (thresholdEncours >= thresholdAcquis) {
        alert(`❌ Le seuil "En cours" (${thresholdEncours} %) doit être strictement inférieur au seuil "Acquis" (${thresholdAcquis} %).`);
        return;
    }
    const ansPdfCb = document.getElementById('conf-showAnswersOnPdf');
    const wasNeedsJsonExport = state.needsJsonExport;
    saveConfiguration({
        newConfig:               state.baremeConfig,
        scaleOption:             state.globalScaleTo20,
        showAppOption:           document.getElementById('conf-showAppreciation').checked,
        generateGlobalPdfOption: document.getElementById('conf-generateGlobalPdf').checked,
        showPublipostageOption:  document.getElementById('conf-showPublipostage').checked,
        showPdfChartOption:      document.getElementById('conf-showPdfChart').checked,
        fontSize:                document.getElementById('conf-pdfFontSize').value,
        blankPageOption:         document.getElementById('conf-blankPageForDuplex').checked,
        showSkillsOption:        document.getElementById('conf-showSkills').checked,
        thresholdAcquis:         thresholdAcquis,
        thresholdEncours:        thresholdEncours,
        aiStep:                  parseFloat(document.getElementById('conf-ai-step').value) || 0.25,
        showAnswersOnPdfOption:  ansPdfCb ? ansPdfCb.checked : state.globalShowAnswersOnPdf,
    });
    const confWebdavUrl = document.getElementById('conf-webdav-url');
    if (confWebdavUrl) state.webdavUrl = confWebdavUrl.value.trim();
    const confWebdavUser = document.getElementById('conf-webdav-user');
    if (confWebdavUser) state.webdavUser = confWebdavUser.value.trim();
    const confSmtpHost = document.getElementById('conf-smtp-host');
    if (confSmtpHost) state.smtpHost = confSmtpHost.value.trim();
    const confSmtpPort = document.getElementById('conf-smtp-port');
    if (confSmtpPort) state.smtpPort = confSmtpPort.value.trim();
    const confSmtpUser = document.getElementById('conf-smtp-user');
    if (confSmtpUser) state.smtpUser = confSmtpUser.value.trim();
    const confEstablishmentKey = document.getElementById('conf-establishment-key');
    if (confEstablishmentKey) {
        const keyVal = confEstablishmentKey.value.trim();
        if (keyVal && keyVal.length < 8) {
            alert('⚠️ Clé courte : pour plus de sécurité, utilisez au moins 8 caractères.');
        }
        state.establishmentKey = keyVal;
    }
    const selectedCommMode = document.querySelector('input[name="conf-comm-mode"]:checked');
    if (selectedCommMode) state.commMode = selectedCommMode.value;

    // Les paramètres seuls ne justifient pas un export JSON du barème
    state.needsJsonExport = wasNeedsJsonExport;
    // Mettre à jour le backup pour que "Annuler" dans l'éditeur de barème ne revienne pas en arrière
    updateConfigBackupBaseline();
    bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
}

export function syncSkillsButton() {
    const checked = document.getElementById('conf-showSkills')?.checked;
    document.querySelectorAll('.config-question-skills').forEach(el => {
        el.classList.toggle('d-none', !checked);
    });
    const btn = document.getElementById('btn-global-skills-editor');
    if (!btn) return;
    if (checked) {
        btn.classList.remove('btn-outline-secondary', 'disabled');
        btn.classList.add('btn-outline-info');
        btn.removeAttribute('disabled');
        btn.title = '';
    } else {
        btn.classList.remove('btn-outline-info');
        btn.classList.add('btn-outline-secondary', 'disabled');
        btn.setAttribute('disabled', 'true');
        btn.title = 'Activez d\'abord les capacités attendues';
    }
}

export function renderConfigEditor() {
    const container = document.getElementById('configEditorContent');
    container.innerHTML = '';
    
    // Remplissage des paramètres globaux
    document.getElementById('conf-scaleTo20').checked = state.globalScaleTo20;
    document.getElementById('conf-showAppreciation').checked = state.globalShowAppreciation;
    document.getElementById('conf-generateGlobalPdf').checked = state.globalGenerateGlobalPdf;
    document.getElementById('conf-showPublipostage').checked = state.globalShowPublipostage;
    document.getElementById('conf-showPdfChart').checked = state.globalShowPdfChart; 
    const ansPdfCheckbox = document.getElementById('conf-showAnswersOnPdf');
    if (ansPdfCheckbox) { ansPdfCheckbox.checked = state.globalShowAnswersOnPdf; }
    document.getElementById('conf-pdfFontSize').value = state.globalPdfFontSize;
    document.getElementById('conf-blankPageForDuplex').checked = state.globalBlankPageForDuplex;
    document.getElementById('conf-showSkills').checked = state.globalShowSkills;
    document.getElementById('conf-threshold-acquis').value = state.globalThresholdAcquis;
    document.getElementById('conf-threshold-encours').value = state.globalThresholdEncours;
    document.getElementById('conf-ai-step').value = state.globalAiStep;
    syncSkillsButton();
    
    const tempConfig = JSON.parse(JSON.stringify(state.baremeConfig));
    
    // --- DÉBUT DE L'OPTIMISATION (MÉMOIRE TAMPON) ---
    let bufferHtml = ""; 
    
    tempConfig.forEach((exo, exoIdx) => {
        const isFirstExo = exoIdx === 0;
        const isLastExo = exoIdx === tempConfig.length - 1;
        let exoHtml = `<div class="card config-card shadow-sm p-3" id="conf-exo-${exoIdx}">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="m-0 text-primary">Exercice ${exoIdx + 1} <span id="conf-total-exo-${exoIdx}" class="badge bg-primary ms-2 fs-6">0 pts</span></h5>
                <div>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2 me-1" data-action="moveConfigExo" data-exo="${exoIdx}" data-dir="-1" ${isFirstExo ? 'disabled' : ''}>↑</button>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2 me-3" data-action="moveConfigExo" data-exo="${exoIdx}" data-dir="1" ${isLastExo ? 'disabled' : ''}>↓</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="removeConfigExo" data-exo="${exoIdx}">Supprimer Ex.</button>
                </div>
            </div>
            <div class="mb-3"><label>Titre :</label><input type="text" class="form-control fw-bold" value="${escapeAttr(String(exo.title || ''))}" id="conf-title-${exoIdx}"></div>`;
            
        const hasParts = !!exo.parts;
        exoHtml += `<div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="conf-hasparts-${exoIdx}" ${hasParts ? 'checked' : ''} data-action="toggleConfigParts" data-exo="${exoIdx}"><label class="form-check-label" for="conf-hasparts-${exoIdx}">Parties (A, B...)</label></div><div id="conf-content-${exoIdx}">`;
        
        if (hasParts) {
            exo.parts.forEach((part, partIdx) => {
                const isFirstPart = partIdx === 0;
                const isLastPart = partIdx === exo.parts.length - 1;
                exoHtml += `<div class="config-part">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center w-75">
                            <input type="text" class="form-control form-control-sm fw-bold me-2" value="${escapeAttr(String(part.name || ''))}" id="conf-partname-${exoIdx}-${partIdx}">
                            <span id="conf-total-part-${exoIdx}-${partIdx}" class="badge bg-secondary">0 pts</span>
                        </div>
                        <div>
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" data-action="moveConfigPart" data-exo="${exoIdx}" data-part="${partIdx}" data-dir="-1" ${isFirstPart ? 'disabled' : ''}>↑</button>
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" data-action="moveConfigPart" data-exo="${exoIdx}" data-part="${partIdx}" data-dir="1" ${isLastPart ? 'disabled' : ''}>↓</button>
                            <button class="btn btn-sm btn-outline-danger py-0 px-1 ms-2" data-action="removeConfigPart" data-exo="${exoIdx}" data-part="${partIdx}">×</button>
                        </div>
                    </div>
                    <div id="conf-qlist-${exoIdx}-p${partIdx}">${renderConfigQuestionsTable(part.questions, exoIdx, partIdx)}</div>
                    <button class="btn btn-sm btn-light border w-100 mt-2 text-primary" data-action="addConfigQuestion" data-exo="${exoIdx}" data-part="${partIdx}">+ Ajouter Question</button>
                </div>`;
            });
            exoHtml += `<button class="btn btn-sm btn-outline-secondary mt-2 w-100" data-action="addConfigPart" data-exo="${exoIdx}">+ Ajouter une Partie</button>`;
        } else {
            exoHtml += `<div id="conf-qlist-${exoIdx}">${renderConfigQuestionsTable(exo.questions || [], exoIdx, null)}</div><button class="btn btn-sm btn-light border w-100 mt-2 text-primary" data-action="addConfigQuestion" data-exo="${exoIdx}" data-part="null">+ Ajouter Question</button>`;
        }
        
        exoHtml += `</div></div>`;
        
        // On ajoute le bloc au tampon, on ne touche pas au navigateur !
        bufferHtml += exoHtml; 
    });
    
    // --- FIN DE L'OPTIMISATION : UNE SEULE INJECTION DANS LE DOM ---
    container.innerHTML = bufferHtml;
    
    setTimeout(() => {
        updateEditorTotals();
        buildSkillsDatalistFromDOM();
        resizeConfigTextareas(container);
    }, 50);
}




export function addConfigExercise() {
    syncEditorToState();
    state.baremeConfig.push({ title: "Nouvel Exercice", questions: [{ label: "", max: 1, step: 0.125 }] });
    renderConfigEditor();
}

export function openGlobalSkillsEditor() {
    let skillsSet = new Set();
    document.querySelectorAll('.skill-badge-text').forEach(b => skillsSet.add(b.getAttribute('data-raw') || b.innerText.trim()));
    let currentUniqueSkills = Array.from(skillsSet).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const listContainer = document.getElementById('globalSkillsList');
    if (currentUniqueSkills.length === 0) listContainer.innerHTML = '<div class="alert alert-warning small">Aucune capacité.</div>';
    else {
        listContainer.innerHTML = currentUniqueSkills.map(sk => `<div class="mb-2 d-flex gap-2 align-items-center skill-editor-row"><input type="text" class="form-control global-skill-input" data-original="${escapeAttr(sk)}" value="${escapeAttr(sk)}"><button class="btn btn-outline-danger px-2" data-action="toggleGlobalSkillDeletion">🗑️</button></div>`).join('');
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('globalSkillsModal')).show();
}

export function saveGlobalSkills() {
    const rows = document.querySelectorAll('.skill-editor-row');
    let renameMap = {}; let toDelete = [];
    rows.forEach(row => {
        const input = row.querySelector('input');
        const oldName = input.getAttribute('data-original');
        if (row.classList.contains('to-delete')) toDelete.push(oldName);
        else if (input.value.trim() !== "" && input.value.trim() !== oldName) renameMap[oldName] = input.value.trim();
    });
    document.querySelectorAll('.skill-badge-text').forEach(badge => {
        const currentText = badge.getAttribute('data-raw') || badge.innerText.trim();
        if (toDelete.includes(currentText)) badge.closest('.skill-badge').remove();
        else if (renameMap[currentText]) { badge.setAttribute('data-raw', renameMap[currentText]); badge.innerText = renameMap[currentText]; }
    });
    buildSkillsDatalistFromDOM();
    bootstrap.Modal.getInstance(document.getElementById('globalSkillsModal')).hide();
}

/** * 3. LOGIQUE INTERNE DE DÉLÉGATION */

function moveConfigExo(exoIdx, direction) {
    syncEditorToState();
    if (exoIdx + direction >= 0 && exoIdx + direction < state.baremeConfig.length) {
        let temp = state.baremeConfig[exoIdx];
        state.baremeConfig[exoIdx] = state.baremeConfig[exoIdx + direction];
        state.baremeConfig[exoIdx + direction] = temp;
    }
    renderConfigEditor();
}

function moveConfigPart(exoIdx, partIdx, direction) {
    syncEditorToState();
    let pArray = state.baremeConfig[exoIdx].parts;
    if (partIdx + direction >= 0 && partIdx + direction < pArray.length) {
        let temp = pArray[partIdx];
        pArray[partIdx] = pArray[partIdx + direction];
        pArray[partIdx + direction] = temp;
    }
    renderConfigEditor();
}

function moveConfigQuestion(exoIdx, partIdx, qIdx, direction) {
    syncEditorToState();
    let qArray = partIdx !== null ? state.baremeConfig[exoIdx].parts[partIdx].questions : state.baremeConfig[exoIdx].questions;
    if (qIdx + direction >= 0 && qIdx + direction < qArray.length) {
        let temp = qArray[qIdx];
        qArray[qIdx] = qArray[qIdx + direction];
        qArray[qIdx + direction] = temp;
    }
    renderConfigEditor();
}

function insertConfigQuestion(exoIdx, partIdx, qIdx) {
    syncEditorToState();
    let qArray = partIdx !== null ? state.baremeConfig[exoIdx].parts[partIdx].questions : state.baremeConfig[exoIdx].questions;
    qArray.splice(qIdx + 1, 0, { label: "", max: 1, step: 0.125 });
    renderConfigEditor();
}

async function removeConfigExo(idx) {
    const { showConfirm } = await import('./addons.js');
    if (!await showConfirm("Supprimer cet exercice ?", "Supprimer l'exercice")) return;
    syncEditorToState();
    state.baremeConfig.splice(idx, 1);
    renderConfigEditor();
}

function toggleConfigParts(idx) {
    syncEditorToState();
    const exo = state.baremeConfig[idx];
    if (exo.parts) { exo.questions = []; exo.parts.forEach(p => p.questions.forEach(q => exo.questions.push(q))); delete exo.parts; } 
    else { exo.parts = [{ name: "Partie A", questions: exo.questions || [] }]; delete exo.questions; }
    renderConfigEditor();
}

function addConfigPart(exoIdx) {
    syncEditorToState();
    state.baremeConfig[exoIdx].parts.push({ name: "Nouvelle Partie", questions: [] }); 
    renderConfigEditor();
}

function removeConfigPart(exoIdx, partIdx) {
    syncEditorToState();
    state.baremeConfig[exoIdx].parts.splice(partIdx, 1); renderConfigEditor();
}

function addConfigQuestion(exoIdx, partIdx) {
    syncEditorToState();
    const newQ = { label: "", max: 1, step: 0.125 };
    if (partIdx !== null) state.baremeConfig[exoIdx].parts[partIdx].questions.push(newQ); 
    else state.baremeConfig[exoIdx].questions.push(newQ);
    renderConfigEditor();
}

function removeConfigQuestion(exoIdx, partIdx, qIdx) {
    syncEditorToState();
    if (partIdx !== null) state.baremeConfig[exoIdx].parts[partIdx].questions.splice(qIdx, 1);
    else state.baremeConfig[exoIdx].questions.splice(qIdx, 1);
    renderConfigEditor();
}

function removeSkillBadge(btn) { 
    btn.parentElement.remove(); 
    buildSkillsDatalistFromDOM(); 
}

function handleSkillInput(e, inputEl) {
    if (e.key === 'Enter') {
        e.preventDefault();
        let val = inputEl.value.trim();
        if (val !== "") {
            let badge = document.createElement('span');
            badge.className = 'skill-badge';
            badge.innerHTML = `<span class="skill-badge-text" data-raw="${escapeAttr(val)}">${escapeHTML(val)}</span><span class="skill-badge-remove" data-action="removeSkillBadge">✕</span>`;
            inputEl.parentElement.parentNode.insertBefore(badge, inputEl.parentElement);
            inputEl.value = "";
            buildSkillsDatalistFromDOM(); 
        }
    }
}

function toggleGlobalSkillDeletion(btn) {
    const row = btn.closest('.skill-editor-row');
    const input = row.querySelector('input');
    
    row.classList.toggle('opacity-50');
    row.classList.toggle('to-delete');
    
    if (row.classList.contains('to-delete')) {
        btn.classList.replace('btn-outline-danger', 'btn-danger');
        input.style.textDecoration = "line-through";
        input.disabled = true;
    } else {
        btn.classList.replace('btn-danger', 'btn-outline-danger');
        input.style.textDecoration = "none";
        input.disabled = false;
    }
}


/** * 4. LE STANDARDISTE DE L'ÉDITEUR (Délégation d'événements) */

document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const exo = (btn.dataset.exo !== "null" && btn.dataset.exo !== undefined) ? parseInt(btn.dataset.exo) : null;
    const part = (btn.dataset.part !== "null" && btn.dataset.part !== undefined) ? parseInt(btn.dataset.part) : null;
    const q = (btn.dataset.q !== "null" && btn.dataset.q !== undefined) ? parseInt(btn.dataset.q) : null;
    const dir = (btn.dataset.dir !== "null" && btn.dataset.dir !== undefined) ? parseInt(btn.dataset.dir) : null;

    if (action === 'moveConfigExo') moveConfigExo(exo, dir);
    else if (action === 'removeConfigExo') removeConfigExo(exo);
    else if (action === 'addConfigPart') addConfigPart(exo);
    else if (action === 'moveConfigPart') moveConfigPart(exo, part, dir);
    else if (action === 'removeConfigPart') removeConfigPart(exo, part);
    else if (action === 'addConfigQuestion') addConfigQuestion(exo, part);
    else if (action === 'moveConfigQuestion') moveConfigQuestion(exo, part, q, dir);
    else if (action === 'insertConfigQuestion') insertConfigQuestion(exo, part, q);
    else if (action === 'removeConfigQuestion') removeConfigQuestion(exo, part, q);
    else if (action === 'removeSkillBadge') removeSkillBadge(btn);
    else if (action === 'toggleGlobalSkillDeletion') toggleGlobalSkillDeletion(btn);
});

document.addEventListener('change', function(e) {
    if (e.target.dataset.action === 'toggleConfigParts') {
        toggleConfigParts(parseInt(e.target.dataset.exo));
    }
});

document.addEventListener('input', function(e) {
    if (e.target.classList.contains('auto-resize')) {
        e.target.style.height = 'auto';
        e.target.style.height = (e.target.scrollHeight) + 'px';
    }
    if (e.target.classList.contains('conf-score-input')) {
        updateEditorTotals();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.target.dataset.action === 'handleSkillInput') {
        handleSkillInput(e, e.target);
    }
});

// =========================================================
// GESTION DE L'ANNULATION (MOTIF SNAPSHOT / RESTORE)
// =========================================================

let configBackup = null;

// Initialisation des écouteurs de la modale
document.addEventListener('DOMContentLoaded', () => {
    const modalEl = document.getElementById('configModal');
    if (!modalEl) return;

    // ÉVÉNEMENT 1 : Ouverture -> On prend la photo de référence
    modalEl.addEventListener('show.bs.modal', () => {
        const d = getConfigFromDOM();
        if (!d) return;
        configBackup = JSON.stringify({
            exercises: d.exercises,
            scaleTo20: d.scaleTo20,
            showAppreciation: state.globalShowAppreciation,
            generateGlobalPdf: state.globalGenerateGlobalPdf,
            showPublipostage: state.globalShowPublipostage,
            showPdfChart: state.globalShowPdfChart,
            pdfFontSize: state.globalPdfFontSize,
            blankPageForDuplex: state.globalBlankPageForDuplex,
            showSkills: state.globalShowSkills,
            thresholdAcquis: state.globalThresholdAcquis,
            thresholdEncours: state.globalThresholdEncours,
            aiStep: state.globalAiStep,
            showAnswersOnPdf: state.globalShowAnswersOnPdf
        });
    });

    // ÉVÉNEMENT 2 : Fermeture par annulation (croix, touche Échap ou clic extérieur)
    modalEl.addEventListener('hide.bs.modal', () => {
        if (configBackup !== null) {
            // Gel des deux drapeaux avant la restauration
            const wasNeedsJsonExport = state.needsJsonExport;
            const wasNeedsCsvExport  = state.needsCsvExport;

            const b = JSON.parse(configBackup);
            saveConfiguration({
                newConfig: b.exercises,
                scaleOption: b.scaleTo20,
                showAppOption: b.showAppreciation,
                generateGlobalPdfOption: b.generateGlobalPdf,
                showPublipostageOption: b.showPublipostage,
                showPdfChartOption: b.showPdfChart,
                fontSize: b.pdfFontSize,
                blankPageOption: b.blankPageForDuplex,
                showSkillsOption: b.showSkills,
                thresholdAcquis: b.thresholdAcquis,
                thresholdEncours: b.thresholdEncours,
                aiStep: b.aiStep,
                showAnswersOnPdfOption: b.showAnswersOnPdf
            });

            // Restauration stricte des drapeaux : une annulation ne doit
            // jamais déclencher l'avertissement de fermeture de page.
            state.needsJsonExport = wasNeedsJsonExport;
            state.needsCsvExport  = wasNeedsCsvExport;
            configBackup = null; 
        }
    });
});

// Enregistrement volontaire depuis la modale
export function saveConfigFromEditor() { 
    const wasInAlertMode = state.needsJsonExport;
    const d = getConfigFromDOM();
    if (!d) { alert("❌ Erreur : Le barème n'a pas pu être lu. Veuillez le vérifier."); return; }

    const newStateObj = {
        exercises: d.exercises,
        scaleTo20: d.scaleTo20,
        showAppreciation: d.showAppreciation,
        generateGlobalPdf: d.generateGlobalPdf,
        showPublipostage: d.showPublipostage,
        showPdfChart: d.showPdfChart,
        pdfFontSize: d.pdfFontSize,
        blankPageForDuplex: d.blankPageForDuplex,
        showSkills: d.showSkills,
        thresholdAcquis: d.thresholdAcquis,
        thresholdEncours: d.thresholdEncours,
        aiStep: d.aiStep,
        showAnswersOnPdf: d.showAnswersOnPdf
    };

    // Vérification : y a-t-il eu une vraie modification de l'interface ?
    const hasChanged = (JSON.stringify(newStateObj) !== configBackup);

    // On applique les changements au Store (ce qui lève le drapeau par défaut)
    syncEditorToState();

    const autoExportCheckbox = document.getElementById('conf-autoExport');
    const isAutoExportChecked = autoExportCheckbox ? autoExportCheckbox.checked : false;

    // LA LOGIQUE MÉTÉRIELLE STRICTE :
    if (!hasChanged) {
        // Si aucune modification réelle, on restaure l'état d'alerte exact d'avant l'ouverture
        state.needsJsonExport = wasInAlertMode;
    } else {
        // S'il y a une modification, on lève l'alerte UNIQUEMENT si l'auto-sauvegarde est sur OFF
        state.needsJsonExport = !isAutoExportChecked;
    }

    // DÉCLENCHEMENT DU TÉLÉCHARGEMENT :
    // - Soit parce que l'auto-save est ON
    // - Soit pour éteindre une alerte existante (peu importe s'il y a eu de nouveaux changements)
    if (isAutoExportChecked || wasInAlertMode) {
        exportConfigJSON(); 
    }

    // On nettoie la photo et on ferme
    configBackup = null;
    bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
}


/**
 * Annule la photo de référence afin d'empêcher le listener hide.bs.modal
 * de restaurer l'ancienne configuration lors d'une fermeture intentionnelle.
 * À appeler avant modal.hide() dans toute action qui valide délibérément un changement.
 */
export function discardConfigBackup() {
    configBackup = null;
}

// Permet de redéfinir la photo témoin lors d'un import JSON réussi
export function updateConfigBackupBaseline() {
    const d = getConfigFromDOM();
    if (!d) return;
    configBackup = JSON.stringify({
        exercises: d.exercises,
        scaleTo20: d.scaleTo20,
        showAppreciation: state.globalShowAppreciation,
        generateGlobalPdf: state.globalGenerateGlobalPdf,
        showPublipostage: state.globalShowPublipostage,
        showPdfChart: state.globalShowPdfChart,
        pdfFontSize: state.globalPdfFontSize,
        blankPageForDuplex: state.globalBlankPageForDuplex,
        showSkills: state.globalShowSkills,
        thresholdAcquis: state.globalThresholdAcquis,
        thresholdEncours: state.globalThresholdEncours,
        aiStep: state.globalAiStep,
        showAnswersOnPdf: state.globalShowAnswersOnPdf
    });
}

