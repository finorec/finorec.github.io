// --- FICHIER : js/io.js ---
// Rôle : Gestion des entrées/sorties (CSV, JSON, ZIP) utilisant PapaParse pour la robustesse.

import { state, saveConfiguration, saveCurrentState } from './state.js';
import { loadStudent, generateSkillBilan } from './student.js';
import { stripMD, showConfirm, renderGradingForm } from './addons.js';
import { renderConfigEditor, getConfigFromDOM, updateConfigBackupBaseline } from './editor.js';
import { generatePdfForStudent } from './pdf.js';
import { computeScore, isTiersTemps, isAbsent, forEachQuestion, removeTiersTempsBadge } from './engine.js';
import { PDFDocument } from '@cantoo/pdf-lib';
import { STORAGE_KEYS } from './constants.js';

// --- HELPERS ---

function generateCSVHeaders(baremeConfig, scaleTo20) {
    const cleanHeader = (t) => (t || "").replace(/(\r\n|\n|\r)/gm, " ");
    let header = ["Nom"];
    
    baremeConfig.forEach((exo) => {
        header.push(`TOTAL ${cleanHeader(stripMD(exo.title))}`);
        if (exo.parts) { 
            exo.parts.forEach((part) => { 
                header.push(`Total ${cleanHeader(stripMD(part.name))}`); 
                part.questions.forEach((q) => header.push(`${cleanHeader(stripMD(q.label))} (/${q.max})`)); 
            }); 
        } else if (exo.questions) { 
            exo.questions.forEach((q) => header.push(`${cleanHeader(stripMD(q.label))} (/${q.max})`)); 
        }
    });
    
    header.push("TOTAL COPIE"); 
    if(scaleTo20) header.push("NOTE SUR 20"); 
    header.push("Appréciation");
    
    return header;
}

// --- CONFIGURATION JSON ---

