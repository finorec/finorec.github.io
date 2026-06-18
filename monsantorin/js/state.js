// --- FICHIER : js/state.js ---
// Rôle : Gérer, protéger et persister les variables globales de l'application (Le Store).

import { calculateMaxScore, generateSkillBilan, renderStudentList, calculateTotals, updateAppreciationPreview, loadStudent } from './student.js';
import { renderGradingForm, renderQuickComments } from './addons.js';
import { renderConfigEditor, discardConfigBackup, updateConfigBackupBaseline } from './editor.js';
import { STORAGE_KEYS } from './constants.js';

/** --- CONFIGURATIONS PAR DÉFAUT --- */
const defaultBaremeConfig = [
    {
        "title": "Exercice 1 : Sciences",
        "parts": [
            {
                "name": "Partie A : Physique",
                "questions": [
                    { "label": "**1.** La relation $E = mc^2$ relie l'énergie $E$ (en $\\mathrm{J}$), la masse $m$ (en $\\mathrm{kg}$) et la vitesse de la lumière $c = 3{,}0 \\times 10^8\\,\\mathrm{m\\cdot s^{-1}}$. Calculer $E$ pour $m = 1\\,\\mathrm{kg}$.", "max": 3, "step": 0.5, "answer": "$E = 1 \\times (3{,}0\\times10^8)^2 = 9{,}0 \\times 10^{16}\\,\\mathrm{J}$", "skills": ["Appliquer une formule physique", "Maîtriser la notation scientifique"] },
                    { "label": "**2.** Énoncer la deuxième loi de Newton (relation fondamentale de la dynamique).", "max": 2, "step": 0.5, "answer": "$\\sum \\vec{F} = m\\vec{a}$", "skills": ["Connaître les lois de Newton", "Rédiger une loi en notation vectorielle"] }
                ]
            },
            {
                "name": "Partie B : Chimie et SVT",
                "questions": [
                    { "label": "**1.** Équilibrer l'équation : $\\mathrm{CH_4} + \\mathrm{O_2} \\rightarrow \\mathrm{CO_2} + \\mathrm{H_2O}$", "max": 3, "step": 0.5, "answer": "$\\mathrm{CH_4} + 2\\,\\mathrm{O_2} \\rightarrow \\mathrm{CO_2} + 2\\,\\mathrm{H_2O}$", "skills": ["Équilibrer une réaction chimique", "Vérifier la conservation des atomes"] },
                    { "label": "**2.** *(SVT)* Indiquer en quoi la méiose diffère de la mitose (un critère précis suffit).", "max": 2, "step": 0.5, "answer": "La méiose produit quatre cellules haploïdes à partir d'une cellule diploïde, avec brassage génétique ; la mitose produit deux cellules diploïdes génétiquement identiques.", "skills": ["Comparer mitose et méiose", "Utiliser le vocabulaire de la reproduction"] }
                ]
            }
        ]
    },
    {
        "title": "Exercice 2 : SES",
        "questions": [
            { "label": "**1.** Définir le PIB et donner sa formule par les dépenses.", "max": 2, "step": 0.5, "answer": "Le PIB est la valeur totale des biens et services produits sur un territoire donné en une année. Par les dépenses : $\\text{PIB} = C + I + G + (X - M)$", "skills": ["Maîtriser les agrégats macroéconomiques", "Définir un indicateur économique"] },
            { "label": "**2.** Donner la formule du taux de chômage et préciser ce que mesure cet indicateur.", "max": 2, "step": 0.5, "answer": "$\\text{Taux de chômage} = \\dfrac{\\text{nombre de chômeurs}}{\\text{population active}} \\times 100$. Il mesure la part des personnes en emploi recherchant un emploi dans la population active.", "skills": ["Calculer et interpréter un indicateur social"] },
            { "label": "**3.** Citer un indicateur permettant de mesurer les inégalités de revenus et expliquer brièvement son principe.", "max": 2, "step": 0.5, "answer": "Le coefficient de Gini (ou les déciles de revenus) : plus il est proche de 1, plus les inégalités sont marquées ; il compare la distribution réelle des revenus à une égalité parfaite.", "skills": ["Identifier un indicateur d'inégalités", "Analyser une inégalité sociale"] }
        ]
    },
    {
        "title": "Exercice 3 : Littérature",
        "questions": [
            { "label": "**1.** *« Waterloo ! Waterloo ! Waterloo ! morne plaine ! »* — Citer l'auteur et l'œuvre.", "max": 1, "step": 0.5, "answer": "Victor Hugo, *Les Châtiments* (1853), poème *L'Expiation*", "skills": ["Identifier une référence littéraire", "Situer une œuvre dans son contexte"] },
            { "label": "**2.** Repérer la figure de style dans : *« La mer montait de sa voix furieuse »* (Hugo) et la nommer.", "max": 1, "step": 0.5, "answer": "Personnification (ou prosopopée) : la mer est dotée d'une voix et d'un mouvement humains.", "skills": ["Reconnaître une figure de style", "Justifier une identification"] },
            { "label": "**3.** En deux ou trois phrases, expliquer l'effet produit par l'anaphore *« Waterloo ! »* dans le vers cité.", "max": 1, "step": 0.5, "answer": "L'anaphore insiste sur le lieu et la fatalité de la défaite ; le rythme ternaire renforce la lourdeur et le pathétique du souvenir.", "skills": ["Analyser un procédé d'écriture", "Rédiger une réponse argumentée"] },
            { "label": "**4.** Indiquer le genre littéraire de *Les Châtiments* et le mouvement littéraire auquel appartient Victor Hugo.", "max": 1, "step": 0.5, "answer": "Recueil poétique (poésie engagée) ; romantisme.", "skills": ["Situer une œuvre dans un genre", "Relier un auteur à un courant littéraire"] }
        ]
    }
];

