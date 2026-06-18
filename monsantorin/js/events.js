// --- FICHIER : js/events.js ---
// Rôle : Centraliser tous les écouteurs d'événements du DOM et piloter
// l'initialisation visuelle de l'application (Le Chef d'Orchestre).

import { state, loadConfiguration, loadTitle, editTitle, saveCurrentState, resetDefaultConfig, clearFullBareme, clearBaremeAndClass } from './state.js';
import { renderStudentList, updateStudentNameInList, deleteCurrentStudent, deleteAllStudents, loadStudent, updateAppreciationPreview, toggleAbsent, toggleTiersTemps } from './student.js';
import { renderGradingForm, renderQuickComments, openHelpModal, toggleAnswers, openStatsModal, closeWelcomeModal, generateFullBarèmePrompt, generateIAPrompt, pasteIAResult, handleIAPasteEvent, saveQuickCommentsFromModal, checkJsonExportStatus } from './addons.js';
import { openConfigModal, openSettingsModal, saveSettingsFromModal, addConfigExercise, saveConfigFromEditor, openGlobalSkillsEditor, saveGlobalSkills, syncSkillsButton, renderConfigEditor, toggleEntSection } from './editor.js';
import { exportToCSV, triggerImport, triggerClassImport, downloadClassZip, triggerConfigImport, processCSVImport, processClassImport, processConfigImport } from './io.js';
import { openPublipostageModal, processEntImport, renderMatchingTable, generatePublipostageScript, generateCloudUploadScript, copyGradesToClipboard, generateCloudPasswordScript, downloadPasswordCsv, downloadEncryptedClassZip } from './publipostage.js';
import { generatePDF } from './pdf.js';
import { STORAGE_KEYS } from './constants.js';

