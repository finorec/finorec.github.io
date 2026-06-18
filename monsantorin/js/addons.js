import { state, saveCurrentState, saveConfiguration, resetDefaultConfig } from './state.js';
import { loadStudent, calculateTotals, updateAppreciationPreview } from './student.js';
import { computeScore, isTiersTemps, isAbsent, forEachQuestion } from './engine.js';
import { STORAGE_KEYS } from './constants.js';

// Mode IA actif : 'full' (barème complet) ou 'skills-answers' (capacités + réponses)
let _iaMode = 'full';

/**
 * Affiche une modale Bootstrap de confirmation et retourne une Promise<boolean>.
 * Remplace les confirm() natifs (bloquants, non stylisés).
 * @param {string} message - Texte de la question posée à l'utilisateur.
 * @param {string} [title='Confirmation'] - Titre affiché dans l'en-tête de la modale.
 * @param {string} [confirmLabel='Confirmer'] - Libellé du bouton de validation.
 * @param {string} [confirmClass='btn-danger'] - Classe Bootstrap du bouton de validation.
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, title = 'Confirmation', confirmLabel = 'Confirmer', confirmClass = 'btn-danger') {
    return new Promise((resolve) => {
        const modalEl = document.getElementById('confirmModal');
        if (!modalEl) { resolve(window.confirm(message)); return; }

        document.getElementById('confirmModalLabel').textContent = title;
        const bodyEl = document.getElementById('confirmModalBody');
        bodyEl.textContent = '';
        message.split('\n').forEach((line, i) => {
            if (i > 0) bodyEl.appendChild(document.createElement('br'));
            bodyEl.appendChild(document.createTextNode(line));
        });

        const yesBtn = document.getElementById('confirmModalYes');
        yesBtn.textContent = confirmLabel;
        yesBtn.className = `btn ${confirmClass}`;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

        const cleanup = () => {
            yesBtn.removeEventListener('click', onYes);
            document.getElementById('confirmModalNo').removeEventListener('click', onNo);
        };
        const onYes = () => { cleanup(); modal.hide(); resolve(true); };
        const onNo  = () => { cleanup(); modal.hide(); resolve(false); };

        yesBtn.addEventListener('click', onYes);
        document.getElementById('confirmModalNo').addEventListener('click', onNo);
        modal.show();
    });
}

/**
 * Échappe les caractères HTML spéciaux pour éviter les injections XSS.
 * Ne touche pas aux apostrophes pour préserver les contractions françaises.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

/**
 * Échappe une chaîne pour une utilisation sûre dans un attribut HTML (y compris apostrophe).
 * À utiliser pour les attributs : data-raw="...", value="...", title="...", etc.
 */
export function escapeAttr(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return charsToReplace[tag] || tag;
    });
}

/** Supprime le Markdown simple (**gras**, *italique*) pour obtenir du texte brut. */
export function stripMD(text) {
    if (!text) return "";
    return String(text)
        .replace(/\[\[\w+\]\][\s\S]*?\[\[\/\w+\]\]/gi, '[code]')
        .replace(/```[\s\S]*?```/g, '[code]')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*([^\s*](?:.*?[^\s*])?)\*/g, '$1')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\n/g, ' ');
}

/**
 * Convertit un texte Markdown partiel (gras, italique, LaTeX inline) en HTML sécurisé.
 * Les portions non-mathématiques sont passées par escapeHTML avant traitement.
 * @param {string} text
 * @returns {string} HTML prêt pour innerHTML
 */