const defaultQuickComments = [
    "Excellent travail.", "Très bon devoir.", "Bon devoir.", "Raisonnement rigoureux.",
    "Des progrès à faire.", "Attention aux unités.", "Manque de précision.",
    "Réponse incomplète.", "Hors sujet.", "Non acquis."
];

const defaultStudents = [
    {
        name: "BOUVIER Patty",
        scores: {},
        appreciation: "",
        skillBilan: ""
    },
    {
        name: "BOUVIER Selma",
        scores: {
            "e0-p0-q0": 1.5, "e0-p0-q1": 1,
            "e0-p1-q0": 1.5, "e0-p1-q1": 1,
            "e1-q0": 1.5, "e1-q1": 1.5, "e1-q2": 1,
            "e2-q0": 1, "e2-q1": 0, "e2-q2": 0.5, "e2-q3": 1
        },
        appreciation: "**Niveau homogène.** \n Correct en sciences et en SES. La littérature analytique (figures de style) reste le point faible.",
        skillBilan: ""
    },
    {
        name: "FLANDERS Ned",
        scores: {
            "e0-p0-q0": 3, "e0-p0-q1": 2,
            "e0-p1-q0": 3, "e0-p1-q1": 2,
            "e1-q0": 2, "e1-q1": 2, "e1-q2": 0.5,
            "e2-q0": 1, "e2-q1": 1, "e2-q2": 1, "e2-q3": 1
        },
        appreciation: "**Excellent devoir.** \n- Sciences, SES et littérature très bien maîtrisées.\n- Les indicateurs d'inégalités méritent encore un approfondissement.",
        skillBilan: ""
    },
    {
        name: "GUMBLE Barney",
        scores: {
            "e0-p0-q0": 0, "e0-p0-q1": 0,
            "e0-p1-q0": 0.5, "e0-p1-q1": 0,
            "e1-q0": 0.5, "e1-q1": 0, "e1-q2": 0,
            "e2-q0": 0, "e2-q1": 0, "e2-q2": 0, "e2-q3": 0
        },
        appreciation: "**Devoir très insuffisant sur l'ensemble des exercices.** \n Un travail régulier et une reprise complète du programme sont indispensables.",
        skillBilan: ""
    },
    {
        name: "SIMPSON Homer",
        scores: {
            "e0-p0-q0": 2, "e0-p0-q1": 1,
            "e0-p1-q0": 0, "e0-p1-q1": 0,
            "e1-q0": 0, "e1-q1": 0, "e1-q2": 0,
            "e2-q0": 0, "e2-q1": 0, "e2-q2": 0, "e2-q3": 0
        },
        appreciation: "**Ensemble très insuffisant.** \n Quelques notions retenues en physique (calcul d'énergie, loi de Newton), sans doute liées à la centrale.",
        skillBilan: ""
    },
    {
        name: "SIMPSON Marge",
        scores: {
            "e0-p0-q0": 2, "e0-p0-q1": 1.5,
            "e0-p1-q0": 2, "e0-p1-q1": 1.5,
            "e1-q0": 1.5, "e1-q1": 1.5, "e1-q2": 1.5,
            "e2-q0": 1, "e2-q1": 1, "e2-q2": 0, "e2-q3": 1
        },
        appreciation: "**Bon devoir global.** \n- Niveau régulier et sérieux dans les trois exercices.\n- L'analyse des procédés d'écriture reste à consolider.",
        skillBilan: ""
    },
    {
        name: "SZYSLAK Moe",
        scores: {
            "e0-p0-q0": 0.5, "e0-p0-q1": 0,
            "e0-p1-q0": 0, "e0-p1-q1": 0.5,
            "e1-q0": 0.5, "e1-q1": 0.5, "e1-q2": 0,
            "e2-q0": 0, "e2-q1": 0, "e2-q2": 0, "e2-q3": 0
        },
        appreciation: "**Devoir très faible**, sans domaine vraiment maîtrisé. Quelques bribes en SES et en SVT, mais sciences, PIB et littérature restent non acquis.",
        skillBilan: ""
    }
];