export function exportConfigJSON() {
    const currentConfig = getConfigFromDOM();
    if (!currentConfig) return;
    
    const exportData = { 
        exercises: currentConfig.exercises, 
        scaleTo20: currentConfig.scaleTo20,
        showAppreciation: currentConfig.showAppreciation,
        generateGlobalPdf: currentConfig.generateGlobalPdf,
        showPublipostage: currentConfig.showPublipostage,
        showPdfChart: currentConfig.showPdfChart, 
        showAnswersOnPdf: currentConfig.showAnswersOnPdf,
        pdfFontSize: currentConfig.pdfFontSize,
        blankPageForDuplex: currentConfig.blankPageForDuplex,
        showSkills: currentConfig.showSkills,
        thresholdAcquis: currentConfig.thresholdAcquis,
        thresholdEncours: currentConfig.thresholdEncours,
        aiStep: currentConfig.aiStep,
        quickComments: state.globalQuickComments
    };
    
    // NOUVELLE MÉTHODE SÉCURISÉE AVEC BLOB + SAVEAS
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const fileName = "Bareme " + document.getElementById('mainTitle').innerText.trim().replace(/[\/\\?%*:|"<>]/g, '_') + ".json";
    
    saveAs(blob, fileName);
    
    state.needsJsonExport = false;
}

export function triggerConfigImport() { document.getElementById('configFileImport').click(); }

export async function processConfigImport(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Sécurité : On prévient le professeur que l'import efface les notes en cours
    const ok = await showConfirm("L'importation d'un nouveau barème va réinitialiser les notes actuelles.\nContinuer ?", "Importer un barème", "Importer", "btn-warning");
    if (!ok) {
        input.value = ''; // On réinitialise l'input si annulation
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // Nettoyage au cas où le JSON contiendrait des balises Markdown (ex: import depuis une IA)
            let rawText = e.target.result;
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const json = JSON.parse(rawText);
            
            // 1. Validation du contenu avant toute mutation
            const exercises = Array.isArray(json) ? json : json.exercises;
            const config = Array.isArray(json) ? {} : json;

            if (!Array.isArray(exercises) || exercises.length === 0) {
                alert("❌ Fichier JSON invalide : la propriété « exercises » est absente ou vide.\n\nVérifiez que le fichier provient bien d'un export MonSantorin.");
                input.value = '';
                return;
            }

            // Validation structurelle : chaque exercice/partie doit avoir un tableau questions
            for (const exo of exercises) {
                if (exo.parts) {
                    for (const part of exo.parts) {
                        if (!Array.isArray(part.questions)) {
                            alert(`❌ Fichier JSON invalide : la partie « ${part.name || '?'} » ne contient pas de tableau « questions ».\n\nVérifiez que le fichier provient bien d'un export MonSantorin.`);
                            input.value = ''; return;
                        }
                    }
                } else if (!Array.isArray(exo.questions)) {
                    alert(`❌ Fichier JSON invalide : l'exercice « ${exo.title || '?'} » ne contient pas de tableau « questions ».\n\nVérifiez que le fichier provient bien d'un export MonSantorin.`);
                    input.value = ''; return;
                }
            }

            // 2. Réinitialisation des notes de la classe (uniquement si le JSON est valide)
            state.students.forEach(st => { 
                st.scores = {}; 
                st.appreciation = ""; 
                st.skillBilan = ""; 
            });
            localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students));

            // 3. Application de la configuration (Attention : saveConfiguration lève l'alerte jaune par défaut)
            saveConfiguration({
                newConfig: exercises,
                scaleOption: !!config.scaleTo20,
                showAppOption: config.showAppreciation !== undefined ? !!config.showAppreciation : true,
                generateGlobalPdfOption: config.generateGlobalPdf !== undefined ? !!config.generateGlobalPdf : true,
                showPublipostageOption: config.showPublipostage !== undefined ? !!config.showPublipostage : true,
                showPdfChartOption: config.showPdfChart !== undefined ? !!config.showPdfChart : true,
                fontSize: config.pdfFontSize || "16",
                blankPageOption: !!config.blankPageForDuplex,
                showSkillsOption: config.showSkills !== undefined ? !!config.showSkills : state.globalShowSkills,
                thresholdAcquis: config.thresholdAcquis || 75,
                thresholdEncours: config.thresholdEncours || 40,
                aiStep: config.aiStep || 0.25,
                showAnswersOnPdfOption: !!config.showAnswersOnPdf
            });

            // 4. Restauration des commentaires rapides (ou valeurs par défaut)
            state.globalQuickComments = json.quickComments || [...state.defaultQuickComments];
            localStorage.setItem(STORAGE_KEYS.QUICK_COMMENTS, JSON.stringify(state.globalQuickComments));

            // 5. Mise à jour du titre de l'évaluation en fonction du nom du fichier
            const newTitle = file.name.replace(/\.json$/i, '').replace(/^Bareme /i, '');
            document.getElementById('mainTitle').innerText = newTitle;
            localStorage.setItem(STORAGE_KEYS.TITLE, newTitle);
            
            // 6. Mise à jour visuelle de la modale d'édition (si elle est ouverte)
            if (typeof renderConfigEditor === 'function') renderConfigEditor(); 
            
            // 7. SÉCURISATION (Étape cruciale) : On définit ce barème comme la nouvelle référence !
            if (typeof updateConfigBackupBaseline === 'function') {
                updateConfigBackupBaseline();
            }

            // 8. EXTINCTION DES ALERTES (La logique métier du bouton jaune)
            // Le barème vient d'être chargé depuis le disque : pas besoin de sauvegarder !
            state.needsJsonExport = false; 
            // La classe vient d'être vidée : pas besoin de sauvegarder le tableur !
            state.needsCsvExport = false;


            alert("Barème importé avec succès !");
        } catch (err) { 
            console.error("Erreur de lecture du JSON :", err);
            alert("Erreur : Impossible de lire ce fichier de configuration. Vérifiez son format."); 
        }
        
        // On réinitialise l'input pour permettre de réimporter le même fichier si besoin
        input.value = ''; 
    };
    
    // Lancement de la lecture du fichier
    reader.readAsText(file);
}


// --- EXPORT CSV (PapaParse) ---