export function parseMD(text) {
    if (!text) return "";
    let s = convertMsCodeTags(String(text));

    // 1. Extraire les blocs de code délimités (```lang\n...\n```) avant tout traitement
    //    afin que les $ et * à l'intérieur ne soient pas interprétés comme LaTeX ou Markdown.
    const codeBlocks = [];
    s = s.replace(/```([\w+\-.]*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: lang.trim(), code: code.replace(/\r?\n$/, '') });
        return `\u0000CB${idx}\u0000`;
    });

    // 2. Extraire le code inline (`...`) avant tout traitement
    const inlineCodes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(code);
        return `\u0000IC${idx}\u0000`;
    });

    // 3. Traitement LaTeX + Markdown classique (logique inchangée)
    const parts = s.split(/(\$.*?\$|\\\(.*?\\\))/g);
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('$') && !parts[i].startsWith('\\(')) {
            parts[i] = escapeHTML(parts[i])
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^\s*](?:.*?[^\s*])?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
        }
    }
    let result = parts.join('');

    // 4. Restaurer le code inline
    inlineCodes.forEach((code, idx) => {
        result = result.split(`\u0000IC${idx}\u0000`).join(
            `<code class="inline-code">${escapeHTML(code)}</code>`
        );
    });

    // 5. Restaurer les blocs de code
    codeBlocks.forEach((block, idx) => {
        const langLabel = block.lang
            ? `<div class="code-lang-label">${escapeHTML(block.lang)}</div>`
            : '';
        result = result.split(`\u0000CB${idx}\u0000`).join(
            `<div class="code-block-wrapper">${langLabel}<pre class="code-block"><code>${escapeHTML(block.code)}</code></pre></div>`
        );
    });

    return result;
}


/**
 * Ouvre la modale d'aide en chargeant son contenu dynamiquement depuis manuel.html (Option 2)
 */
/**
 * Ouvre la modale d'aide en chargeant son contenu dynamiquement.
 * Fait défiler jusqu'à targetId si l'identifiant est fourni.
 */
export function openHelpModal(targetId = null) {
    const body = document.getElementById('helpModalBody');
    if (!body) return;

    const bsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('helpModal'));

    // Fonction interne pour gérer le défilement et la mise en évidence
    const helpModalEl = document.getElementById('helpModal');
    const scrollToTarget = () => {
        if (!targetId) return;
        const doScroll = () => {
            const targetEl = document.getElementById(targetId);
            const modalBody = document.getElementById('helpModalBody');
            if (!targetEl || !modalBody) return;
            // Ouvre tous les <details> parents pour que l'élément soit visible
            let node = targetEl.parentElement;
            while (node && node !== modalBody) {
                if (node.tagName === 'DETAILS') node.open = true;
                node = node.parentElement;
            }
            setTimeout(() => {
                const offset = targetEl.getBoundingClientRect().top - modalBody.getBoundingClientRect().top;
                modalBody.scrollBy({ top: offset - 10, behavior: 'smooth' });
                targetEl.style.transition = "background-color 0.8s ease";
                targetEl.style.backgroundColor = "#fff3cd";
                setTimeout(() => targetEl.style.backgroundColor = "transparent", 2000);
            }, 50);
        };
        // Si la modale est déjà visible, on scrolle directement
        if (helpModalEl.classList.contains('show')) {
            setTimeout(doScroll, 50);
        } else {
            const onShown = () => {
                helpModalEl.removeEventListener('shown.bs.modal', onShown);
                doScroll();
            };
            helpModalEl.addEventListener('shown.bs.modal', onShown);
        }
    };

    if (body.innerHTML.trim() === "") {
        body.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border text-info" role="status"></div>
                <p class="text-muted mt-2 small">Chargement du mode d'emploi...</p>
            </div>`;
        
        fetch('manuel.html')
            .then(response => {
                if (!response.ok) throw new Error("Le fichier manuel.html est introuvable.");
                return response.text();
            })
            .then(html => {
                // Analyse via DOMParser (les scripts ne s'exécutent PAS à ce stade)
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                // Suppression des éléments actifs
                doc.querySelectorAll('script, style, link, meta, iframe, object, embed').forEach(el => el.remove());
                // Suppression des attributs événements et href javascript:
                doc.querySelectorAll('*').forEach(el => {
                    [...el.attributes].forEach(attr => {
                        if (attr.name.startsWith('on') || (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
                            el.removeAttribute(attr.name);
                        }
                    });
                });
                body.innerHTML = '';
                [...(doc.body || doc.documentElement).childNodes].forEach(node => {
                    body.appendChild(document.importNode(node, true));
                });
                if (window.MathJax) MathJax.typesetPromise([body]).catch(e => console.error(e));
                bsModal.show();
                scrollToTarget();
            })
            .catch(err => {
                body.textContent = '';
                const alert = document.createElement('div');
                alert.className = 'alert alert-danger m-3 small';
                alert.textContent = `❌ Erreur : ${err.message}`;
                body.appendChild(alert);
                bsModal.show();
            });
    } else {
        // Le manuel est déjà chargé en mémoire, on l'affiche et on défile direct !
        bsModal.show();
        scrollToTarget();
    }
}

export function toggleAnswers(checked) {
    let anchor = document.activeElement;
    if (!anchor || !anchor.classList.contains('score-input')) {
        const selects = Array.from(document.querySelectorAll('.score-input'));
        anchor = selects.find(sel => {
            const rect = sel.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
    }
    let offset = anchor ? anchor.getBoundingClientRect().top : 0;

    state.globalShowAnswers = checked;
    localStorage.setItem(STORAGE_KEYS.SHOW_ANSWERS, checked); // UTILISATION DE LA CONSTANTE
    if (checked) document.body.classList.add('show-answers');
    else document.body.classList.remove('show-answers');

    if (anchor) {
        const newRect = anchor.getBoundingClientRect();
        window.scrollBy(0, newRect.top - offset);
    }
}

export function renderGradingForm() {
    const container = document.getElementById('gradingArea'); 
    if (!container) return;
    
    // On vide proprement le conteneur principal
    container.innerHTML = '';
    const configBtn = document.getElementById('btn-config-modal');
    const titleGroup = document.getElementById('title-edit-group');

    if (state.baremeConfig.length === 0) {
        if (configBtn) configBtn.classList.add('pulse-button');
        if (titleGroup) titleGroup.classList.add('pulse-title-group');
        container.innerHTML = `
            <div class="empty-state-container">
                <img src="MonSantorin.webp" alt="Logo MonSantorin" style="max-height: 80px; opacity: 0.5; margin-bottom: 1.5rem; filter: grayscale(1);">
                <h3 class="mb-3">Prêt à corriger ?</h3>
                <p>Votre barème est actuellement vide. Suivez ces étapes :</p>
                <div class="d-flex flex-wrap justify-content-center gap-3 mt-4">
                    <div class="card p-3 shadow-sm" style="width: 180px;">
                        <span class="badge bg-primary rounded-circle mb-2 mx-auto" style="width: 30px; height: 30px; line-height: 20px;">1</span>
                        <small class="fw-bold">Renommez votre évaluation, configurez le barème et enregistrez-le</small>
                    </div>
                    <div class="card p-3 shadow-sm" style="width: 180px;">
                        <span class="badge bg-primary rounded-circle mb-2 mx-auto" style="width: 30px; height: 30px; line-height: 20px;">2</span>
                        <small class="fw-bold">Importez vos élèves ou ajoutez-les manuellement</small>
                    </div>
                    <div class="card p-3 shadow-sm" style="width: 180px;">
                        <span class="badge bg-primary rounded-circle mb-2 mx-auto" style="width: 30px; height: 30px; line-height: 20px;">3</span>
                        <small class="fw-bold">Notez et sauvegardez&nbsp;!</small>
                    </div>
                    <div class="card p-3 shadow-sm" style="width: 180px;">
                        <span class="badge bg-primary rounded-circle mb-2 mx-auto" style="width: 30px; height: 30px; line-height: 20px;">4</span>
                        <small class="fw-bold">Communiquez les notes et les fiches d'évaluation (PDF)</small>
                    </div>
                </div>
            </div>`;
        return;
    }

    if (configBtn) configBtn.classList.remove('pulse-button');
    if (titleGroup) titleGroup.classList.remove('pulse-title-group');

    // Récupération des gabarits (templates)
    const tExo = document.getElementById('template-grading-exo');
    const tPart = document.getElementById('template-grading-part');
    const tQ = document.getElementById('template-grading-question');

    // Un DocumentFragment sert de conteneur virtuel en mémoire vive (ultra rapide)
    const fragment = document.createDocumentFragment();

    // Fonction interne pour générer les nœuds de questions
    const createQuestionNode = (q, qId) => {
        const clone = tQ.content.cloneNode(true);
        
        // Remplissage du texte et rendu Markdown
        const labelEl = clone.querySelector('.grading-q-label-text');
        labelEl.innerHTML = `${formatMD(q.label)} <small class="text-muted fst-italic fw-bold ms-1">(/${q.max})</small>`;
        
        // Configuration du Select
        const select = clone.querySelector('.score-input');
        select.setAttribute('data-id', qId);
        
        // Création dynamique des options (optimisée)
        let optionsHtml = `<option value="" selected>?</option><option value="0">0</option>`;
        const step = (q.step && q.step > 0) ? q.step : 0.25;
        for (let i = step; i <= q.max + 0.0001; i += step) { 
            const val = Math.round(i * 1000) / 1000; 
            optionsHtml += `<option value="${val}">${val}</option>`; 
        }
        select.innerHTML = optionsHtml;
        
        // Gestion de la réponse type indicative
        if (q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== "") {
            const hintDiv = clone.querySelector('.answer-hint');
            const answerSpan = clone.querySelector('.grading-q-answer-text');
            answerSpan.innerHTML = `Rép : ${formatMD(String(q.answer))}`;
            hintDiv.classList.remove('d-none');
        }
        
        return clone;
    };

    // Parcours du barème et assemblage
    state.baremeConfig.forEach((exo, exoIdx) => {
        const exoClone = tExo.content.cloneNode(true);
        
        // Titre et ID du total de l'exercice
        exoClone.querySelector('.grading-exo-title').innerHTML = parseMD(exo.title);
        const totalExoSpan = exoClone.querySelector('.grading-exo-total');
        totalExoSpan.id = `total-exo-${exoIdx}`;
        
        const exoContent = exoClone.querySelector('.grading-exo-content');

        if (exo.parts) { 
            // Cas d'un exercice découpé en parties (Partie A, Partie B...)
            exo.parts.forEach((part, partIdx) => { 
                const partClone = tPart.content.cloneNode(true);
                
                partClone.querySelector('.grading-part-name').innerHTML = parseMD(part.name);
                const totalPartSpan = partClone.querySelector('.grading-part-total');
                totalPartSpan.id = `total-part-${exoIdx}-${partIdx}`;
                
                const partContent = partClone.querySelector('.grading-part-content');
                
                part.questions.forEach((q, qIdx) => { 
                    partContent.appendChild(createQuestionNode(q, `e${exoIdx}-p${partIdx}-q${qIdx}`)); 
                });
                
                exoContent.appendChild(partClone);
            }); 
        } else if (exo.questions) { 
            // Cas classique sans sous-partie
            exo.questions.forEach((q, qIdx) => { 
                exoContent.appendChild(createQuestionNode(q, `e${exoIdx}-q${qIdx}`)); 
            }); 
        }
        
        fragment.appendChild(exoClone);
    });
    
    // On injecte d'un seul coup tout notre arbre d'éléments propres dans la page
    container.appendChild(fragment);
    
    // Traitement fluide des formules mathématiques par MathJax
    if (window.MathJax) {
        MathJax.typesetPromise().then(() => {
            document.querySelectorAll('mjx-container, mjx-assistive-mml').forEach(node => node.setAttribute('tabindex', '-1'));
        });
    }
}

export function renderQuickComments() {
    const container = document.getElementById('quickCommentsContainer');
    if (!container) return;
    
    let html = `<div class="d-flex justify-content-between align-items-baseline mb-1">
                    <small class="text-muted">Commentaires rapides :</small>
                    <button id="btn-edit-quick-comments" class="btn btn-sm btn-outline-secondary border-0 p-0 px-1" title="Modifier la liste des commentaires rapides"><small>✏️ Modifier</small></button>
                </div><div id="quick-comments-list">`;
    
    if (state.globalQuickComments.length === 0) {
        html += `<small class="text-muted fst-italic">Aucun commentaire configuré.</small>`;
    } else {
        state.globalQuickComments.forEach(comment => {
            const escaped = escapeHTML(comment);
            let shortLabel = comment.length > 25 ? escapeHTML(comment.substring(0, 22)) + '...' : escaped;
            html += `<span class="badge bg-light text-dark border quick-comment me-1 mb-1" role="button" tabindex="0" data-comment="${escaped}" title="${escaped}">${shortLabel}</span> `;
        });
    }
    html += `</div>`;
    container.innerHTML = html;
    
    document.getElementById('btn-edit-quick-comments')?.addEventListener('click', openEditQuickCommentsModal);
    document.querySelectorAll('.quick-comment').forEach(badge => {
        badge.addEventListener('click', (e) => addComment(e.target.dataset.comment));
        badge.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addComment(e.target.dataset.comment); }
        });
    });
}