// --- VARIABLES PRIVÉES ---
let _baremeConfig = [];
let _globalScaleTo20 = false;
let _globalShowAppreciation = true; 
let _globalGenerateGlobalPdf = true; 
let _globalShowPublipostage = true;
let _globalShowPdfChart = true; 
let _globalPdfFontSize = "16"; 
let _globalBlankPageForDuplex = true; 
let _globalQuickComments = [...defaultQuickComments];

let _globalShowSkills = true;
let _globalThresholdAcquis = 75;
let _globalThresholdEncours = 40;
let _globalAiStep = 0.25;

let _globalShowAnswers = true;
let _globalShowAnswersOnPdf = true;

let _students;
try {
    const savedData = localStorage.getItem(STORAGE_KEYS.DATA);
    _students = savedData !== null ? JSON.parse(savedData) : null;
    if (!_students || !Array.isArray(_students)) {
        // Pas de données sauvegardées : démarrage propre (liste vide)
        _students = [];
    } else {
        // Nettoyage des élèves fantômes : entrée vide sans nom ni notes ni appréciation
        _students = _students.filter(s =>
            (s.name && s.name.trim() !== "") ||
            (s.appreciation && s.appreciation.trim() !== "") ||
            (s.scores && Object.keys(s.scores).length > 0)
        );
    }
} catch (e) {
    console.error("Erreur critique de lecture du localStorage :", e);
    alert("⚠️ Oups ! Vos données de sauvegarde locales ont été corrompues. L'application a été réinitialisée pour pouvoir démarrer normalement.");
    _students = [];
}

let _currentIndex = 0;
let _statsChartInstance = null;
let _entStudents      = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ENT_STUDENTS))      || []; } catch { return []; } })();
let _entParents       = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ENT_PARENTS))       || []; } catch { return []; } })();

function loadStoredString(key, fallback = '') {
    try {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    } catch {
        return fallback;
    }
}

let _commMode           = loadStoredString(STORAGE_KEYS.COMM_MODE, 'cloud-password') || 'cloud-password';
let _establishmentKey   = loadStoredString(STORAGE_KEYS.ESTABLISHMENT_KEY, '');
let _webdavUrl          = loadStoredString(STORAGE_KEYS.WEBDAV_URL, '');
let _webdavUser         = loadStoredString(STORAGE_KEYS.WEBDAV_USER, '');
let _smtpHost           = loadStoredString(STORAGE_KEYS.SMTP_HOST, '');
let _smtpPort           = loadStoredString(STORAGE_KEYS.SMTP_PORT, '465') || '465';
let _smtpUser           = loadStoredString(STORAGE_KEYS.SMTP_USER, '');
let _smtpSubject        = loadStoredString(STORAGE_KEYS.SMTP_SUBJECT, '');
let _smtpBody           = (() => { try { return localStorage.getItem(STORAGE_KEYS.SMTP_BODY); } catch { return null; } })();