export function exportToCSV() {
    saveCurrentState();
    
    let totalMaxPossible = 0; 
    forEachQuestion(state.baremeConfig, q => totalMaxPossible += q.max);

    const headers = generateCSVHeaders(state.baremeConfig, state.globalScaleTo20);
    const rows = [];

    state.students.forEach(st => {
        const res = computeScore(st.scores || {}, state.baremeConfig, isTiersTemps(st.name));
        let row = [st.name];
        
        state.baremeConfig.forEach((exo, eIdx) => {
            row.push(res.exoTotals[eIdx].total);
            if (exo.parts) {
                exo.parts.forEach((part, pIdx) => {
                    row.push(res.partTotals[`${eIdx}-${pIdx}`].total);
                    part.questions.forEach((q, qIdx) => {
                        let val = st.scores[`e${eIdx}-p${pIdx}-q${qIdx}`];
                        row.push((val !== "" && val !== undefined) ? parseFloat(val) : "");
                    });
                });
            } else if (exo.questions) {
                exo.questions.forEach((q, qIdx) => {
                    let val = st.scores[`e${eIdx}-q${qIdx}`];
                    row.push((val !== "" && val !== undefined) ? parseFloat(val) : "");
                });
            }
        });
        
        row.push(res.total);
        if (state.globalScaleTo20) {
            row.push(totalMaxPossible > 0 ? (res.total / totalMaxPossible) * 20 : "");
        }
        row.push(st.appreciation);
        rows.push(row);
    });

    // Utilisation de PapaParse pour générer le CSV
    const csvString = Papa.unparse({
        fields: headers,
        data: rows
    }, {
        delimiter: ";",
        quotes: true // Entoure systématiquement de guillemets pour éviter les soucis de séparateurs
    });

    // Ajout du BOM UTF-8 (\ufeff) pour que Excel reconnaisse l'encodage immédiatement
    const blob = new Blob(["\ufeff" + csvString], { type: 'text/csv;charset=utf-8;' });
    const fileName = (document.getElementById('mainTitle').innerText.trim().replace(/[\/\\?%*:|"<>]/g, '') || "Notes") + ".csv";
    saveAs(blob, fileName);
    
    state.needsCsvExport = false;
}

// --- IMPORT CSV (PapaParse) ---

export function triggerImport() { document.getElementById('csvFileInput').click(); }

export function processCSVImport(input) {
    const file = input.files[0]; 
    if (!file) return;
    
    Papa.parse(file, {
        delimiter: ";",
        skipEmptyLines: true,
        complete: async function(results) {
            const data = results.data;
            if (data.length < 1) {
                alert("Erreur : Le fichier CSV est vide.");
                input.value = ''; return;
            }

            const expectedHeader = generateCSVHeaders(state.baremeConfig, state.globalScaleTo20);

            // Vérification structurelle : le nombre de colonnes doit correspondre.
            // Une différence de libellé seule (ex : faute de frappe corrigée) n'est pas bloquante.
            if (data[0].length !== expectedHeader.length) {
                alert(
                    `❌ Impossible d'importer ce fichier.\n\n` +
                    `Le fichier contient ${data[0].length} colonne(s), ` +
                    `le barème actuel en attend ${expectedHeader.length}.\n\n` +
                    `Vérifiez que le fichier correspond bien à ce barème, ou importez d'abord le bon barème JSON.`
                );
                input.value = ''; return;
            }

            const replaceOk = await showConfirm(
                "Voulez-vous remplacer les notes actuelles par celles de ce fichier ?",
                "Importation CSV", "Remplacer", "btn-primary");
            if (!replaceOk) { input.value = ''; return; }

            const newStudents = [];
            for (let i = 1; i < data.length; i++) {
                const cells = data[i];
                if (cells.length < 2) continue;
                
                let c = 0;
                let name = cells[c++];
                let scores = {};

                state.baremeConfig.forEach((exo, eIdx) => {
                    c++; // Saut total exo
                    if (exo.parts) {
                        exo.parts.forEach((part, pIdx) => {
                            c++; // Saut total partie
                            part.questions.forEach((q, qIdx) => {
                                let v = cells[c++];
                                scores[`e${eIdx}-p${pIdx}-q${qIdx}`] = (v !== "" && v !== undefined) ? parseFloat(v.toString().replace(',', '.')) : "";
                            });
                        });
                    } else if (exo.questions) {
                        exo.questions.forEach((q, qIdx) => {
                            let v = cells[c++];
                            scores[`e${eIdx}-q${qIdx}`] = (v !== "" && v !== undefined) ? parseFloat(v.toString().replace(',', '.')) : "";
                        });
                    }
                });
                
                c++; // Total copie
                if (state.globalScaleTo20) c++; 
                let appreciation = cells[c] || "";
                
                newStudents.push({ name, scores, appreciation, skillBilan: "" });
            }

            if (newStudents.length > 0) {
                state.students = newStudents;
                state.students.forEach(s => s.skillBilan = generateSkillBilan(s));
                state.currentIndex = 0;
                localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students));
                loadStudent(0);
                state.hasUnsavedChanges = false;
                alert("Import réussi !");
            }
        }
    });
    input.value = '';
}

// --- IMPORT CLASSE SEULE (PapaParse Universel) ---

export function triggerClassImport() { document.getElementById('classCsvInput').click(); }

export async function processClassImport(input) {
    const file = input.files[0]; 
    if (!file) return;
    
    const ok = await showConfirm("Cette action va remplacer la liste actuelle des élèves.\nContinuer ?", "Importer une classe", "Remplacer", "btn-warning");
    if (!ok) { input.value = ''; return; }

    Papa.parse(file, {
        // En laissant le délimiteur vide, PapaParse le détecte tout seul (Tabulation ou Point-virgule)
        skipEmptyLines: true,
        encoding: 'UTF-8',
        complete: function(results) {
            const data = results.data;
            if (data.length < 2) {
                alert("Erreur : Le fichier est vide ou ne contient qu'une ligne d'en-têtes.");
                input.value = ''; return;
            }

            const headers = data[0].map(h => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim());
            
            // 👉 NOUVEAU : Recherche flexible avec findIndex et includes
            const idxEleves = headers.findIndex(h => ["Élèves", "Elèves", "Eleves", "Élève", "Elève", "Eleve"].includes(h));
            const idxNom = headers.indexOf("Nom");
            const idxPrenom = headers.indexOf("Prénom");
            
            // Nouvelles métadonnées (Optionnelles)
            const idxNaissance = headers.indexOf("Né(e) le");
            const idxClasse = headers.indexOf("Classe");

            if (idxEleves === -1 && (idxNom === -1 || idxPrenom === -1)) {
                const detectedCols = headers.slice(0, 8).join(', ') || '(aucune colonne détectée)';
                alert(
                    `Erreur : Impossible de trouver les colonnes d'identification dans ce fichier.\n\n` +
                    `Colonnes attendues : "Élèves" ou "Élève" — ou — "Nom" et "Prénom"\n` +
                    `Colonnes détectées : ${detectedCols}\n\n` +
                    `Conseils :\n` +
                    `• Vérifiez que vous importez bien le bon fichier CSV (export liste de classe).\n` +
                    `• Si les noms de colonnes contiennent des caractères bizarres, le fichier a peut-être été ré-enregistré dans un autre encodage : ré-enregistrez-le en UTF-8 depuis votre tableur (Fichier › Enregistrer sous › UTF-8).`
                );
                input.value = ''; return;
            }

            const newStudents = [];
            
            for (let i = 1; i < data.length; i++) {
                const cells = data[i];
                let fullName = "";

                // Extraction du nom (Gère les deux formats Pronote)
                if (idxEleves !== -1 && cells[idxEleves]) {
                    fullName = cells[idxEleves].trim();
                } else if (idxNom !== -1 && idxPrenom !== -1 && cells[idxNom] && cells[idxPrenom]) {
                    fullName = `${cells[idxNom].trim()} ${cells[idxPrenom].trim()}`;
                }

                if (fullName) {
                    // Extraction des métadonnées optionnelles
                    const birthDate = (idxNaissance !== -1 && cells[idxNaissance]) ? cells[idxNaissance].trim() : "";
                    const className = (idxClasse !== -1 && cells[idxClasse]) ? cells[idxClasse].trim() : "";

                    newStudents.push({ 
                        name: fullName, 
                        birthDate: birthDate, 
                        className: className,
                        scores: {}, 
                        appreciation: "", 
                        skillBilan: "" 
                    });
                }
            }

            if (newStudents.length > 0) {
                state.students = newStudents;
                state.currentIndex = 0;
                localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students));
                renderGradingForm();
                loadStudent(0);
                state.hasUnsavedChanges = false;
                state.needsCsvExport = true;
                alert(`${newStudents.length} élèves importés avec succès !`);
            } else {
                alert("Aucun élève trouvé dans le fichier.");
            }
        }
    });
    input.value = '';
}