export function openStatsModal() {
    let scores = []; let completedCount = 0; let maxGlobal = 0;
    
    state.baremeConfig.forEach(exo => { 
        if(exo.parts) exo.parts.forEach(p => p.questions.forEach(q => maxGlobal += q.max)); 
        if(exo.questions) exo.questions.forEach(q => maxGlobal += q.max); 
    });
    
    const scaleInfoEl = document.getElementById('stat-scale-info');
    if (scaleInfoEl) scaleInfoEl.style.display = state.globalScaleTo20 ? 'block' : 'none';
    
    const validStudents = state.students.filter(s => s.name && String(s.name).trim() !== "" && !isAbsent(s.name));
    
    validStudents.forEach(s => { 
        const res = computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name)); 
        if(res.isComplete) {
            let v = res.total; 
            if(state.globalScaleTo20 && maxGlobal>0) v = (v/maxGlobal)*20; 
            scores.push(v); 
            completedCount++;
        }
    });

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };

    const cnt = scores.length; 
    if (cnt === 0) { 
        set('stat-avg', "--"); set('stat-median', "--"); set('stat-min', "--"); set('stat-max', "--"); set('stat-sd', "--"); set('stat-iqr', "--"); set('stat-q1', "--"); set('stat-q3', "--"); 
    } else {
        const sum = scores.reduce((a, b) => a + b, 0); const avg = sum / cnt; set('stat-avg', avg.toFixed(2));
        const sqDiff = scores.map(v => Math.pow(v - avg, 2)); const stdDev = Math.sqrt(sqDiff.reduce((a, b) => a + b, 0) / cnt); set('stat-sd', stdDev.toFixed(2));
        scores.sort((a, b) => a - b);
        let median = (cnt % 2 === 0) ? (scores[cnt/2 - 1] + scores[cnt/2]) / 2 : scores[Math.floor(cnt/2)]; set('stat-median', median.toFixed(2));
        set('stat-min', scores[0].toFixed(2)); set('stat-max', scores[cnt - 1].toFixed(2));
        const getQ = (arr, q) => { const pos = (arr.length - 1) * q; const base = Math.floor(pos); const rest = pos - base; return (arr[base + 1] !== undefined) ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base]; };
        const q1 = getQ(scores, 0.25); const q3 = getQ(scores, 0.75); 
        set('stat-iqr', (q3 - q1).toFixed(2)); set('stat-q1', q1.toFixed(2)); set('stat-q3', q3.toFixed(2));
    }
    
    set('stat-count', cnt); set('stat-completed', completedCount); set('stat-total', state.students.length);
    
    let chartLabels = []; let chartData = []; let chartColors = []; let chartBorders = [];
    const colorItemBg = 'rgba(54, 162, 235, 0.6)'; const colorItemBd = 'rgba(54, 162, 235, 1)';
    const colorExoBg = 'rgba(255, 159, 64, 0.6)'; const colorExoBd = 'rgba(255, 159, 64, 1)';
    const colorPartBg = 'rgba(75, 192, 192, 0.6)'; const colorPartBd = 'rgba(75, 192, 192, 1)';

    const getStatsForQuestions = (qList) => {
        let sumPts = 0; let sumMax = 0;
        validStudents.forEach(s => {
            let studentPts = 0; let studentMax = 0;
            
            qList.forEach(item => {
                const val = s.scores[item.id];
                if(val !== "" && val !== undefined && val !== null) {
                    studentPts += parseFloat(val);
                    studentMax += item.max;
                }
            });
            
            if (studentMax > 0) {
                sumPts += studentPts; sumMax += studentMax;
            }
        });
        if(sumMax === 0) return 0;
        return parseFloat(((sumPts / sumMax) * 100).toFixed(1));
    };

    state.baremeConfig.forEach((exo, eIdx) => {
        let allExoQuestions = [];
        if(exo.parts) {
            exo.parts.forEach((p, pIdx) => { p.questions.forEach((q, qIdx) => { allExoQuestions.push({id: `e${eIdx}-p${pIdx}-q${qIdx}`, max: q.max}); }); });
        } else if (exo.questions) {
            exo.questions.forEach((q, qIdx) => { allExoQuestions.push({id: `e${eIdx}-q${qIdx}`, max: q.max}); });
        }

        chartLabels.push(`TOTAL ${stripMD(exo.title)}`);
        chartData.push(getStatsForQuestions(allExoQuestions));
        chartColors.push(colorExoBg); chartBorders.push(colorExoBd);

        if (exo.parts) {
            exo.parts.forEach((part, pIdx) => {
                let partQuestions = [];
                part.questions.forEach((q, qIdx) => { partQuestions.push({id: `e${eIdx}-p${pIdx}-q${qIdx}`, max: q.max}); });

                let pName = stripMD(part.name); if(pName.length > 15) pName = pName.substring(0, 12) + "...";
                chartLabels.push(`Ex ${eIdx + 1} - ${pName}`);
                chartData.push(getStatsForQuestions(partQuestions));
                chartColors.push(colorPartBg); chartBorders.push(colorPartBd);

                part.questions.forEach((q, qIdx) => {
                    let labelClean = stripMD(q.label);
                    chartLabels.push(labelClean.length > 15 ? labelClean.substring(0, 12)+"..." : labelClean);
                    chartData.push(getStatsForQuestions([{id: `e${eIdx}-p${pIdx}-q${qIdx}`, max: q.max}]));
                    chartColors.push(colorItemBg); chartBorders.push(colorItemBd);
                });
            });
        } else if (exo.questions) {
            exo.questions.forEach((q, qIdx) => {
                let labelClean = stripMD(q.label);
                chartLabels.push(labelClean.length > 15 ? labelClean.substring(0, 12)+"..." : labelClean);
                chartData.push(getStatsForQuestions([{id: `e${eIdx}-q${qIdx}`, max: q.max}]));
                chartColors.push(colorItemBg); chartBorders.push(colorItemBd);
            });
        }
    });

    const ctx = document.getElementById('questionsChart');
    if (ctx) {
        if (state.statsChartInstance) state.statsChartInstance.destroy();
        state.statsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: chartLabels, datasets: [{ label: 'Réussite (%)', data: chartData, backgroundColor: chartColors, borderColor: chartBorders, borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '%' } }, x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 45 } } }, plugins: { tooltip: { callbacks: { label: function(context) { return context.raw + ' % de réussite moyenne'; } } } } }
        });
    }

    const modalEl = document.getElementById('statsModal');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