let _isClickFocus = false;
let _needsCsvExport = false;
let _needsJsonExport = false;
let _hasUnsavedChanges = false; 

let _studentSearchBuffer = "";
let _studentSearchTimeout = null;
let _mathJaxTimeout = null;

// --- GETTERS ET SETTERS EXPORTÉS ---
export const state = {
    get baremeConfig() { return _baremeConfig; }, set baremeConfig(val) { _baremeConfig = val; },
    get globalScaleTo20() { return _globalScaleTo20; }, set globalScaleTo20(val) { _globalScaleTo20 = val; },
    get globalShowAppreciation() { return _globalShowAppreciation; }, set globalShowAppreciation(val) { _globalShowAppreciation = val; },
    get globalGenerateGlobalPdf() { return _globalGenerateGlobalPdf; }, set globalGenerateGlobalPdf(val) { _globalGenerateGlobalPdf = val; },
    get globalShowPublipostage() { return _globalShowPublipostage; }, set globalShowPublipostage(val) { _globalShowPublipostage = val; },
    get globalShowPdfChart() { return _globalShowPdfChart; }, set globalShowPdfChart(val) { _globalShowPdfChart = val; },
    get globalPdfFontSize() { return _globalPdfFontSize; }, set globalPdfFontSize(val) { _globalPdfFontSize = val; },
    get globalBlankPageForDuplex() { return _globalBlankPageForDuplex; }, set globalBlankPageForDuplex(val) { _globalBlankPageForDuplex = val; },
    get globalQuickComments() { return _globalQuickComments; }, set globalQuickComments(val) { _globalQuickComments = val; },
    get globalShowSkills() { return _globalShowSkills; }, set globalShowSkills(val) { _globalShowSkills = val; },
    get globalThresholdAcquis() { return _globalThresholdAcquis; }, set globalThresholdAcquis(val) { _globalThresholdAcquis = val; },
    get globalThresholdEncours() { return _globalThresholdEncours; }, set globalThresholdEncours(val) { _globalThresholdEncours = val; },
    get globalAiStep() { return _globalAiStep; }, set globalAiStep(val) { _globalAiStep = val; },
    get globalShowAnswers() { return _globalShowAnswers; }, set globalShowAnswers(val) { _globalShowAnswers = val; },
    get globalShowAnswersOnPdf() { return _globalShowAnswersOnPdf; }, set globalShowAnswersOnPdf(val) { _globalShowAnswersOnPdf = val; },
    get students() { return _students; }, set students(val) { _students = val; },
    get currentIndex() { return _currentIndex; }, set currentIndex(val) { _currentIndex = val; },
    get statsChartInstance() { return _statsChartInstance; }, set statsChartInstance(val) { _statsChartInstance = val; },
    get entStudents() { return _entStudents; },
    set entStudents(val) {
        _entStudents = val;
        try { localStorage.setItem(STORAGE_KEYS.ENT_STUDENTS, JSON.stringify(val)); } catch { /* quota */ }
    },
    get entParents() { return _entParents; },
    set entParents(val) {
        _entParents = val;
        try { localStorage.setItem(STORAGE_KEYS.ENT_PARENTS, JSON.stringify(val)); } catch { /* quota */ }
    },
    get commMode() { return _commMode; },
    set commMode(val) {
        _commMode = val || 'cloud-password';
        try { localStorage.setItem(STORAGE_KEYS.COMM_MODE, _commMode); } catch { /* quota */ }
    },
    get establishmentKey() { return _establishmentKey; },
    set establishmentKey(val) {
        _establishmentKey = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.ESTABLISHMENT_KEY, _establishmentKey); } catch { /* quota */ }
    },
    get webdavUrl() { return _webdavUrl; },
    set webdavUrl(val) {
        _webdavUrl = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.WEBDAV_URL, _webdavUrl); } catch { /* quota */ }
    },
    get webdavUser() { return _webdavUser; },
    set webdavUser(val) {
        _webdavUser = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.WEBDAV_USER, _webdavUser); } catch { /* quota */ }
    },
    get smtpHost() { return _smtpHost; },
    set smtpHost(val) {
        _smtpHost = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.SMTP_HOST, _smtpHost); } catch { /* quota */ }
    },
    get smtpPort() { return _smtpPort; },
    set smtpPort(val) {
        _smtpPort = val ?? '465';
        try { localStorage.setItem(STORAGE_KEYS.SMTP_PORT, _smtpPort); } catch { /* quota */ }
    },
    get smtpUser() { return _smtpUser; },
    set smtpUser(val) {
        _smtpUser = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.SMTP_USER, _smtpUser); } catch { /* quota */ }
    },
    get smtpSubject() { return _smtpSubject; },
    set smtpSubject(val) {
        _smtpSubject = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.SMTP_SUBJECT, _smtpSubject); } catch { /* quota */ }
    },
    get smtpBody() { return _smtpBody; },
    set smtpBody(val) {
        _smtpBody = val ?? '';
        try { localStorage.setItem(STORAGE_KEYS.SMTP_BODY, _smtpBody); } catch { /* quota */ }
    },
    get isClickFocus() { return _isClickFocus; }, set isClickFocus(val) { _isClickFocus = val; },
    get needsCsvExport() { return _needsCsvExport; }, set needsCsvExport(val) { _needsCsvExport = val; },
    get needsJsonExport() { return _needsJsonExport; }, 
    set needsJsonExport(val) { 
        _needsJsonExport = val; 
        window.dispatchEvent(new CustomEvent('json-export-status-changed')); 
    },
    get hasUnsavedChanges() { return _hasUnsavedChanges; }, set hasUnsavedChanges(val) { _hasUnsavedChanges = val; },
    get studentSearchBuffer() { return _studentSearchBuffer; }, set studentSearchBuffer(val) { _studentSearchBuffer = val; },
    get studentSearchTimeout() { return _studentSearchTimeout; }, set studentSearchTimeout(val) { _studentSearchTimeout = val; },
    get mathJaxTimeout() { return _mathJaxTimeout; }, set mathJaxTimeout(val) { _mathJaxTimeout = val; },
    get defaultBaremeConfig() { return defaultBaremeConfig; },
    get defaultQuickComments() { return defaultQuickComments; }
};

