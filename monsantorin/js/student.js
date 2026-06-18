import { state, saveCurrentState, finalizeFullResetIfEmpty } from './state.js';
import { isTiersTemps, isAbsent, removeTiersTempsBadge, removeAbsentBadge, calculateMaxScore as engineCalculateMax, computeScore, forEachQuestion } from './engine.js';
import { parseMD, escapeHTML } from './addons.js';
import { STORAGE_KEYS } from './constants.js';

export function calculateMaxScore() {
    const display = document.getElementById('maxScoreDisplay');
    if (!display) return;
    if (!state.baremeConfig || !state.baremeConfig.length) {
        display.innerText = "";
        return;
    }
    let total = engineCalculateMax(state.baremeConfig);
    display.innerText = "/ " + Math.round(total * 1000) / 1000;
}

/**
 * AFFICHAGE DE LA LISTE DES ÉLÈVES (La Vue)
 * Construit les boutons de la barre latérale de manière sécurisée (Anti-XSS).
 */
export function renderStudentList() {
    const listContainer = document.getElementById('studentList'); 
    
    // Vider le conteneur proprement
    listContainer.innerHTML = '';
    let unnamedCounter = 0; 
    
    state.students.forEach((student, index) => {
        const item = document.createElement('button'); 
        item.type = 'button';
        
        // SÉCURISATION : On utilise la création de noeuds plutôt que innerHTML
        if (!student.name || student.name.trim() === "") {
            const emptySpan = document.createElement('span');
            emptySpan.className = "text-muted fst-italic";
            emptySpan.textContent = `Sans nom (${++unnamedCounter})`;
            item.appendChild(emptySpan);
        } else {
            // textContent garantit que les balises HTML éventuelles dans le nom 
            // seront affichées comme du texte et non exécutées.
            item.textContent = student.name; 
        }
        
        const ttClass = isAbsent(student.name) ? 'list-group-item-secondary' : (isTiersTemps(student.name) ? 'list-group-item-info' : '');
        item.className = `list-group-item list-group-item-action ${index === state.currentIndex ? 'active' : ''} ${ttClass}`;
        
        item.addEventListener('click', () => { 
            if (index !== state.currentIndex) {
                saveCurrentState(); 
                loadStudent(index); 
            }
        });
        
        listContainer.appendChild(item);
    });
    
    // Création du bouton d'ajout de manière sécurisée
    const addBtn = document.createElement('button'); 
    addBtn.className = "list-group-item list-group-item-action text-primary fw-bold text-center"; 
    addBtn.textContent = "+ Nouvel élève"; // Remplace innerHTML
    addBtn.title = "Ajouter un nouvel élève vide à la fin de la liste.";
    addBtn.addEventListener('click', () => { addNewStudent(); }); 
    
    listContainer.appendChild(addBtn);
    
    const countDisplay = document.getElementById('totalStudentsDisplay');
    if (countDisplay) {
        countDisplay.textContent = state.students.length;
    }

    // Champ nom : désactivé et indicatif quand aucun élève n'existe
    const nameInput = document.getElementById('studentName');
    if (nameInput) {
        if (state.students.length === 0) {
            nameInput.value = "";
            nameInput.disabled = true;
            nameInput.placeholder = "Cliquez sur + Nouvel élève ou importez la liste Pronote des élèves";
            nameInput.title = "Ajoutez d'abord un élève via le bouton + Nouvel élève ci-dessus.";
            // Vider aussi l'appréciation et masquer le bilan de compétences
            const appreciationField = document.getElementById('appreciation');
            if (appreciationField) appreciationField.value = "";
            const appreciationPreview = document.getElementById('appreciation-preview');
            if (appreciationPreview) appreciationPreview.style.display = 'none';
            const bilanDiv = document.getElementById('skillBilanDisplay');
            if (bilanDiv) bilanDiv.style.display = 'none';
            // Réinitialiser l'affichage du total dans la barre du bas
            const finalScore = document.getElementById('finalScoreDisplay');
            const maxScore = document.getElementById('maxScoreDisplay');
            const scoreWrapper = document.getElementById('scoreWrapper');
            if (finalScore) finalScore.innerText = "";
            if (maxScore) maxScore.innerText = "";
            if (scoreWrapper) scoreWrapper.className = "";
            const scaledContainer = document.getElementById('scaledScoreContainer');
            if (scaledContainer) scaledContainer.style.display = 'none';
        } else {
            nameInput.disabled = false;
            nameInput.placeholder = "Entrez le nom...";
            nameInput.title = "";
        }
    }
    updateProgressBar();
}