// --- LE STANDARDISTE COMPLET ---
export function attachEventListeners() {
    document.getElementById('btn-edit-title')?.addEventListener('click', editTitle);
    
    // Sécurisation : on force une fonction anonyme vide pour éviter que le clic (Event) ne soit envoyé comme 'targetId'
    document.getElementById('btn-help-modal')?.addEventListener('click', () => openHelpModal());
    document.getElementById('btn-help-load-example')?.addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('helpModal'))?.hide();
        resetDefaultConfig();
    });
    
    document.getElementById('btn-config-modal')?.addEventListener('click', openConfigModal);
    document.getElementById('btn-settings-modal')?.addEventListener('click', openSettingsModal);
    document.getElementById('btn-save-settings')?.addEventListener('click', saveSettingsFromModal);
    document.getElementById('conf-showSkills')?.addEventListener('change', syncSkillsButton);
    document.getElementById('btn-stats-modal')?.addEventListener('click', openStatsModal);
    document.getElementById('btn-zip')?.addEventListener('click', downloadClassZip);
    document.getElementById('main-btn-publipostage')?.addEventListener('click', openPublipostageModal);
    document.getElementById('btn-import-class')?.addEventListener('click', () => {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('pronoteGuideModal')).show();
    });
    document.getElementById('btn-pronote-choose-file')?.addEventListener('click', triggerClassImport);
    document.getElementById('btn-mark-tt')?.addEventListener('click', toggleTiersTemps);
    document.getElementById('btn-mark-absent')?.addEventListener('click', toggleAbsent);
    document.getElementById('btn-delete-all-students')?.addEventListener('click', deleteAllStudents);
    document.getElementById('studentName')?.addEventListener('input', updateStudentNameInList);
    document.getElementById('btn-generate-pdf')?.addEventListener('click', generatePDF);
    document.getElementById('btn-delete-student')?.addEventListener('click', deleteCurrentStudent);
    document.getElementById('appreciation')?.addEventListener('input', () => { saveCurrentState(true); updateAppreciationPreview(true); });
    document.getElementById('gradingArea')?.addEventListener('change', () => { saveCurrentState(true); });
    document.getElementById('main-toggle-answers')?.addEventListener('change', (e) => toggleAnswers(e.target.checked));
    document.getElementById('btn-export-csv')?.addEventListener('click', exportToCSV);
    document.getElementById('btn-trigger-import')?.addEventListener('click', triggerImport);
    document.getElementById('btn-close-welcome')?.addEventListener('click', closeWelcomeModal);
    document.getElementById('btn-generate-full-prompt')?.addEventListener('click', generateFullBarèmePrompt);
    document.getElementById('btn-generate-ia-prompt')?.addEventListener('click', generateIAPrompt);
    document.getElementById('btn-paste-ia-result')?.addEventListener('click', async () => {
        const applied = await pasteIAResult();
        if (applied) renderConfigEditor();
    });
    document.getElementById('ia-response-textarea')?.addEventListener('paste', handleIAPasteEvent);
    document.getElementById('btn-global-skills-editor')?.addEventListener('click', openGlobalSkillsEditor);
    document.getElementById('btn-import-config')?.addEventListener('click', triggerConfigImport);
    document.getElementById('btn-add-config-exercise')?.addEventListener('click', addConfigExercise);
    document.getElementById('btn-clear-full-bareme')?.addEventListener('click', clearFullBareme);
    document.getElementById('btn-clear-bareme-class')?.addEventListener('click', clearBaremeAndClass);
    document.getElementById('btn-save-config')?.addEventListener('click', saveConfigFromEditor);
    const btnMatch = document.getElementById('btn-render-matching-table');
    btnMatch?.addEventListener('mousedown', () => {
        btnMatch.style.backgroundColor = '#5c7fa3';
        btnMatch.style.color = 'white';
    });
    ['mouseup', 'mouseleave'].forEach(evt => btnMatch?.addEventListener(evt, () => {
        btnMatch.style.backgroundColor = 'transparent';
        btnMatch.style.color = '#5c7fa3';
    }));
    btnMatch?.addEventListener('click', () => {
        renderMatchingTable(true);
        const matchingDetails = document.getElementById('matching-details');
        if (matchingDetails) matchingDetails.open = true;
    });
    document.getElementById('btn-save-global-skills')?.addEventListener('click', saveGlobalSkills);
    document.getElementById('btn-save-quick-comments')?.addEventListener('click', saveQuickCommentsFromModal);
    document.getElementById('csvFileInput')?.addEventListener('change', (e) => processCSVImport(e.target));
    document.getElementById('classCsvInput')?.addEventListener('change', (e) => processClassImport(e.target));
    document.getElementById('configFileImport')?.addEventListener('change', (e) => processConfigImport(e.target));
    document.getElementById('entCsvInput')?.addEventListener('change', (e) => processEntImport(e.target));
    document.getElementById('chk-add-parents')?.addEventListener('change', () => { 
        if (state.entStudents.length > 0) renderMatchingTable(false); 
    });
    
    // --- Écouteurs pour la communication des notes ---
    document.getElementById('btn-publipostage')?.addEventListener('click', generatePublipostageScript);
    document.getElementById('btn-start-cloud-upload')?.addEventListener('click', generateCloudUploadScript);
    document.getElementById('btn-copy-grades-smtp')?.addEventListener('click', copyGradesToClipboard);
    document.getElementById('btn-copy-grades-cloud')?.addEventListener('click', copyGradesToClipboard);
    
    // --- Nouveau mode Cloud avec Mot de passe ---
    document.getElementById('btn-start-cloud-password-script')?.addEventListener('click', generateCloudPasswordScript);
    document.getElementById('btn-download-password-csv')?.addEventListener('click', downloadPasswordCsv);
    document.getElementById('btn-copy-grades-cloud-password')?.addEventListener('click', copyGradesToClipboard);

    // --- PDF chiffrés — diffusion manuelle (sans Python) ---
    document.getElementById('btn-download-encrypted-zip')?.addEventListener('click', downloadEncryptedClassZip);
    document.getElementById('btn-download-password-csv-manual')?.addEventListener('click', downloadPasswordCsv);
    document.getElementById('btn-copy-grades-encrypted-manual')?.addEventListener('click', copyGradesToClipboard);

    // --- Bouton d'aide ciblé pour le WebDAV (désormais dans Paramètres) ---
    document.getElementById('btn-help-webdav-settings')?.addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
        openHelpModal('guide-webdav');
    });

    // Affichage conditionnel de la section ENT selon le mode de communication choisi
    document.querySelectorAll('input[name="conf-comm-mode"]').forEach(radio => {
        radio.addEventListener('change', () => toggleEntSection(radio.value));
    });


    // --- RÈGLE DE L'ART : Gestion globale du défilement des modales empilées ---
    document.addEventListener('hidden.bs.modal', () => {
        if (document.querySelector('.modal.show')) {
            document.body.classList.add('modal-open');
        }
    });
}