/**
 * Charge toutes les options de configuration depuis le localStorage et met à jour l'état.
 * Appelée une seule fois au démarrage de l'application.
 */
export function loadConfiguration() {
    const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (savedConfig) {
        try { state.baremeConfig = JSON.parse(savedConfig); }
        catch (e) { state.baremeConfig = []; }
    } else {
        // Pas de barème sauvegardé : démarrage propre (barème vide)
        state.baremeConfig = [];
    }
    const savedScale = localStorage.getItem(STORAGE_KEYS.SCALE_TO_20);
    state.globalScaleTo20 = (savedScale === 'true');
    
    const savedShowAppr = localStorage.getItem(STORAGE_KEYS.SHOW_APPRECIATION);
    state.globalShowAppreciation = savedShowAppr !== null ? (savedShowAppr === 'true') : true;
    
    const savedGlobalPdf = localStorage.getItem(STORAGE_KEYS.GLOBAL_PDF);
    state.globalGenerateGlobalPdf = savedGlobalPdf !== null ? (savedGlobalPdf === 'true') : true;

    const savedShowPubli = localStorage.getItem(STORAGE_KEYS.SHOW_PUBLIPOSTAGE);
    state.globalShowPublipostage = savedShowPubli !== null ? (savedShowPubli === 'true') : true;
    window.dispatchEvent(new CustomEvent('publipostage-visibility-changed', { detail: { show: state.globalShowPublipostage } }));
    
    const savedShowPdfChart = localStorage.getItem(STORAGE_KEYS.SHOW_PDF_CHART); 
    state.globalShowPdfChart = savedShowPdfChart !== null ? (savedShowPdfChart === 'true') : true;

    const savedShowAnsPdf = localStorage.getItem(STORAGE_KEYS.SHOW_ANSWERS_ON_PDF);
    state.globalShowAnswersOnPdf = savedShowAnsPdf !== null ? (savedShowAnsPdf === 'true') : true; 
    
    const savedFontSize = localStorage.getItem(STORAGE_KEYS.PDF_FONT_SIZE);
    state.globalPdfFontSize = savedFontSize ? savedFontSize : "16";

    const savedBlank = localStorage.getItem(STORAGE_KEYS.BLANK_PAGE_DUPLEX);
    state.globalBlankPageForDuplex = savedBlank !== null ? (savedBlank === 'true') : true;

    state.globalShowSkills = (localStorage.getItem(STORAGE_KEYS.SHOW_SKILLS) !== 'false');
    state.globalThresholdAcquis = parseInt(localStorage.getItem(STORAGE_KEYS.THRESHOLD_ACQUIS)) || 75;
    state.globalThresholdEncours = parseInt(localStorage.getItem(STORAGE_KEYS.THRESHOLD_ENCOURS)) || 40;
    state.globalAiStep = parseFloat(localStorage.getItem(STORAGE_KEYS.AI_STEP)) || 0.25;

    const savedQC = localStorage.getItem(STORAGE_KEYS.QUICK_COMMENTS);
    if (savedQC) {
        try { state.globalQuickComments = JSON.parse(savedQC); } catch(e) { state.globalQuickComments = [...defaultQuickComments]; }
    } else {
        state.globalQuickComments = [...defaultQuickComments];
    }
    calculateMaxScore();
}