// --- EXPORT ZIP ---

/**
 * Filtre les élèves exportables et demande confirmation si des copies incomplètes seraient exclues.
 * @returns {Promise<{ ok: true, students } | { ok: false, reason: 'no_students'|'cancelled'|'no_complete' }>}
 */
export async function prepareStudentsForZipExport(options = {}) {
    const { confirmTitle = 'Export ZIP', confirmBtnClass = 'btn-primary' } = options;

    let validStudents = state.students.filter(s => s.name?.trim() && !isAbsent(s.name));
    if (validStudents.length === 0) return { ok: false, reason: 'no_students' };

    const incomplete = validStudents.filter(s =>
        !computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name)).isComplete
    );
    if (incomplete.length > 0) {
        const ok = await showConfirm(
            `Information : ${incomplete.length} copie(s) sont incomplètes (élèves absents, etc.) et seront exclues du ZIP. Continuer ?`,
            confirmTitle,
            'Continuer',
            confirmBtnClass
        );
        if (!ok) return { ok: false, reason: 'cancelled' };
        validStudents = validStudents.filter(s =>
            computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name)).isComplete
        );
    }

    if (validStudents.length === 0) return { ok: false, reason: 'no_complete' };
    return { ok: true, students: validStudents };
}

export async function downloadClassZip() {
    const btn = document.getElementById('btn-zip');
    const originalText = btn.innerText;
    saveCurrentState();
    
    const zip = new JSZip();
    let validStudents = state.students.filter(s => s.name && s.name.trim() !== "" && !isAbsent(s.name));

    if (validStudents.length === 0) {
        alert("Aucun élève à exporter.");
        return;
    }

    const prepared = await prepareStudentsForZipExport();
    if (!prepared.ok) {
        if (prepared.reason === 'no_complete') {
            alert("Il n'y a aucune copie complète à exporter.");
        }
        return;
    }
    validStudents = prepared.students;

    btn.disabled = true;
    let pdfBlobs = [];
    let failedStudents = [];
    
    for (let i = 0; i < validStudents.length; i++) {
        const s = validStudents[i];
        btn.innerText = `⏳ PDF ${i+1}/${validStudents.length}...`;
		// Force le navigateur à rafraîchir l'affichage avant de lancer Typst
        await new Promise(resolve => setTimeout(resolve, 10));
        // --------------------------------------
        try {
            const pdfData = await generatePdfForStudent(s, false);
            if (pdfData && pdfData.blob) {
                // Nettoyage du badge (TT) pour le ZIP global
                const cleanPdfName = removeTiersTempsBadge(s.name);
                const finalName = "Correction_" + cleanPdfName.replace(/[^a-z0-9]/gi, '_') + ".pdf";
                
                zip.file(finalName, pdfData.blob); 
                
                if (state.globalGenerateGlobalPdf) pdfBlobs.push(pdfData.blob); 
            } else {
                failedStudents.push(s.name);
            }
        } catch (e) {
            console.error("Erreur PDF : " + s.name, e);
            failedStudents.push(s.name);
        }
    }

    if (state.globalGenerateGlobalPdf && pdfBlobs.length > 0) {
        btn.innerText = `⏳ PDF Global...`;
        try {
            const mergedPdf = await PDFDocument.create();
            for (let blob of pdfBlobs) {
                const pdf = await PDFDocument.load(await blob.arrayBuffer());
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(p => mergedPdf.addPage(p));
                if (state.globalBlankPageForDuplex && copiedPages.length % 2 !== 0) {
                    const { width, height } = copiedPages[0].getSize();
                    mergedPdf.addPage([width, height]);
                }
            }
            zip.file(`00_Toutes_les_copies.pdf`, await mergedPdf.save());
        } catch (e) { console.error("Erreur fusion PDF :", e); }
    }

    btn.innerText = "📦 Compression...";
    const content = await zip.generateAsync({type:"blob"});
    saveAs(content, "Corrections_" + document.getElementById('mainTitle').innerText.trim().replace(/[^a-z0-9]/gi, '_') + ".zip");
    
    if (failedStudents.length > 0) {
        alert(`⚠️ Attention : ${failedStudents.length} PDF n'ont pas pu être générés et sont absents du ZIP :\n\n${failedStudents.join('\n')}`);
    }
    btn.innerText = "✅ Terminé !";
    setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
    }, 3000);
}