export function addComment(text) {
    const textarea = document.getElementById('appreciation');
    const startPos = textarea.selectionStart; const endPos = textarea.selectionEnd; const currentVal = textarea.value;

    let prefix = (startPos > 0 && currentVal[startPos - 1] !== ' ' && currentVal[startPos - 1] !== '\n') ? " " : "";
    let suffix = (text.endsWith('.') && (endPos === currentVal.length || (currentVal[endPos] !== ' ' && currentVal[endPos] !== '\n'))) ? " " : "";

    const textToInsert = prefix + text + suffix;
    textarea.value = currentVal.substring(0, startPos) + textToInsert + currentVal.substring(endPos);

    const newPos = startPos + textToInsert.length;
    textarea.selectionStart = newPos; textarea.selectionEnd = newPos;

    saveCurrentState();
    textarea.focus({ preventScroll: true });
    updateAppreciationPreview(true); 
}

export function openEditQuickCommentsModal() {
    document.getElementById('editQC_textarea').value = state.globalQuickComments.join('\n');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editQuickCommentsModal')).show();
}

export function saveQuickCommentsFromModal() {
    const text = document.getElementById('editQC_textarea').value;
    state.globalQuickComments = text.split('\n').map(s => s.trim()).filter(s => s !== "");
    localStorage.setItem(STORAGE_KEYS.QUICK_COMMENTS, JSON.stringify(state.globalQuickComments)); // UTILISATION DE LA CONSTANTE
    renderQuickComments();
    bootstrap.Modal.getInstance(document.getElementById('editQuickCommentsModal')).hide();
}

const GEMINI_CHIP_RE = /https?:\/\/googleusercontent\.com\/immersive_entry_chip\/\d+/i;

function _formatCodeBlock(lang, code) {
    const c = String(code).replace(/\r?\n$/, '');
    return lang ? '```' + lang + '\n' + c + '\n```' : '```\n' + c + '\n```';
}

/** Convertit les séquences littérales \\n (ex. JSON ChatGPT) en vrais sauts de ligne — usage code uniquement. */
function unescapeLiteralEscapes(text) {
    return String(text).replace(/\\n/g, '\n');
}

/** Convertit les balises MonSantorin [[python]]…[[/python]] en blocs markdown internes. */
export function convertMsCodeTags(text) {
    if (!text) return '';
    return String(text).replace(
        /\[\[(\w+)\]\]\r?\n?([\s\S]*?)\[\[\/\w+\]\]/gi,
        (_, lang, code) => _formatCodeBlock(lang.toLowerCase(), unescapeLiteralEscapes(code))
    );
}

const _CODE_LANG_HINTS = [
    { lang: 'sql', re: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|FROM|WHERE|JOIN)\b/i },
    { lang: 'python', re: /\b(def |import |for .+ in |elif |print\(|while )\b/ },
    { lang: 'javascript', re: /\b(function |const |let |=>|console\.log)\b/ },
    { lang: 'html', re: /<(!DOCTYPE|html|div|body|head)\b/i },
];