/**
 * Sauvegarde la configuration complète de l'application dans l'état et le localStorage.
 * @param {Object} opts - Options de configuration.
 * @param {Array}   opts.newConfig              - Tableau des exercices du barème.
 * @param {boolean} [opts.scaleOption=false]    - Ramener la note sur 20.
 * @param {boolean} [opts.showAppOption=true]   - Afficher l'appréciation sur le PDF.
 * @param {boolean} [opts.generateGlobalPdfOption=true]  - Générer un PDF global dans le ZIP.
 * @param {boolean} [opts.showPublipostageOption=true]   - Afficher le bouton publipostage.
 * @param {boolean} [opts.showPdfChartOption=true]       - Afficher le graphique sur le PDF.
 * @param {string}  [opts.fontSize="16"]        - Taille de police du PDF.
 * @param {boolean} [opts.blankPageOption=false]         - Ajouter une page blanche (recto-verso).
 * @param {boolean} [opts.showSkillsOption=true]         - Activer les capacités attendues.
 * @param {number}  [opts.thresholdAcquis=75]   - Seuil « Acquis » en %.
 * @param {number}  [opts.thresholdEncours=40]  - Seuil « En cours » en %.
 * @param {number}  [opts.aiStep=0.25]          - Pas utilisé pour la génération IA.
 * @param {boolean} [opts.showAnswersOnPdfOption=true]   - Afficher les réponses sur le PDF.
 */