/**
 * LECTURE ET CONTRÔLE (Le Contrôleur)
 * Lit les notes, met à jour le Store, interroge le moteur, et délègue l'affichage.
 */
export function updateProgressBar() {
    const el = document.getElementById('progress-bar-wrapper');
    if (!el) return;

    const students = state.students.filter(s => s.name && s.name.trim() !== "" && !isAbsent(s.name));
    const hasBareme = state.baremeConfig && state.baremeConfig.length > 0;

    const color = '#5c7fa3';
    const baseColor = 'rgba(92,127,163,0.25)';

    if (!hasBareme || students.length === 0) {
        el.style.borderImage = `linear-gradient(to right, ${baseColor} 100%, ${baseColor} 100%) 1`;
        return;
    }

    const completed = students.filter(s =>
        computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name)).isComplete
    ).length;
    const total = students.length;
    const done = completed === total;
    const pct = (completed / total * 100) + '%';
    const activeColor = done ? '#6abf69' : color;

    el.style.borderImage = `linear-gradient(to right, ${activeColor} ${pct}, ${baseColor} ${pct}) 1`;
}

export function calculateTotals() {
    // Guard : rien à calculer sans élèves ou sans barème
    if (!state.students.length || !state.baremeConfig.length) {
        const finalScore = document.getElementById('finalScoreDisplay');
        const maxScore = document.getElementById('maxScoreDisplay');
        const scoreWrapper = document.getElementById('scoreWrapper');
        if (finalScore) finalScore.innerText = "";
        if (maxScore) maxScore.innerText = "";
        if (scoreWrapper) scoreWrapper.className = "";
        const scaledContainer = document.getElementById('scaledScoreContainer');
        if (scaledContainer) scaledContainer.style.display = 'none';
        return;
    }

    // 1. Lecture des saisies du DOM
    let currentScores = {};
    const selects = document.querySelectorAll('.score-input');
    selects.forEach(select => {
        const val = select.value;
        currentScores[select.dataset.id] = val === "" ? "" : parseFloat(val);
    });

    // 2. Mise à jour de l'état (Le Modèle)
    state.students[state.currentIndex].scores = currentScores;

    // 3. Appel au moteur mathématique pur (La Logique)
    const isTT = isTiersTemps(state.students[state.currentIndex].name);
    const result = computeScore(currentScores, state.baremeConfig, isTT);

    // 4. Délégation de l'affichage (La Vue)
    updateScoreUI(result);

    return currentScores;
}

/**
 * MISE À JOUR VISUELLE (La Vue)
 * Gère exclusivement l'affichage des totaux et des classes CSS dans le DOM.
 * @param {Object} result - L'objet contenant les résultats des calculs du moteur
 */