function _detectCodeLang(text) {
    for (const { lang, re } of _CODE_LANG_HINTS) {
        if (re.test(text)) return lang;
    }
    return 'python';
}

function _looksLikeCode(text) {
    if (!text || typeof text !== 'string') return false;
    const s = text.trim();
    if (!s || /^```/.test(s)) return false;
    if (/\$[^$]+\$/.test(s) && !/\b(def |import |SELECT |CREATE TABLE)\b/i.test(s)) return false;
    if (/\b(def |import |class |for \w+ in |elif |while |print\(|SELECT |INSERT |CREATE TABLE|UPDATE |DELETE FROM|function |const |let |#include)\b/i.test(s)) return true;
    if (/\b(if |return )\b/.test(s) && /[=<>()[\];]/.test(s)) return true;
    if (/^[\t ]{4}\S/m.test(s)) return true;
    return /\n/.test(s) && /\n[ \t]+\S/.test(s);
}

/**
 * Prépare un texte pour affichage code : balises [[lang]] d'abord, heuristique en secours.
 */
export function wrapCodeText(value) {
    if (!value || typeof value !== 'string') return value;
    const converted = convertMsCodeTags(value);
    const trimmed = converted.trim();
    if (!trimmed) return value;
    if (/```/.test(converted)) return converted;
    if (!_looksLikeCode(trimmed)) return converted;
    return _formatCodeBlock(_detectCodeLang(trimmed), unescapeLiteralEscapes(trimmed));
}

/** Markdown enrichi : détection code + rendu HTML (LaTeX, gras, blocs code…). */
export function formatMD(text) {
    return parseMD(wrapCodeText(text));
}

function _stripOuterJsonFence(text) {
    let t = text.trim();
    t = t.replace(/^```(?:json)?\s*\r?\n?/i, '');
    t = t.replace(/\r?\n?```\s*$/i, '');
    return t.trim();
}

/** Convertit les réponses code texte brut (\\n) en blocs markdown pour l'affichage MonSantorin. */
function normalizeIABarèmeCodeAnswers(exercises) {
    forEachQuestion(exercises, (q) => {
        if (q.answer !== undefined) q.answer = wrapCodeText(q.answer);
        if (q.label !== undefined) q.label = wrapCodeText(q.label);
    });
}

function _isTruncatedGeminiJson(text) {
    const trimmed = text.trim();
    if (/"answer"\s*:\s*"$/.test(trimmed)) return true;
    const opens = (trimmed.match(/\[/g) || []).length;
    const closes = (trimmed.match(/\]/g) || []).length;
    return opens > closes;
}

const _CODE_IA_RULE = 'CODE INFORMATIQUE : Si un "label" ou un "answer" contient du code source (Python, SQL, JavaScript, HTML, C, etc.), encadre-le OBLIGATOIREMENT avec les balises MonSantorin [[lang]]...[[/lang]] (lang = python, sql, javascript, html…). Utilise \\\\n pour les retours à la ligne à l\'intérieur. INTERDIT ABSOLU : accents graves (backticks), blocs markdown ``` et Canvas. Exemple : "answer": "[[python]]def ma_fonction():\\\\n    return 42[[/python]]" ou "answer": "[[sql]]SELECT nom FROM animal WHERE age > 5;[[/sql]]".';
const _NO_CANVAS_RULE = 'INTERDIT CANVAS : N\'utilise JAMAIS de blocs Canvas, Immersive, Documents ou Artefacts. Ne génère JAMAIS de liens googleusercontent.com. Le JSON doit rester complet et valide du début à la fin, même pour les réponses contenant du code.';

function _extractCodeBlocksFromPaste(plain, html) {
    const blocks = [];
    const seen = new Set();

    const addBlock = (lang, code) => {
        const formatted = _formatCodeBlock(lang, code);
        const key = formatted.slice(0, 80);
        if (!seen.has(key)) { seen.add(key); blocks.push(formatted); }
    };

    let m;
    const immersiveRe = /<immersive[^>]*>[\s\S]*?```(\w*)\r?\n([\s\S]*?)```[\s\S]*?<\/immersive>/gi;
    while ((m = immersiveRe.exec(plain)) !== null) addBlock(m[1], m[2]);

    const fenceRe = /```(\w*)\r?\n([\s\S]*?)```/g;
    while ((m = fenceRe.exec(plain)) !== null) {
        if (m[1].toLowerCase() === 'json') continue;
        addBlock(m[1], m[2]);
    }

    if (html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            for (const pre of doc.querySelectorAll('pre')) {
                const codeEl = pre.querySelector('code');
                const raw = (codeEl || pre).textContent || '';
                const trimmed = raw.trim();
                if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith('{')) continue;
                const langMatch = codeEl?.className?.match(/language-(\w+)/);
                addBlock(langMatch ? langMatch[1] : '', trimmed);
            }
        } catch { /* ignore */ }
    }

    return blocks;
}

/** Nettoie les artefacts Canvas/Gemini (immersive_entry_chip) dans une réponse IA collée. */
export function sanitizeIAPasteText(plain, html) {
    if (!plain) return '';
    let text = plain.replace(/\r\n/g, '\n');
    text = text.replace(/<immersive[^>]*>([\s\S]*?)<\/immersive>/gi, '$1');

    if (!GEMINI_CHIP_RE.test(text)) return text;

    const codeBlocks = _extractCodeBlocksFromPaste(plain, html);
    let blockIdx = 0;
    text = text.replace(/https?:\/\/googleusercontent\.com\/immersive_entry_chip\/\d+\s*/gi, () => {
        if (blockIdx < codeBlocks.length) return codeBlocks[blockIdx++] + '\n';
        return '';
    });

    return text.trim();
}

export function handleIAPasteEvent(e) {
    const plain = e.clipboardData?.getData('text/plain') || '';
    const html = e.clipboardData?.getData('text/html') || '';
    const sanitized = sanitizeIAPasteText(plain, html);
    if (sanitized === plain) return;

    e.preventDefault();
    const textarea = e.target;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + sanitized + textarea.value.slice(end);
    const pos = start + sanitized.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
}

const _instructionsFull = `
<ol style="line-height:1.8;" class="mb-0">
  <li class="mb-1">Ouvrez votre IA favorite dans un nouvel onglet.</li>
  <li class="mb-1">Collez le prompt (Ctrl+V). Vous pouvez ajouter vos propres consignes supplémentaires à la suite.</li>
  <li class="mb-1 text-danger fw-bold">⚠️ Joignez votre <strong>sujet</strong> en pièce jointe (.pdf, .docx, .tex...).<br>
    <span class="fw-normal">💡 Vous pouvez aussi joindre votre <strong>corrigé</strong> — l'IA extraira les réponses exactes plutôt que de les résoudre elle-même.</span></li>
  <li class="mb-1">Validez et attendez la réponse de l'IA.</li>
  <li>Copiez la réponse de votre IA et <strong>collez-la dans le champ ci-dessous</strong> (Ctrl+V).</li>
</ol>`;