export function saveConfiguration({
    newConfig,
    scaleOption = false,
    showAppOption = true,
    generateGlobalPdfOption = true,
    showPublipostageOption = true,
    showPdfChartOption = true,
    fontSize = "16",
    blankPageOption = false,
    showSkillsOption = true,
    thresholdAcquis = 75,
    thresholdEncours = 40,
    aiStep = 0.25,
    showAnswersOnPdfOption = true
} = {}) {
    state.baremeConfig = newConfig;
    state.globalScaleTo20 = scaleOption;
    state.globalShowAppreciation = showAppOption;
    state.globalGenerateGlobalPdf = generateGlobalPdfOption;
    state.globalShowPublipostage = showPublipostageOption;
    state.globalShowPdfChart = showPdfChartOption;
    state.globalShowAnswersOnPdf = showAnswersOnPdfOption;
    state.globalPdfFontSize = fontSize;
    state.globalBlankPageForDuplex = blankPageOption;
    state.globalShowSkills = showSkillsOption;
    state.globalThresholdAcquis = thresholdAcquis;
    state.globalThresholdEncours = thresholdEncours;
    state.globalAiStep = parseFloat(aiStep);
    
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.baremeConfig));
    localStorage.setItem(STORAGE_KEYS.SCALE_TO_20, state.globalScaleTo20);
    localStorage.setItem(STORAGE_KEYS.SHOW_APPRECIATION, state.globalShowAppreciation);
    localStorage.setItem(STORAGE_KEYS.GLOBAL_PDF, state.globalGenerateGlobalPdf);
    localStorage.setItem(STORAGE_KEYS.SHOW_PUBLIPOSTAGE, state.globalShowPublipostage);
    localStorage.setItem(STORAGE_KEYS.SHOW_PDF_CHART, state.globalShowPdfChart); 
    localStorage.setItem(STORAGE_KEYS.SHOW_ANSWERS_ON_PDF, state.globalShowAnswersOnPdf);
    localStorage.setItem(STORAGE_KEYS.PDF_FONT_SIZE, state.globalPdfFontSize);
    localStorage.setItem(STORAGE_KEYS.BLANK_PAGE_DUPLEX, state.globalBlankPageForDuplex); 
    localStorage.setItem(STORAGE_KEYS.SHOW_SKILLS, state.globalShowSkills);
    localStorage.setItem(STORAGE_KEYS.THRESHOLD_ACQUIS, state.globalThresholdAcquis);
    localStorage.setItem(STORAGE_KEYS.THRESHOLD_ENCOURS, state.globalThresholdEncours);
    localStorage.setItem(STORAGE_KEYS.AI_STEP, state.globalAiStep);
    localStorage.setItem(STORAGE_KEYS.QUICK_COMMENTS, JSON.stringify(state.globalQuickComments));
    
    window.dispatchEvent(new CustomEvent('publipostage-visibility-changed', { detail: { show: state.globalShowPublipostage } }));

    state.students.forEach(s => s.skillBilan = generateSkillBilan(s));
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students));

    renderGradingForm();
    renderQuickComments();
    loadStudent(state.currentIndex); 
    calculateMaxScore();
	state.needsJsonExport = true;
}

export async function resetDefaultConfig() {
    const { showConfirm } = await import('./addons.js');
    const ok = await showConfirm(
        "Revenir au barème d'exemple ?\n\nAttention : cela réinitialisera les notes, les appréciations et la liste des commentaires rapides.",
        "Réinitialiser l'exemple",
        "Réinitialiser",
        "btn-warning"
    );
    if (!ok) return;

    state.students = JSON.parse(JSON.stringify(defaultStudents));
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students));
    state.hasUnsavedChanges = false;

    state.globalQuickComments = [...defaultQuickComments];
    localStorage.setItem(STORAGE_KEYS.QUICK_COMMENTS, JSON.stringify(state.globalQuickComments));
    renderQuickComments();

    saveConfiguration({ newConfig: JSON.parse(JSON.stringify(defaultBaremeConfig)) });

    document.getElementById('mainTitle').innerText = "Exemple";
    document.title = "MonSantorin - Exemple";
    localStorage.setItem(STORAGE_KEYS.TITLE, "Exemple");

    // Empêche le listener hide.bs.modal de restaurer l'ancienne configuration
    discardConfigBackup();
    const modalEl = document.getElementById('configModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    state.needsJsonExport = false;
    state.needsCsvExport = false;
}

function resetEvaluationTitle() {
    const titleEl = document.getElementById('mainTitle');
    if (titleEl) titleEl.innerText = "Nouvelle évaluation";
    document.title = "MonSantorin";
    localStorage.removeItem(STORAGE_KEYS.TITLE);
}

/** État final commun lorsque barème et classe sont tous deux vides. */
function applyFullBaremeAndClassReset() {
    state.students = [];
    localStorage.removeItem(STORAGE_KEYS.DATA);
    state.hasUnsavedChanges = false;

    saveConfiguration({ newConfig: [] });

    resetEvaluationTitle();

    renderStudentList();
    renderGradingForm();
    renderConfigEditor();
    updateConfigBackupBaseline();

    loadStudent(0);

    state.needsJsonExport = false;
    state.needsCsvExport = false;
}