function updateScoreUI(result) {
    // A. Réinitialisation et marquage des questions non répondues
    const selects = document.querySelectorAll('.score-input');
    selects.forEach(select => select.classList.remove("unanswered"));

    result.missingQuestions.forEach(qId => {
        const select = document.querySelector(`select[data-id="${qId}"]`);
        if (select) select.classList.add("unanswered");
    });

    // B. Mise à jour des sous-totaux (Parties et Exercices)
    state.baremeConfig.forEach((exo, exoIdx) => {
        if (exo.parts) {
            exo.parts.forEach((part, partIdx) => {
                const partDisplay = document.getElementById(`total-part-${exoIdx}-${partIdx}`);
                if (partDisplay) {
                    const pData = result.partTotals[`${exoIdx}-${partIdx}`];
                    partDisplay.innerText = parseFloat(pData.total.toFixed(3)) + " / " + parseFloat(pData.max.toFixed(3));
                    partDisplay.classList.toggle("text-danger", result.hasMissing.part[`${exoIdx}-${partIdx}`]);
                    partDisplay.classList.toggle("text-dark", !result.hasMissing.part[`${exoIdx}-${partIdx}`]);
                }
            });
        }
        const exoDisplay = document.getElementById(`total-exo-${exoIdx}`);
        if(exoDisplay) { 
            const eData = result.exoTotals[exoIdx];
            exoDisplay.innerText = parseFloat(eData.total.toFixed(3)) + " / " + parseFloat(eData.max.toFixed(3)); 
            exoDisplay.classList.toggle("text-danger", result.hasMissing.exo[exoIdx]); 
            exoDisplay.classList.toggle("text-dark", !result.hasMissing.exo[exoIdx]); 
        }
    });

    // C. Mise à jour du score global final
    const finalDisplay = document.getElementById('finalScoreDisplay');
    const scoreWrapper = document.getElementById('scoreWrapper'); 
    const scaledDisplayContainer = document.getElementById('scaledScoreContainer');
    
    if (result.isComplete) {
        finalDisplay.innerText = parseFloat(result.total.toFixed(3)); 
        scoreWrapper.className = "score-complete"; 
        finalDisplay.className = ""; 
        if (state.globalScaleTo20 && result.maxPossible > 0) { 
            document.getElementById('scaledScoreDisplay').innerText = parseFloat(((result.total / result.maxPossible) * 20).toFixed(2)); 
            scaledDisplayContainer.style.display = 'inline-block'; 
        } else { 
            scaledDisplayContainer.style.display = 'none'; 
        }
    } else { 
        finalDisplay.innerText = "Incomplet"; 
        scoreWrapper.className = "score-incomplete"; 
        finalDisplay.className = ""; 
        scaledDisplayContainer.style.display = 'none'; 
    }
    updateProgressBar();
}

export function updateStudentNameInList() { 
    const nameInput = document.getElementById('studentName');
    state.students[state.currentIndex].name = nameInput.value; 
    
    if (isAbsent(nameInput.value)) {
        nameInput.classList.remove('bg-tiers-temps');
        nameInput.classList.add('bg-absent');
    } else if (isTiersTemps(nameInput.value)) {
        nameInput.classList.remove('bg-absent');
        nameInput.classList.add('bg-tiers-temps');
    } else {
        nameInput.classList.remove('bg-tiers-temps', 'bg-absent');
    }
    // Mettre à jour le bouton TT selon le nom saisi
    const ttBtn = document.getElementById('btn-mark-tt');
    if (ttBtn) {
        if (isTiersTemps(nameInput.value)) {
            ttBtn.textContent = '⏱️ TT ✓';
            ttBtn.style.backgroundColor = '#5c7fa3';
            ttBtn.style.borderColor = '#5c7fa3';
            ttBtn.style.color = 'white';
        } else {
            ttBtn.textContent = '⏱️ TT';
            ttBtn.style.backgroundColor = '#d4eaf5';
            ttBtn.style.borderColor = '#8bbdd9';
            ttBtn.style.color = '#1a4a6b';
        }
    }
    // Mettre à jour le bouton absent selon le nom saisi
    const absentBtn = document.getElementById('btn-mark-absent');
    const pdfBtn = document.getElementById('btn-generate-pdf');
    if (absentBtn) {
        if (isAbsent(nameInput.value)) {
            absentBtn.textContent = '🚫 ABS ✓';
            absentBtn.classList.replace('btn-outline-secondary', 'btn-secondary');
        } else {
            absentBtn.textContent = '🚫 ABS';
            if (!absentBtn.classList.contains('btn-outline-secondary')) absentBtn.classList.replace('btn-secondary', 'btn-outline-secondary');
        }
    }
    if (pdfBtn) {
        pdfBtn.disabled = isAbsent(nameInput.value);
        pdfBtn.title = isAbsent(nameInput.value) ? 'Élève absent — aucun PDF généré.' : 'Télécharger la copie PDF de cet élève.';
    }
    
    const currentStudent = state.students[state.currentIndex];
    state.students.sort((a, b) => {
        const nameA = (a.name || "").trim();
        const nameB = (b.name || "").trim();
        if (nameA === "" && nameB !== "") return 1;
        if (nameB === "" && nameA !== "") return -1;
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
    });
    state.currentIndex = state.students.indexOf(currentStudent);

    renderStudentList(); 
    saveCurrentState(true); 
    
    const listContainer = document.getElementById('studentList');
    const activeItem = listContainer.querySelector('.active');
    if (activeItem) {
        const containerRect = listContainer.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        const relativeTop = itemRect.top - containerRect.top;
        const scrollPos = listContainer.scrollTop + relativeTop - (listContainer.clientHeight / 2) + (activeItem.clientHeight / 2);
        listContainer.scrollTo({ top: scrollPos });
    }
}