const _instructionsSkillsAnswers = `
<ol style="line-height:1.8;" class="mb-0">
  <li class="mb-1">Ouvrez votre IA favorite dans un nouvel onglet.</li>
  <li class="mb-1">Collez le prompt (Ctrl+V). Vous pouvez ajouter vos propres consignes supplémentaires à la suite.</li>
  <li class="mb-1 text-danger fw-bold">⚠️ Joignez votre <strong>sujet</strong> en pièce jointe (.pdf, .docx, .tex...).</li>
  <li class="mb-1">Validez et attendez la réponse de l'IA.</li>
  <li>Copiez la réponse de votre IA et <strong>collez-la dans le champ ci-dessous</strong> (Ctrl+V).</li>
</ol>`;

function _showAiGuideModal(mode) {
    _iaMode = mode;
    const instructionsDiv = document.getElementById('ai-guide-instructions');
    if (instructionsDiv) instructionsDiv.innerHTML = mode === 'full' ? _instructionsFull : _instructionsSkillsAnswers;
    const textarea = document.getElementById('ia-response-textarea');
    if (textarea) textarea.value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('aiGuideModal')).show();
}

export function generateIAPrompt() {
    if (!state.baremeConfig || state.baremeConfig.length === 0) {
        alert("❌ Le barème est vide.\n\nSaisissez d'abord la structure du barème manuellement (exercices et questions), puis utilisez ce bouton pour que l'IA ajoute les capacités attendues et les réponses.");
        return;
    }
    const configJson = JSON.stringify(state.baremeConfig, null, 2);
    const prompt = `Je suis professeur. Voici la structure du barème de mon prochain devoir au format JSON :\n\n${configJson}\n\n---\nINSTRUCTIONS OBLIGATOIRES :\n1. Analyse le sujet de mon contrôle que je t'ai joint en pièce jointe (fichier pdf, docx ou tex) pour identifier la discipline.\n2. Rapprochement Sujet/Barème : Regarde attentivement le début du "label" de chaque question du barème. Cherche cette numérotation dans le sujet pour faire la correspondance.\n3. Ajout des capacités attendues : Si le "label" correspond à une vraie question du sujet, ajoute une propriété "skills": ["..."] avec des CAPACITÉS ATTENDUES (savoir-faire) DISCIPLINAIRES TRÈS PRÉCISES (ex: SVT, Histoire, Physique, Maths...). (S'il s'agit d'un ajout du type "Soin", n'ajoute pas de capacité attendue).\n4. Ajout de la Réponse : Ajoute une propriété "answer" à chaque question.\n   - Si je te fournis le Sujet ET le Corrigé : extrais l'élément clé de la réponse du corrigé pour remplir cette case.\n   - Si je te fournis UNIQUEMENT le Sujet : résous brièvement chaque question pour trouver la réponse finale et remplis cette case (ex: "answer": "x = -5" ou "answer": "Fonction décroissante").\n   - ⚠️ CAS DES TABLEAUX : S'il est demandé de faire ou remplir un tableau (signes, variations, probabilités...), la réponse DOIT contenir le tableau entier formaté en LaTeX avec l'environnement \\begin{array} ... \\end{array} (encadré par $), au lieu de faire des phrases descriptives.\n5. LaTeX : Formate les variables et expressions avec du code LaTeX encadré par le symbole $ UNIQUEMENT LORSQUE C'EST PERTINENT selon la matière (Maths, Physique-Chimie...), aussi bien pour les labels que pour les "answer". N'utilise QUE des commandes nativement supportées par MathJax (ex: \\vec, \\overrightarrow, \\frac, \\sqrt, \\cdot, \\times...). N'utilise JAMAIS de macros non standard (ex: \\vect est interdit — utilise \\overrightarrow à la place ; \\R, \\N et \\Z sont interdits — utilise \\mathbb{R}, \\mathbb{N} et \\mathbb{Z} à la place). Pour les limites, utilise toujours \\lim\\limits_{} plutôt que \\lim_{}.\n6. ${_CODE_IA_RULE}\n7. ${_NO_CANVAS_RULE}\n8. NE MODIFIE PAS les propriétés "max", "step", "label", "title" et "name". Renvoie UNIQUEMENT le JSON complet dans un bloc de code, sans aucune phrase d\'introduction ni d\'explications.`;
    navigator.clipboard.writeText(prompt).then(() => _showAiGuideModal('skills-answers')).catch(() => alert("Erreur copie presse-papier."));
}

export function generateFullBarèmePrompt() {
    const step = document.getElementById('conf-ai-step')?.value || "0.25";
    const prompt = `Je suis professeur expert. Je veux que tu génères le barème complet au format JSON pour mon logiciel de correction.\n\nINSTRUCTIONS OBLIGATOIRES :\n1. Analyse le ou les fichiers en pièce jointe et détecte la matière, les exercices, les parties (A, B...) et les questions.\n2. Déduis un barème détaillé. Si un nombre de points est indiqué à côté d'un exercice, la somme des points ("max") des questions doit être EXACTEMENT égale à ce total.\n3. Utilise "step": ${step} par défaut pour toutes les questions. Pour le "label", sois très court et mets systématiquement la numérotation en gras avec des doubles astérisques (ex: "**1.a.** Dérivée").\n4. Capacités attendues : Ajoute un tableau "skills" pour chaque question avec des CAPACITÉS ATTENDUES (savoir-faire) DISCIPLINAIRES TRÈS PRÉCISES adaptées à la matière.\n5. Réponses : Ajoute une propriété "answer" à chaque question.\n   - Si je t'ai fourni le Sujet ET le Corrigé : extrais l'élément clé de la réponse de mon corrigé.\n   - Si je t'ai fourni UNIQUEMENT le Sujet : résous brièvement la question pour trouver la réponse finale (ex: "answer": "v = 12,5 m/s").\n   - ⚠️ CAS DES TABLEAUX : S'il est demandé de faire ou remplir un tableau (signes, variations, probabilités...), la réponse DOIT contenir le tableau entier formaté en LaTeX avec l'environnement \\begin{array} ... \\end{array} (encadré par $), au lieu de faire des phrases descriptives.\n6. LaTeX : Formate les variables et expressions avec du code LaTeX encadré par le symbole $ UNIQUEMENT LORSQUE C'EST PERTINENT selon la matière (Maths, Physique-Chimie...), aussi bien pour le "label" que pour le "answer". N'utilise QUE des commandes nativement supportées par MathJax (ex: \\vec, \\overrightarrow, \\frac, \\sqrt, \\cdot, \\times...). N'utilise JAMAIS de macros non standard (ex: \\vect est interdit — utilise \\overrightarrow à la place ; \\R, \\N et \\Z sont interdits — utilise \\mathbb{R}, \\mathbb{N} et \\mathbb{Z} à la place). Pour les limites, utilise toujours \\lim\\limits_{} plutôt que \\lim_{}.\n7. ${_CODE_IA_RULE}\n8. ${_NO_CANVAS_RULE}\n9. Renvoie UNIQUEMENT le code JSON dans un bloc de code, sans aucune phrase d\'introduction.\n\nVOICI LE FORMAT JSON STRICT ATTENDU :\n[\n  {\n    "title": "Exercice 1 : Titre court",\n    "parts": [\n      {\n        "name": "Partie A",\n        "questions": [\n          { "label": "**1.a.** Mot clé", "answer": "x = 4", "max": 1, "step": 0.25, "skills": ["Capacité attendue précise"] },\n          { "label": "**1.b.** Boucle Python", "answer": "[[python]]compteur = 0\\nfor caractere in une_chaine:\\n    if caractere == une_lettre:\\n        compteur += 1[[/python]]", "max": 2, "step": 0.25, "skills": ["Programmer une boucle"] }\n        ]\n      }\n    ]\n  }\n]`;
    navigator.clipboard.writeText(prompt).then(() => _showAiGuideModal('full')).catch(() => alert("Erreur copie presse-papier."));
}