/** Complète la réinitialisation si l'autre moitié a déjà été effacée (ordre des deux boutons indifférent). */
export function finalizeFullResetIfEmpty() {
    const baremeEmpty = !state.baremeConfig || state.baremeConfig.length === 0;
    const classEmpty = state.students.length === 0;
    if (!baremeEmpty || !classEmpty) return;

    localStorage.removeItem(STORAGE_KEYS.DATA);
    state.hasUnsavedChanges = false;
    updateConfigBackupBaseline();
    state.needsJsonExport = false;
    state.needsCsvExport = false;
}

export async function clearFullBareme() {
    const { showConfirm } = await import('./addons.js');
    const ok = await showConfirm(
        "Voulez-vous vraiment supprimer tout le barème actuel ?\n\nCette action est irréversible.",
        "Supprimer le barème"
    );
    if (!ok) return;
    state.students.forEach(st => { st.scores = {}; st.appreciation = ""; st.skillBilan = ""; });
    state.hasUnsavedChanges = false;
    saveConfiguration({ newConfig: [] });
    resetEvaluationTitle();
    renderGradingForm();
    renderConfigEditor();
    updateConfigBackupBaseline();
    state.needsJsonExport = false;
    finalizeFullResetIfEmpty();
}

export async function clearBaremeAndClass() {
    const { showConfirm } = await import('./addons.js');
    const ok = await showConfirm(
        "DANGER : Voulez-vous vraiment TOUT EFFACER ?\n\nCela supprimera la liste des élèves, toutes leurs notes, toutes leurs appréciations ainsi que le barème actuel.\n\nCette action est définitive.",
        "Effacer barème et classe",
        "Tout effacer"
    );
    if (!ok) return;
    applyFullBaremeAndClassReset();
}

/** Charge et affiche le titre de l'évaluation depuis le localStorage. */
export function loadTitle() {
    const savedTitle = localStorage.getItem(STORAGE_KEYS.TITLE);
    const titleEl = document.getElementById('mainTitle');
    if (savedTitle) {
        if (titleEl) titleEl.innerText = savedTitle;
        document.title = "MonSantorin - " + savedTitle;
    } else {
        if (titleEl) titleEl.innerText = "Nouvelle évaluation";
        document.title = "MonSantorin";
    }
}

export function editTitle() {
    const currentTitle = document.getElementById('mainTitle')?.innerText || "";
    const newTitle = window.prompt("Entrez le nouveau titre de l'évaluation :", currentTitle);
    if (newTitle && newTitle.trim() !== "") {
        const titleEl = document.getElementById('mainTitle');
        if (titleEl) titleEl.innerText = newTitle;
        document.title = "MonSantorin - " + newTitle;
        localStorage.setItem(STORAGE_KEYS.TITLE, newTitle);
    }
}

/**
 * Persiste l'état courant (scores, nom, appréciation) de l'élève affiché.
 * @param {boolean} [skipRender=false] - Si true, n'appelle pas renderStudentList (perf).
 */
export function saveCurrentState(skipRender = false) {
    if (!state.students.length || state.currentIndex < 0 || state.currentIndex >= state.students.length) return;
    calculateTotals();
    const currentStudent = state.students[state.currentIndex];

    let newBilan = "";
    if (state.globalShowSkills) {
        newBilan = generateSkillBilan(currentStudent);
    }

    currentStudent.name = document.getElementById('studentName')?.value ?? "";
    currentStudent.appreciation = document.getElementById('appreciation')?.value ?? "";
    currentStudent.skillBilan = newBilan;
    
    const bilanDiv = document.getElementById('skillBilanDisplay');
    const bilanContent = document.getElementById('skillBilanContent');
    if (state.globalShowSkills && newBilan !== "") {
        if (bilanContent) bilanContent.innerHTML = newBilan;
        if (bilanDiv) bilanDiv.style.display = 'block';
    } else {
        if (bilanDiv) bilanDiv.style.display = 'none';
    }

    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(state.students)); 
    state.hasUnsavedChanges = false;
    state.needsCsvExport = true;
    
    if (!skipRender) {
        renderStudentList();
    }
}