export function generateSkillBilan(student) {
    if (!state.globalShowSkills) return "";

    let res = computeScore(student.scores || {}, state.baremeConfig, isTiersTemps(student.name));
    if (!res.isComplete) return "";

    let skillStats = {}; 
    let hasSkills = false;
    let isTT = isTiersTemps(student.name);

    // MAGIE DU REFACTORING : Le code de parcours est devenu minuscule et limpide !
    forEachQuestion(state.baremeConfig, (q, qId) => {
        if (q.skills && q.skills.length > 0) {
            let sVal = student.scores[qId];
            if (sVal !== "" && sVal !== undefined && sVal !== null) {
                q.skills.forEach(skill => {
                    if (!skillStats[skill]) skillStats[skill] = { pts: 0, max: 0 };
                    skillStats[skill].max += q.max;
                    skillStats[skill].pts += parseFloat(sVal);
                });
            }
        }
    });

    let categories = { acquis: [], encours: [], nonacquis: [] };

    for (const [skill, data] of Object.entries(skillStats)) {
        if (data.max > 0) {
            hasSkills = true;
            let pct = (data.pts / data.max) * 100;
            
            if (pct >= state.globalThresholdAcquis) categories.acquis.push(skill);
            else if (pct >= state.globalThresholdEncours) categories.encours.push(skill);
            else categories.nonacquis.push(skill);
        }
    }

    if (!hasSkills) return "";

    let html = "";
    if (categories.acquis.length > 0) {
        html += `<div class="mb-1"><strong class="skill-acquis">Acquis :</strong><br>`;
        categories.acquis.forEach(s => html += `- ${parseMD(s)}<br>`);
        html += `</div>`;
    }
    if (categories.encours.length > 0) {
        html += `<div class="mb-1"><strong class="skill-encours">En cours d'acquisition :</strong><br>`;
        categories.encours.forEach(s => html += `- ${parseMD(s)}<br>`);
        html += `</div>`;
    }
    if (categories.nonacquis.length > 0) {
        html += `<div class="mb-1"><strong class="skill-nonacquis">Non acquis :</strong><br>`;
        categories.nonacquis.forEach(s => html += `- ${parseMD(s)}<br>`);
        html += `</div>`;
    }
    return html;
}