export async function pasteIAResult() {
    const textarea = document.getElementById('ia-response-textarea');
    let text = textarea ? sanitizeIAPasteText(textarea.value, '').trim() : '';
    if (!text) {
        alert('❌ Le champ est vide.\n\nCopiez la réponse de votre IA et collez-la dans le champ texte (Ctrl+V), puis cliquez sur « Valider et appliquer ».');
        return false;
    }

    if (GEMINI_CHIP_RE.test(text)) {
        alert('❌ Réponse Gemini invalide : des liens Canvas (googleusercontent.com/immersive_entry_chip) sont encore présents.\n\nGemini a ouvert un document séparé au lieu d\'écrire le code dans le JSON.\n\n➡️ Demandez à Gemini : « Réécris le JSON complet sans Canvas, avec le code Python/SQL directement dans les champs answer ».\n➡️ Copiez ensuite uniquement le bloc json (bouton Copier du bloc de code).');
        return false;
    }

    // Retirer uniquement l'enveloppe ```json ... ``` (pas les blocs code dans les réponses)
    text = _stripOuterJsonFence(text);

    let exercises;
    try {
        const json = JSON.parse(text);
        exercises = Array.isArray(json) ? json : json.exercises;
    } catch {
        const geminiHint = _isTruncatedGeminiJson(text)
            ? '\n\n⚠️ Gemini : le JSON semble coupé à un champ "answer" contenant du code.\nRégénérez le prompt MonSantorin (il demande du code avec \\n, sans accents graves) et relancez Gemini.\nSinon, utilisez ChatGPT pour les devoirs avec du code.'
            : '';
        alert("❌ Le texte collé n'est pas un JSON valide.\n\nVérifiez que vous avez bien copié toute la réponse de l'IA (y compris les accolades et crochets)." + geminiHint);
        return false;
    }

    normalizeIABarèmeCodeAnswers(exercises);

    if (!Array.isArray(exercises) || exercises.length === 0) {
        alert("❌ Structure non reconnue : le JSON ne contient pas de tableau d'exercices MonSantorin.\n\nAssurez-vous que la réponse de l'IA respecte bien le format demandé.");
        return false;
    }

    // Validation structurelle commune
    for (const exo of exercises) {
        if (exo.parts) {
            for (const part of exo.parts) {
                if (!Array.isArray(part.questions)) {
                    alert(`❌ JSON invalide : la partie « ${part.name || '?'} » ne contient pas de tableau « questions ».`);
                    return false;
                }
            }
        } else if (!Array.isArray(exo.questions)) {
            alert(`❌ JSON invalide : l'exercice « ${exo.title || '?'} » ne contient pas de tableau « questions ».`);
            return false;
        }
    }

    if (_iaMode === 'skills-answers') {
        const current = state.baremeConfig;
        if (!current || current.length === 0) {
            alert("❌ Aucun barème actuel à compléter.\n\nUtilisez d'abord « Créer barème & capacités » pour générer un barème complet.");
            return false;
        }
        if (exercises.length !== current.length) {
            alert(`❌ Structure incompatible : le barème actuel a ${current.length} exercice(s), la réponse de l'IA en contient ${exercises.length}.`);
            return false;
        }
        for (let eIdx = 0; eIdx < current.length; eIdx++) {
            const curExo = current[eIdx];
            const newExo = exercises[eIdx];
            const nom = `Exercice ${eIdx + 1} « ${curExo.title || '?'} »`;
            if (curExo.parts && newExo.parts) {
                if (curExo.parts.length !== (newExo.parts || []).length) {
                    alert(`❌ Structure incompatible dans ${nom} : nombre de parties différent.`); return false;
                }
                for (let pIdx = 0; pIdx < curExo.parts.length; pIdx++) {
                    const cq = curExo.parts[pIdx].questions.length;
                    const nq = (newExo.parts[pIdx]?.questions || []).length;
                    if (cq !== nq) {
                        alert(`❌ Structure incompatible dans ${nom}, partie « ${curExo.parts[pIdx].name || '?'} » : ${cq} question(s) attendue(s), ${nq} reçue(s).`); return false;
                    }
                }
            } else if (curExo.questions && newExo.questions) {
                if (curExo.questions.length !== newExo.questions.length) {
                    alert(`❌ Structure incompatible dans ${nom} : ${curExo.questions.length} question(s) attendue(s), ${newExo.questions.length} reçue(s).`); return false;
                }
            } else {
                alert(`❌ Structure incompatible dans ${nom} : la structure (parties/questions) ne correspond pas.`); return false;
            }
        }

        // Vérification stricte de l'invariance des champs structurels
        let invarianceError = null;
        forEachQuestion(current, (q, _qId, eIdx, pIdx, qIdx) => {
            if (invarianceError) return;
            const newQ = pIdx !== null
                ? exercises[eIdx]?.parts?.[pIdx]?.questions?.[qIdx]
                : exercises[eIdx]?.questions?.[qIdx];
            if (!newQ) return;
            if (newQ.label !== undefined && newQ.label !== q.label) {
                invarianceError = `❌ L'IA a modifié le libellé de la question ${qIdx + 1} de l'exercice ${eIdx + 1}.\n\nAttendu : « ${q.label} »\nReçu : « ${newQ.label} »\n\nLe prompt interdit cette modification. Réessayez ou ajustez votre prompt.`;
            } else if (newQ.max !== undefined && Number(newQ.max) !== Number(q.max)) {
                invarianceError = `❌ L'IA a modifié le barème de la question ${qIdx + 1} de l'exercice ${eIdx + 1}.\n\nAttendu : ${q.max} pt(s) — Reçu : ${newQ.max} pt(s).`;
            } else if (newQ.step !== undefined && Number(newQ.step) !== Number(q.step)) {
                invarianceError = `❌ L'IA a modifié le pas de notation de la question ${qIdx + 1} de l'exercice ${eIdx + 1}.\n\nAttendu : ${q.step} — Reçu : ${newQ.step}.`;
            }
        });
        if (invarianceError) { alert(invarianceError); return false; }

        // Fusion : uniquement skills et answer
        forEachQuestion(current, (q, _qId, eIdx, pIdx, qIdx) => {
            const newQ = pIdx !== null
                ? exercises[eIdx]?.parts?.[pIdx]?.questions?.[qIdx]
                : exercises[eIdx]?.questions?.[qIdx];
            if (!newQ) return;
            if (Array.isArray(newQ.skills)) q.skills = newQ.skills;
            if (newQ.answer !== undefined) q.answer = newQ.answer;
        });

        saveConfiguration({
            newConfig: current,
            scaleOption: state.globalScaleTo20,
            showAppOption: state.globalShowAppreciation,
            generateGlobalPdfOption: state.globalGenerateGlobalPdf,
            showPublipostageOption: state.globalShowPublipostage,
            showPdfChartOption: state.globalShowPdfChart,
            fontSize: state.globalPdfFontSize,
            blankPageOption: state.globalBlankPageForDuplex,
            showSkillsOption: state.globalShowSkills,
            thresholdAcquis: state.globalThresholdAcquis,
            thresholdEncours: state.globalThresholdEncours,
            aiStep: state.globalAiStep,
            showAnswersOnPdfOption: state.globalShowAnswersOnPdf
        });
        alert("✅ Capacités attendues et réponses ajoutées avec succès !\n\nVérifiez et ajustez le résultat si nécessaire.");
        return true;

    } else {
        // Mode 'full' : nouveau barème complet
        const hasScores = state.students.some(s => s.scores && Object.keys(s.scores).length > 0);
        if (hasScores) {
            const ok = await showConfirm(
                "L'application d'un nouveau barème va réinitialiser les notes actuelles.\nContinuer ?",
                "Nouveau barème IA", "Appliquer", "btn-warning"
            );
            if (!ok) return false;
            state.students.forEach(st => { st.scores = {}; st.appreciation = ""; st.skillBilan = ""; });
            saveCurrentState();
            loadStudent(0);
        }
        saveConfiguration({
            newConfig: exercises,
            scaleOption: state.globalScaleTo20,
            showAppOption: state.globalShowAppreciation,
            generateGlobalPdfOption: state.globalGenerateGlobalPdf,
            showPublipostageOption: state.globalShowPublipostage,
            showPdfChartOption: state.globalShowPdfChart,
            fontSize: state.globalPdfFontSize,
            blankPageOption: state.globalBlankPageForDuplex,
            showSkillsOption: state.globalShowSkills,
            thresholdAcquis: state.globalThresholdAcquis,
            thresholdEncours: state.globalThresholdEncours,
            aiStep: state.globalAiStep,
            showAnswersOnPdfOption: state.globalShowAnswersOnPdf
        });
        alert("✅ Barème importé avec succès !\n\nVérifiez et ajustez le résultat si nécessaire.");
        return true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const hideWelcome = localStorage.getItem(STORAGE_KEYS.HIDE_WELCOME); // UTILISATION DE LA CONSTANTE
    if (hideWelcome !== 'true') {
        const welcomeModalEl = document.getElementById('welcomeModal');
        if (welcomeModalEl) bootstrap.Modal.getOrCreateInstance(welcomeModalEl).show();
    }
});