// --- NOUVEAU : GESTION CENTRALISÉE DU CLAVIER ---
export function attachKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            return;
        }

        const activeEl = document.activeElement;
        const isTypingField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        const isScoreInput = activeEl && activeEl.classList.contains('score-input');

        if (e.key === 'End' && !isTypingField && !isScoreInput) {
            e.preventDefault(); 
            const appreciationBox = document.getElementById('appreciation');
            if (appreciationBox) {
                appreciationBox.focus({ preventScroll: true }); 
                appreciationBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                const textLength = appreciationBox.value.length;
                appreciationBox.setSelectionRange(textLength, textLength); 
            }
            return;
        }

        if (['Tab', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
            state.isClickFocus = false; 
        }

        if (document.querySelector('.modal.show')) return;

        if (e.altKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            const toggleBtn = document.getElementById('main-toggle-answers');
            if (toggleBtn) {
                toggleBtn.checked = !toggleBtn.checked;
                toggleAnswers(toggleBtn.checked);
            }
            return;
        }

        if (e.key === 'PageDown') {
            e.preventDefault(); 
            if (state.currentIndex < state.students.length - 1) {
                saveCurrentState(true);
                loadStudent(state.currentIndex + 1);
            }
            return; 
        } else if (e.key === 'PageUp') {
            e.preventDefault(); 
            if (state.currentIndex > 0) {
                saveCurrentState(true);
                loadStudent(state.currentIndex - 1);
            }
            return; 
        }
        
        if (isTypingField) return; 

        if (isScoreInput) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                let idx = activeEl.selectedIndex;
                const options = activeEl.options;
                
                if (e.key === 'ArrowLeft' && idx > 0) {
                    activeEl.selectedIndex = idx - 1;
                    activeEl.dispatchEvent(new Event('change', { bubbles: true })); 
                } else if (e.key === 'ArrowRight' && idx < options.length - 1) {
                    activeEl.selectedIndex = idx + 1;
                    activeEl.dispatchEvent(new Event('change', { bubbles: true })); 
                }
                return;
            }
            
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const inputs = Array.from(document.querySelectorAll('.score-input'));
                const currentIndexInArray = inputs.indexOf(activeEl);
                
                if (e.key === 'ArrowUp' && currentIndexInArray > 0) {
                    inputs[currentIndexInArray - 1].focus({ preventScroll: true }); 
                    inputs[currentIndexInArray - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (e.key === 'ArrowDown' && currentIndexInArray < inputs.length - 1) {
                    inputs[currentIndexInArray + 1].focus({ preventScroll: true }); 
                    inputs[currentIndexInArray + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }
        }

        if (e.key.length === 1 && e.key.match(/[a-zA-Z\u00C0-\u024F]/)) {
            if (e.ctrlKey || e.metaKey || e.altKey) return; 
            
            state.studentSearchBuffer += e.key.toLowerCase();
            
            if (state.studentSearchTimeout) clearTimeout(state.studentSearchTimeout);
            state.studentSearchTimeout = setTimeout(() => { state.studentSearchBuffer = ""; }, 1500);
            
            const normalizedSearch = state.studentSearchBuffer.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            const matchIndex = state.students.findIndex(s => {
                if (!s.name) return false;
                const normalizedName = s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                return normalizedName.startsWith(normalizedSearch);
            });
            
            if (matchIndex !== -1 && matchIndex !== state.currentIndex) {
                saveCurrentState(true);
                loadStudent(matchIndex);
            }
        }
    }, true);
}


// --- INITIALISATION DE L'APPLICATION ---
export function init() {
    attachEventListeners();
    attachKeyboardShortcuts(); // APPEL DE LA GESTION CLAVIER ICI
    loadConfiguration(); 
    loadTitle(); 
    
    let savedShowAnswers = localStorage.getItem(STORAGE_KEYS.SHOW_ANSWERS);
    state.globalShowAnswers = savedShowAnswers !== null ? (savedShowAnswers === 'true') : true;
    const toggleCheckbox = document.getElementById('main-toggle-answers');
    if(toggleCheckbox) toggleCheckbox.checked = state.globalShowAnswers;
    if (state.globalShowAnswers) document.body.classList.add('show-answers');
    else document.body.classList.remove('show-answers');

    renderGradingForm(); 
    renderQuickComments();
    if (state.students.length > 0) {
        loadStudent(0);
    } else {
        renderStudentList(); // met à jour le compteur même sans élèves
    }

    document.addEventListener('focusin', function(e) {
        const activeRow = e.target?.closest?.('.grading-question-row');
        document.querySelectorAll('.grading-question-row').forEach(row => {
            row.classList.toggle('grading-question-active', row === activeRow);
        });
        if (e.target && e.target.classList.contains('score-input')) {
            if (!state.isClickFocus) {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
    // 1. Branchement du pattern Observer pour le barème JSON
    window.addEventListener('json-export-status-changed', checkJsonExportStatus);

    // 2. Mise à jour de la visibilité du bouton publipostage (état géré dans state.js)
    window.addEventListener('publipostage-visibility-changed', (e) => {
        const btn = document.getElementById('main-btn-publipostage');
        if (btn) btn.style.display = e.detail.show ? 'block' : 'none';
    });
    
    // 3. Appel initial pour mettre le bouton dans le bon état au chargement
    checkJsonExportStatus();

    // 3. Le fameux garde-fou beforeunload (que nous avions vu précédemment)
    window.addEventListener('beforeunload', function (e) {
        if (state.needsCsvExport || state.needsJsonExport) {
            let msg = "Vous avez des modifications non sauvegardées.";
            e.preventDefault();
            e.returnValue = msg;
            return msg;
        }
    });

    // 4. Initialisation des infobulles Bootstrap
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new bootstrap.Tooltip(el, { trigger: 'hover focus' });
    });
}