export function updateAppreciationPreview(isUserTyping = false) {
    const textarea = document.getElementById('appreciation');
    const previewDiv = document.getElementById('appreciation-preview');
    
    if (!previewDiv) return; 

    const text = textarea.value;
    const containsFormatting = text.includes('$') || text.includes('\\(') || (text.match(/\*/g) || []).length >= 2;

    if (text.trim() !== "" && containsFormatting) {
        const wasHidden = previewDiv.style.display === 'none';
        previewDiv.style.display = 'block';
        
        const headerHtml = '<div class="text-muted mb-2 border-bottom pb-1" style="font-size: 0.75em; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">👁️ Aperçu du rendu (LaTeX)</div>';
        previewDiv.innerHTML = headerHtml + '<div>' + parseMD(text) + '</div>'; 

        const keepCommentsInView = () => {
            if (!isUserTyping) return;
            const quickComments = document.getElementById('quickCommentsContainer');
            if (quickComments) {
                quickComments.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        if (wasHidden) keepCommentsInView();

        if (window.MathJax && (text.includes('$') || text.includes('\\('))) {
            if (state.mathJaxTimeout) clearTimeout(state.mathJaxTimeout); 
            
            state.mathJaxTimeout = setTimeout(() => {
                MathJax.typesetPromise([previewDiv]).then(() => {
                    keepCommentsInView();
                }).catch((err) => console.log(err));
            }, 500); 
        }
    } else {
        previewDiv.style.display = 'none';
    }
}

export function loadStudent(index) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    // Aucun élève réel : rien à charger (évite la création d'un élève fantôme)
    if (!state.students.length) return;

    if (index < 0) index = 0;
    if (index >= state.students.length) index = state.students.length - 1;
    
    state.currentIndex = index; 
    const student = state.students[state.currentIndex];
    
    const nameInput = document.getElementById('studentName');
    nameInput.value = student.name || ""; 
    
    if (isAbsent(student.name)) {
        nameInput.classList.remove('bg-tiers-temps');
        nameInput.classList.add('bg-absent');
    } else if (isTiersTemps(student.name)) {
        nameInput.classList.remove('bg-absent');
        nameInput.classList.add('bg-tiers-temps');
    } else {
        nameInput.classList.remove('bg-tiers-temps', 'bg-absent');
    }

    // Bouton TT : libellé et style selon l'état
    const ttBtn = document.getElementById('btn-mark-tt');
    if (ttBtn) {
        if (isTiersTemps(student.name)) {
            ttBtn.textContent = '⏱️ TT ✓';
            ttBtn.style.backgroundColor = '#5c7fa3';
            ttBtn.style.borderColor = '#5c7fa3';
            ttBtn.style.color = 'white';
        } else {
            ttBtn.textContent = '⏱️ TT';
            ttBtn.style.backgroundColor = '#d4eaf5';
            ttBtn.style.borderColor = '#8bbdd9';
            ttBtn.style.color = '#1a4a6b';
        }
    }
    // Bouton Absent : libellé et style selon l'état
    const absentBtn = document.getElementById('btn-mark-absent');
    const pdfBtn = document.getElementById('btn-generate-pdf');
    if (absentBtn) {
        if (isAbsent(student.name)) {
            absentBtn.textContent = '🚫 ABS ✓';
            absentBtn.classList.replace('btn-outline-secondary', 'btn-secondary');
        } else {
            absentBtn.textContent = '🚫 ABS';
            absentBtn.classList.replace('btn-secondary', 'btn-outline-secondary');
        }
    }
    if (pdfBtn) {
        pdfBtn.disabled = isAbsent(student.name);
        pdfBtn.title = isAbsent(student.name) ? 'Élève absent — aucun PDF généré.' : 'Télécharger la copie PDF de cet élève.';
    }
    
    document.getElementById('appreciation').value = student.appreciation || "";

    // Réinitialisation de tous les selects à "?" avant d'appliquer les scores
    document.querySelectorAll('.score-input').forEach(select => { select.value = ""; });

    if (student.scores) {
        for (const [key, val] of Object.entries(student.scores)) {
            const select = document.querySelector(`.score-input[data-id="${key}"]`);
            if (!select) continue;

            // Conversion explicite en chaîne : "" ou valeur invalide → "?" ; nombre → "0.5" etc.
            const strVal = (val === "" || val === null || val === undefined || (typeof val === 'number' && isNaN(val)))
                ? ""
                : String(val);

            select.value = strVal;

            // Vérification que la valeur a bien été acceptée par le select.
            // Si aucune option ne correspond (ex : décalage de précision flottante),
            // on force "" pour afficher "?" plutôt qu'un champ vide.
            if (strVal !== "" && select.value !== strVal) {
                select.value = "";
            }
        }
    }

    // Passe de sécurité finale : tout select dont la valeur ne correspond à aucune option
    // est ramené à "" (affiche "?") — garantit l'absence de champ vide en toutes circonstances.
    document.querySelectorAll('.score-input').forEach(select => {
        const valid = Array.from(select.options).some(o => o.value === select.value);
        if (!valid) select.value = "";
    });

    calculateTotals();
    renderStudentList();

    // 2. Le bilan de compétences est affiché APRÈS (régénération depuis les scores actuels)
    const bilanDiv = document.getElementById('skillBilanDisplay');
    const bilanContent = document.getElementById('skillBilanContent');
    const freshBilan = state.globalShowSkills ? generateSkillBilan(student) : "";
    if (state.globalShowSkills && freshBilan !== "" && bilanContent && bilanDiv) {
        bilanContent.innerHTML = freshBilan;
        bilanDiv.style.display = 'block';
        if (window.MathJax) MathJax.typesetPromise([bilanContent]).catch(err => console.log(err));
    } else if (bilanDiv) {
        bilanDiv.style.display = 'none';
    }
    
    setTimeout(() => {
        const listContainer = document.getElementById('studentList');
        const activeItem = listContainer.querySelector('.active');
        if (activeItem) {
            const containerRect = listContainer.getBoundingClientRect();
            const itemRect = activeItem.getBoundingClientRect();
            const relativeTop = itemRect.top - containerRect.top;
            const scrollPos = listContainer.scrollTop + relativeTop - (listContainer.clientHeight / 2) + (activeItem.clientHeight / 2);
            listContainer.scrollTo({ top: scrollPos }); 
        }
        
        updateAppreciationPreview(false); 

        const scoreInputs = document.querySelectorAll('.score-input');
        let targetInput = null;
        
        for (let input of scoreInputs) {
            if (input.value === "") {
                targetInput = input;
                break;
            }
        }
        
        if (!targetInput && scoreInputs.length > 0) {
            targetInput = scoreInputs[0];
        }
        
        state.isClickFocus = false; 
        
        if (targetInput) {
            targetInput.focus({ preventScroll: true });
            targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, 50);
}

export function toggleTiersTemps() {
    if (!state.students.length || state.currentIndex < 0) return;
    const student = state.students[state.currentIndex];
    if (isTiersTemps(student.name)) {
        student.name = removeTiersTempsBadge(student.name);
    } else {
        student.name = (student.name.trim() + ' (TT)').trim();
    }
    const nameInput = document.getElementById('studentName');
    if (nameInput) nameInput.value = student.name;
    saveCurrentState();
    loadStudent(state.currentIndex);
    state.needsCsvExport = true;
}

export function toggleAbsent() {
    if (!state.students.length || state.currentIndex < 0) return;
    const student = state.students[state.currentIndex];
    if (isAbsent(student.name)) {
        student.name = removeAbsentBadge(student.name);
    } else {
        student.name = (student.name.trim() + ' (ABS)').trim();
    }
    const nameInput = document.getElementById('studentName');
    if (nameInput) nameInput.value = student.name;
    saveCurrentState();
    loadStudent(state.currentIndex);
    state.needsCsvExport = true;
}

export function addNewStudent() { 
    saveCurrentState();
    // Pousse l'élève explicitement avant d'appeler loadStudent
    // (loadStudent retourne désormais immédiatement si la liste est vide)
    state.students.push({ name: "", scores: {}, appreciation: "", skillBilan: "" });
    loadStudent(state.students.length - 1);
    state.needsCsvExport = true; 
}

export async function deleteCurrentStudent() {
    const { showConfirm } = await import('./addons.js');
    const ok = await showConfirm("Voulez-vous vraiment supprimer cet élève ?", "Supprimer l'élève");
    if (!ok) return;
    state.students.splice(state.currentIndex, 1);
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students));
    state.hasUnsavedChanges = false;
    state.needsCsvExport = true;
    renderStudentList();
    if (state.students.length > 0) {
        loadStudent(Math.max(0, state.currentIndex - 1));
    }
}

export async function deleteAllStudents() {
    const { showConfirm } = await import('./addons.js');
    const ok = await showConfirm(
        "ATTENTION : Vous êtes sur le point de supprimer TOUTE la classe.\n\nCette action est irréversible et effacera toutes les notes.\n\nVoulez-vous vraiment continuer ?",
        "Supprimer toute la classe",
        "Tout supprimer"
    );
    if (!ok) return;
    state.students = [];
    localStorage.removeItem(STORAGE_KEYS.DATA);
    state.hasUnsavedChanges = false;
    state.needsCsvExport = false;
    renderStudentList();
    loadStudent(0);
    finalizeFullResetIfEmpty();
}

export function getClassAverage() {
    let maxGlobal = engineCalculateMax(state.baremeConfig);
    if (maxGlobal === 0) return null;

    const validStudents = state.students.filter(s => s.name && s.name.trim() !== "" && !isAbsent(s.name));
    let scores = [];
    
    validStudents.forEach(s => { 
        const res = computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name)); 
        if(res.isComplete) {
            let v = res.total; 
            if(state.globalScaleTo20) v = (v / maxGlobal) * 20; 
            scores.push(v); 
        }
    });

    if (scores.length === 0) return null;
    const sum = scores.reduce((a, b) => a + b, 0);
    return sum / scores.length;
}