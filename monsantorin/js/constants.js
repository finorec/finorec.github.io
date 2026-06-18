// --- FICHIER : js/constants.js ---
// Rôle : Centraliser toutes les chaînes de caractères "en dur" (Magic Strings)
// pour éviter les fautes de frappe et faciliter la maintenance.

// Les clés utilisées pour sauvegarder les données dans le navigateur
export const STORAGE_KEYS = {
    DATA: 'monSantorinData',
    CONFIG: 'monSantorinConfig',
    TITLE: 'monSantorinTitle',
    SCALE_TO_20: 'monSantorinScaleTo20',
    SHOW_APPRECIATION: 'monSantorinShowAppreciation',
    GLOBAL_PDF: 'monSantorinGlobalPdf',
    SHOW_PUBLIPOSTAGE: 'monSantorinShowPublipostage',
    SHOW_PDF_CHART: 'monSantorinShowPdfChart',
    SHOW_ANSWERS_ON_PDF: 'monSantorinShowAnswersOnPdf',
    PDF_FONT_SIZE: 'monSantorinPdfFontSize',
    BLANK_PAGE_DUPLEX: 'monSantorinBlankPageForDuplex',
    SHOW_SKILLS: 'monSantorinShowSkills',
    THRESHOLD_ACQUIS: 'monSantorinThresholdAcquis',
    THRESHOLD_ENCOURS: 'monSantorinThresholdEncours',
    AI_STEP: 'monSantorinAiStep',
    QUICK_COMMENTS: 'monSantorinQuickComments',
    ENT_STUDENTS: 'monSantorinENT',
	ENT_PARENTS: 'monSantorinENTParents',
    SMTP_HOST: 'monSantorinSmtpHost',
    SMTP_PORT: 'monSantorinSmtpPort',
    SMTP_USER: 'monSantorinSmtpUser',
    SHOW_ANSWERS: 'monSantorinShowAnswers',
    HIDE_WELCOME: 'monSantorinHideWelcome',
    WEBDAV_URL: 'monSantorinWebdavUrl',
	WEBDAV_USER: 'monSantorinWebdavUser',
	SMTP_SUBJECT: 'monSantorinSmtpSubject',
    SMTP_BODY: 'monSantorinSmtpBody',
	COMM_MODE: 'monSantorinCommMode',
	ESTABLISHMENT_KEY: 'monSantorinEstablishmentKey'
};

/** Version Typst WASM (jsDelivr) — unique source pour pdf-renderer.js et l'import map de index.html. */
export const TYPST_VERSION = '0.7.0-rc2';

/** Modes de communication (id = value des radios Paramètres + id d'onglet `tab-*`). */
export const COMM_MODES = [
	{ id: 'cloud-password', panelLabel: 'Nuage', logo: 'img/nuage.svg', logoAlt: 'Nuage' },
	{ id: 'encrypted-manual', panelLabel: '', logo: '', logoAlt: '' },
	{ id: 'pronote', panelLabel: 'Nuage', logo: 'img/nuage.svg', logoAlt: 'Nuage' },
	{ id: 'monlycee', panelLabel: '', logo: 'img/monlyceeIDF.jpg', logoAlt: 'monlycee.net' }
];

// Les constantes de calcul du moteur (Aménagement Tiers-Temps)
export const TT_FACTOR = 4/3;

/** Mot de passe PDF élève : 14 caractères (majuscules, minuscules, chiffres), dérivé par HMAC. */
export const STUDENT_PASSWORD_LENGTH = 14;