export function closeWelcomeModal() {
    const checkbox = document.getElementById('hideWelcomeCheckbox');
    if (checkbox && checkbox.checked) localStorage.setItem(STORAGE_KEYS.HIDE_WELCOME, 'true'); // UTILISATION DE LA CONSTANTE
    const welcomeModalEl = document.getElementById('welcomeModal');
    const welcomeModal = bootstrap.Modal.getInstance(welcomeModalEl);
    if (welcomeModal) welcomeModal.hide();

    setTimeout(() => {
        if (typeof loadStudent === 'function') {
            loadStudent(state.currentIndex);
        }
    }, 150);
};

export function checkJsonExportStatus() {
    // 1. On cible le bouton du menu principal (toujours visible)
    const btnMenu = document.getElementById('btn-config-modal');
    
    // 2. On cible le bouton d'enregistrement dans la modale
    const btnSave = document.getElementById('btn-save-config');

    if (state.needsJsonExport) {
        // --- Alerte sur l'écran principal ---
        if (btnMenu) {
            btnMenu.classList.remove('btn-secondary');
            btnMenu.classList.add('btn-warning', 'fw-bold', 'text-dark', 'border', 'border-danger');
            btnMenu.innerHTML = "⚠️ Barème non sauvegardé !";
            btnMenu.title = "Attention : Vous avez modifié le barème sans télécharger le fichier JSON.";
        }
        
        // --- Alerte dans la modale ---
        if (btnSave) {
            btnSave.classList.remove('btn-primary');
            btnSave.classList.add('btn-warning', 'text-dark');
            btnSave.innerHTML = "💾 Enregistrer & Télécharger";
        }
        
    } else {
        // --- Retour à la normale sur l'écran principal ---
        if (btnMenu) {
            btnMenu.classList.remove('btn-warning', 'fw-bold', 'text-dark', 'border', 'border-danger');
            btnMenu.classList.add('btn-primary');
            btnMenu.innerHTML = "✏️ Éditer le barème";
            btnMenu.title = "Créer ou modifier le barème du devoir.";
        }
        
        // --- Retour à la normale dans la modale ---
        if (btnSave) {
            btnSave.classList.remove('btn-warning', 'text-dark');
            btnSave.classList.add('btn-primary');
            btnSave.innerHTML = "💾 Enregistrer";
        }
    }
}

