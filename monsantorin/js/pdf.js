import { state, saveCurrentState } from './state.js';
import { isTiersTemps, isAbsent, computeScore } from './engine.js';
import { stripMD, showConfirm } from './addons.js';
import { getClassAverage } from './student.js';
import { generatePdfForStudent as renderPDF } from './pdf-renderer.js';

let pdfChartInstance = null;

/**
 * Déclenche la génération du PDF pour l'élève actuel avec confirmation si incomplet.
 */
export async function generatePDF() {
    const student = state.students[state.currentIndex];
    if (!student) return;
    if (isAbsent(student.name)) return; // Sécurité : jamais de PDF pour un absent

    const isTT = isTiersTemps(student.name);
    const res = computeScore(student.scores || {}, state.baremeConfig, isTT);

    // Sécurité : Confirmation si la copie n'est pas entièrement corrigée
    if (!res.isComplete) {
        const ok = await showConfirm("⚠️ Cette copie n'est pas entièrement corrigée (certaines notes sont manquantes).\n\nVoulez-vous quand même générer le PDF ?", "Copie incomplète", "Générer quand même", "btn-warning");
        if (!ok) return;
    }

    saveCurrentState();
    window.scrollTo(0, 0); // Remonte en haut pour voir le statut de préparation
    
    const btn = document.getElementById('btn-generate-pdf');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Préparation...";
    btn.disabled = true;

    setTimeout(() => {
        generatePdfForStudent(student, true)
            .then(() => {
                btn.innerText = "✅ Terminé !";
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }, 2000);
            })
            .catch(err => {
                console.error("Erreur génération PDF :", err);
                btn.innerText = "❌ Erreur PDF";
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }, 3000);
            });
    }, 1000);
}

/**
 * Prépare les données et génère le fichier PDF via le moteur Typst.
 */
export async function generatePdfForStudent(student, isDownload) {
    const docTitle = document.getElementById('mainTitle').innerText;
    const classAvg = getClassAverage();
    
    let isTT = isTiersTemps(student.name);
    const res = computeScore(student.scores || {}, state.baremeConfig, isTT);

    // ---- Construction du graphique radar/barres ----
    let chartImageDataUrl = null;
    if (state.globalShowPdfChart && state.baremeConfig.length > 0) {
        try {
            let chartLabels = [];
            let chartStudentData = [];
            let chartClassData = [];
            let validClassCountForChart = 0;
            const validStudentsForClass = state.students.filter(s => s.name && s.name.trim() !== "");

            state.baremeConfig.forEach((exo, eIdx) => {
                if (exo.parts) {
                    exo.parts.forEach((part, pIdx) => {
                        let partMax = 0, stuPtsRaw = 0, classPtsSum = 0, currentValidCount = 0;
                        part.questions.forEach((q, qIdx) => {
                            partMax += q.max;
                            const sVal = student.scores[`e${eIdx}-p${pIdx}-q${qIdx}`];
                            if (sVal !== "" && sVal !== undefined) stuPtsRaw += parseFloat(sVal);
                        });
                        
                        let stuPts = stuPtsRaw;

                        validStudentsForClass.forEach(s => {
                            const result = computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name));
                            if (result.isComplete) {
                                let sPartPtsRaw = 0;
                                part.questions.forEach((q, qIdx) => {
                                    const v = s.scores[`e${eIdx}-p${pIdx}-q${qIdx}`];
                                    if (v !== "" && v != null) sPartPtsRaw += parseFloat(v);
                                });
                                classPtsSum += sPartPtsRaw; 
                                currentValidCount++;
                            }
                        });
                        
                        let pName = stripMD(part.name);
                        if (pName.length > 15) pName = pName.substring(0, 12) + "...";
                        chartLabels.push(`Ex ${eIdx + 1} - ${pName}`);
                        chartStudentData.push(partMax > 0 ? (stuPts / partMax) * 100 : 0);
                        if (currentValidCount > 0) {
                            chartClassData.push(partMax > 0 ? (classPtsSum / currentValidCount / partMax) * 100 : 0);
                            validClassCountForChart = Math.max(validClassCountForChart, currentValidCount);
                        } else {
                            chartClassData.push(0);
                        }
                    });
                } else if (exo.questions) {
                    let exoMax = 0, stuPtsRaw = 0, classPtsSum = 0, currentValidCount = 0;
                    exo.questions.forEach((q, qIdx) => {
                        exoMax += q.max;
                        const sVal = student.scores[`e${eIdx}-q${qIdx}`];
                        if (sVal !== "" && sVal !== undefined) stuPtsRaw += parseFloat(sVal);
                    });
                    
                    let stuPts = stuPtsRaw;

                    validStudentsForClass.forEach(s => {
                        const result = computeScore(s.scores || {}, state.baremeConfig, isTiersTemps(s.name));
                        if (result.isComplete) {
                            let sExoPtsRaw = 0;
                            exo.questions.forEach((q, qIdx) => {
                                const v = s.scores[`e${eIdx}-q${qIdx}`];
                                if (v !== "" && v != null) sExoPtsRaw += parseFloat(v);
                            });
                            classPtsSum += sExoPtsRaw; 
                            currentValidCount++;
                        }
                    });
                    
                    let eName = stripMD(exo.title);
                    if (eName.length > 20) eName = eName.substring(0, 17) + "...";
                    chartLabels.push(eName);
                    chartStudentData.push(exoMax > 0 ? (stuPts / exoMax) * 100 : 0);
                    if (currentValidCount > 0) {
                        chartClassData.push(exoMax > 0 ? (classPtsSum / currentValidCount / exoMax) * 100 : 0);
                        validClassCountForChart = Math.max(validClassCountForChart, currentValidCount);
                    } else {
                        chartClassData.push(0);
                    }
                }
            });

            const datasets = [{
                label: 'Élève (%)',
                data: chartStudentData,
                backgroundColor: 'rgba(54, 162, 235, 0.4)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(54, 162, 235, 1)'
            }];

            if (validClassCountForChart > 1) {
                datasets.push({
                    label: 'Classe (%)',
                    data: chartClassData,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointBackgroundColor: 'rgba(255, 99, 132, 1)'
                });
            }

            const canvas = document.createElement('canvas');
            canvas.width = 600; canvas.height = 300; 

            const isRadar = chartLabels.length >= 3;
            const chartType = isRadar ? 'radar' : 'bar';

            if (pdfChartInstance) pdfChartInstance.destroy();
            pdfChartInstance = new Chart(canvas, {
                type: chartType,
                data: { labels: chartLabels, datasets: datasets },
                options: {
                    animation: false, responsive: false,
                    scales: chartType === 'radar' ?
                        { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } } } :
                        { y: { beginAtZero: true, max: 100 } },
                    plugins: { legend: { display: true, position: 'bottom' }, title: { display: false } }
                }
            });
            chartImageDataUrl = pdfChartInstance.toBase64Image();
        } catch (e) {
            console.warn("Chart radar échec, on continue sans :", e);
        }
    }

    const ctx = {
        docTitle,
        baremeConfig: state.baremeConfig,
        classAvg,
        scaleTo20: state.globalScaleTo20,
        showAppreciation: state.globalShowAppreciation,
        showSkills: state.globalShowSkills,
        showAnswersOnPdf: state.globalShowAnswersOnPdf,
        showPdfChart: state.globalShowPdfChart,
        fontSize: state.globalPdfFontSize,
        chartImageDataUrl,
        isTiersTemps: isTT,
        isIncomplete: !res.isComplete // Information transmise au moteur de rendu Typst
    };

    return renderPDF(student, ctx, isDownload);
}