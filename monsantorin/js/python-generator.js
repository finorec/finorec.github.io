// --- FICHIER : js/python-generator.js ---
// Rôle : Usine de génération des scripts Python. Modifié pour accepter
// des chaînes multi-destinataires (séparées par des virgules) pour le SMTP.

/**
 * Échappe une valeur pour l'insérer dans une chaîne Python entre guillemets doubles.
 * Protège contre l'injection de code dans les scripts générés.
 * @param {*} s
 * @returns {string}
 */
function escapePyStr(s) {
    return String(s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

/**
 * Génère le script Python pour l'envoi via la messagerie SMTP avec sujet et corps personnalisés.
 */
export function buildSmtpPythonScript(smtpHost, smtpPort, smtpUser, emailMapping, subject, body) {
    const escapedSubject = escapePyStr(subject);
    const escapedBody = escapePyStr(body);
    const emailMappingCode = `EMAIL_MAPPING = ${JSON.stringify(emailMapping, null, 4)}`;

    return `# -*- coding: utf-8 -*-
import smtplib
import os
import sys
import getpass
import time
import base64
from email.message import EmailMessage
import tkinter as tk
from tkinter import filedialog

if os.name == 'nt':
    os.system('chcp 65001 >nul')
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SMTP_HOST = "${escapePyStr(smtpHost)}"
SMTP_PORT = ${parseInt(smtpPort, 10) || 465}
SMTP_USER = "${escapePyStr(smtpUser)}"

${emailMappingCode}

print("=====================================================")
print("📧 Démarrage du publipostage (Élèves & Parents)")
print(f"Serveur : {SMTP_HOST}:{SMTP_PORT}")
print(f"Compte  : {SMTP_USER}")
print("=====================================================")

print("\\n📁 Ouverture de la fenêtre de sélection de dossier...")
try:
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    dossier_pdf = filedialog.askdirectory(title="Sélectionnez le dossier contenant les copies PDF")
    
    if not dossier_pdf:
        print("❌ Aucun dossier sélectionné. Arrêt du programme.")
        input("\\nAppuyez sur Entrée pour quitter...")
        sys.exit()
        
    os.chdir(dossier_pdf)
    print(f"✅ Dossier ciblé : {os.getcwd()}")
except Exception as e:
    print(f"❌ Erreur lors de l'ouverture de la fenêtre de sélection : {e}")
    input("\\nAppuyez sur Entrée pour quitter...")
    sys.exit()

print("\\n🔒 Saisie du mot de passe (regardez la nouvelle fenêtre de saisie)...")
pwd_result = []
pwd_dialog = tk.Toplevel(root)
pwd_dialog.title("Authentification")
pwd_dialog.geometry("380x130")
pwd_dialog.attributes('-topmost', True)
pwd_dialog.resizable(False, False)

tk.Label(pwd_dialog, text=f"Mot de passe messagerie pour :\\n{SMTP_USER}", font=("Arial", 10, "bold")).pack(pady=(10, 5))
pwd_entry = tk.Entry(pwd_dialog, show="*", width=30, font=("Arial", 12))
pwd_entry.pack(pady=5)

pwd_dialog.lift()
pwd_entry.focus_force()
pwd_dialog.grab_set()

def submit_pwd(event=None):
    pwd_result.append(pwd_entry.get())
    pwd_dialog.destroy()

pwd_entry.bind("<Return>", submit_pwd)
tk.Button(pwd_dialog, text="Valider", command=submit_pwd, cursor="hand2").pack(pady=5)
root.wait_window(pwd_dialog)

if not pwd_result or not pwd_result[0]:
    print("❌ Saisie annulée ou mot de passe vide. Arrêt du programme.")
    input("\\nAppuyez sur Entrée pour quitter...")
    sys.exit()

SMTP_PASS = pwd_result[0]

def safe_login(server, user, password):
    if not password:
        raise smtplib.SMTPAuthenticationError(535, b"Mot de passe vide.")
    try:
        server.login(user, password)
    except UnicodeEncodeError:
        server.ehlo_or_helo_if_needed()
        authlist = server.esmtp_features.get("auth", "").split()
        if 'PLAIN' in authlist:
            auth_str = ("\\x00" + user + "\\x00" + password).encode('utf-8')
            auth_b64 = base64.b64encode(auth_str).decode('ascii')
            code, resp = server.docmd("AUTH", "PLAIN " + auth_b64)
            if code not in (235, 503):
                raise smtplib.SMTPAuthenticationError(code, resp)
        elif 'LOGIN' in authlist:
            user_b64 = base64.b64encode(user.encode('utf-8')).decode('ascii')
            pass_b64 = base64.b64encode(password.encode('utf-8')).decode('ascii')
            code, resp = server.docmd("AUTH", "LOGIN " + user_b64)
            if code != 334:
                raise smtplib.SMTPAuthenticationError(code, resp)
            code, resp = server.docmd(pass_b64)
            if code not in (235, 503):
                raise smtplib.SMTPAuthenticationError(code, resp)
        else:
            raise smtplib.SMTPException("Méthode d'authentification non supportée.")

def connect_server():
    if SMTP_PORT == 465:
        s = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)
    else:
        s = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        s.starttls()
    safe_login(s, SMTP_USER, SMTP_PASS)
    return s

print("\\nConnexion au serveur pour vérification des identifiants...")
try:
    server = connect_server()
    print("✅ Authentification réussie ! Début de la distribution...")
except Exception as e:
    print(f"\\n❌ Erreur bloquante de connexion : {e}")
    input("\\nAppuyez sur Entrée pour quitter...")
    sys.exit()

try:
    compteur = 0
    # --- MODIFICATION ICI : correspondances.items() remplacé par EMAIL_MAPPING.items() ---
    for filename, destinations_str in EMAIL_MAPPING.items():
        if os.path.exists(filename):
            liste_mails = [m.strip() for m in destinations_str.split(',') if m.strip() != ""]
            mails_valides = []
            
            for email in liste_mails:
                parties = email.split('@')
                if len(parties) == 2 and " " not in email and parties[0] and "." in parties[1]:
                    mails_valides.append(email)
                else:
                    print(f"⚠️ Format rejeté pour l'adresse : '{email}'")

            if not mails_valides:
                print(f"❌ Aucun destinataire valide pour {filename}. Envoi annulé.")
                continue

            msg = EmailMessage()
            msg['Subject'] = """${escapedSubject}"""
            msg['From'] = SMTP_USER
            msg['To'] = ", ".join(mails_valides)
            msg.set_content("""${escapedBody}""")
            
            with open(filename, 'rb') as f:
                msg.add_attachment(f.read(), maintype='application', subtype='pdf', filename=filename)
            
            try:
                server.send_message(msg)
                print(f"✅ Envoyé à : {msg['To']} ({filename})")
                compteur += 1
            except Exception as e:
                print(f"⚠️ Incident de session, tentative de reconnexion pour {filename}...")
                try:
                    server = connect_server()
                    server.send_message(msg)
                    print(f"✅ Envoyé après reconnexion à : {msg['To']}")
                    compteur += 1
                except Exception as e2:
                    print(f"❌ Échec critique d'envoi pour {filename}. Passé.")
                    continue
            
            time.sleep(2)
            if compteur > 0 and compteur % 8 == 0:
                print("🔄 Pause préventive anti-spam globale (3 secondes)...")
                try: server.quit()
                except: pass
                time.sleep(3)
                try: server = connect_server()
                except: break
                
        else:
            print(f"❌ Fichier physique introuvable : {filename}")

    try: server.quit()
    except: pass
    print(f"\\n🎉 Opération achevée ! {compteur} envoi(s) groupé(s) effectué(s).")
except Exception as e:
    print(f"\\n❌ Erreur d'exécution globale : {e}")

input("\\nAppuyez sur Entrée pour quitter...")
`;
}

/**
 * Génère le script Python pour le dépôt sur le Nuage et la création de liens publics individuels.
 */
export function buildCloudPythonScript(config, mappingPy) {
    const serializedMapping = JSON.stringify(mappingPy, null, 4);

    return `# -*- coding: utf-8 -*-
import os, sys, re, urllib.parse, csv
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import threading
import xml.etree.ElementTree as ET

# Auto-installation de requests si manquant
try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "requests"])
    import requests

CONFIG = {
    "WEBDAV_URL": "${escapePyStr(config.webdavUrl)}",
    "USER": "${escapePyStr(config.webdavUser)}",
    "TITRE": "${escapePyStr(config.devoirTitre)}"
}

NOM_MAPPING = ${serializedMapping}

class CloudUploaderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("MonSantorin — Dépôt Nuage (Liens Individuels)")
        self.root.geometry("620x480")
        self.root.minsize(550, 350)
        
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TButton', font=('Segoe UI', 10), padding=6)
        style.configure('TLabel', font=('Segoe UI', 10))
        
        main_frame = ttk.Frame(root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(main_frame, text="Création de liens de partage individuels (Nuage Apps Éducation)", font=('Segoe UI', 12, 'bold'), foreground='#198754').pack(anchor=tk.W, pady=(0,15))
        
        # Zone d'informations techniques
        info_text = f"Dossier cible sur le Nuage : /MonSantorin/{CONFIG['TITRE']}/\\nCompte WebDAV : {CONFIG['USER']}"
        ttk.Label(main_frame, text=info_text, justify=tk.LEFT, background='#f1f5f9', padding=10).pack(fill=tk.X, pady=(0,15))
        
        # Zone de saisie du jeton / mot de passe d'application WebDAV
        pwd_frame = ttk.Frame(main_frame)
        pwd_frame.pack(fill=tk.X, pady=(0,15))
        ttk.Label(pwd_frame, text="Mot de passe d'application Nuage (Clé WebDAV) : ").pack(side=tk.LEFT)
        self.pwd_entry = ttk.Entry(pwd_frame, show="*", width=25)
        self.pwd_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.pwd_entry.focus()
        
        ttk.Label(main_frame, text="Console d'exécution :", font=('Segoe UI', 10, 'bold')).pack(anchor=tk.W)
        self.log_box = scrolledtext.ScrolledText(main_frame, height=10, font=('Consolas', 9), bg='#1e293b', fg='#f8fafc')
        self.log_box.pack(fill=tk.BOTH, expand=True, pady=(5,15))
        self.log("Prêt pour l'envoi. Saisissez votre mot de passe d'application et sélectionnez votre dossier de PDFs.")
        
        self.btn_run = ttk.Button(main_frame, text="📁 Sélectionner le dossier & Envoyer", command=self.start_process)
        self.btn_run.pack(fill=tk.X)

    def log(self, text):
        self.log_box.insert(tk.END, text + "\\n")
        self.log_box.see(tk.END)

    def start_process(self):
        password = self.pwd_entry.get().strip()
        if not password:
            messagebox.showerror("Erreur", "Veuillez saisir votre mot de passe d'application Nuage.")
            return
            
        folder = filedialog.askdirectory(title="Sélectionner le dossier contenant les PDF individuels")
        if not folder:
            return
            
        self.btn_run.config(state=tk.DISABLED)
        self.pwd_entry.config(state=tk.DISABLED)
        
        threading.Thread(target=self.run_upload, args=(folder, password), daemon=True).start()

    def run_upload(self, folder, password):
        base_url = CONFIG["WEBDAV_URL"].rstrip('/')
        auth = (CONFIG["USER"], password)
        
        # Encodage propre du nom du devoir pour l'URL WebDAV
        devoir_encoded = urllib.parse.quote(CONFIG["TITRE"])
        
        # Arborescence WebDAV cible : /MonSantorin/TitreDeLEvaluation
        target_dir_url = f"{base_url}/MonSantorin/{devoir_encoded}"
        
        self.log("Vérification et création des répertoires cibles sur votre Nuage...")
        
        # Création itérative sécurisée des dossiers WebDAV (MKCOL)
        try:
            requests.request("MKCOL", f"{base_url}/MonSantorin", auth=auth)
        except Exception:
            pass
        try:
            res = requests.request("MKCOL", target_dir_url, auth=auth)
            if res.status_code not in [201, 405]: # 405 signifie que le dossier existe déjà
                raise Exception(f"Code HTTP {res.status_code}")
            self.log("✅ Dossier distant prêt.")
        except Exception as e:
            self.log(f"❌ Impossible de créer le dossier distant : {e}")
            messagebox.showerror("Erreur Nuage", f"Échec de l'initialisation du dossier sur le Nuage.\\n\\nVérifiez vos identifiants WebDAV et votre clé d'application.\\n\\nDétail : {e}")
            self.root.after(0, self.reset_ui)
            return

        success_count = 0
        csv_rows = []
        
        # Parcours et envoi
        for filename in os.listdir(folder):
            if not filename.lower().endswith('.pdf') or filename.startswith('00_'):
                continue
                
            path = os.path.join(folder, filename)
            student_name = NOM_MAPPING.get(filename, filename.replace(".pdf", ""))
            
            filename_encoded = urllib.parse.quote(filename)
            file_dest_url = f"{target_dir_url}/{filename_encoded}"
            
            self.log(f"Envoi de : {filename}...")
            try:
                # 1. Upload du fichier (PUT) via WebDAV
                with open(path, 'rb') as f:
                    res_put = requests.put(file_dest_url, data=f, auth=auth)
                if res_put.status_code not in [201, 204]:
                    self.log(f"   ❌ Échec du transfert (Code {res_put.status_code})")
                    continue
                    
                # 2. Demande de création du lien public via l'API Nextcloud (OCS)
                root_instance_url = base_url.split('/remote.php')[0]
                share_api_url = f"{root_instance_url}/ocs/v2.php/apps/files_sharing/api/v1/shares"
                headers = {"OCS-APIRequest": "true"}
                
                # Le chemin interne exact attendu par l'API OCS
                remote_path = f"/MonSantorin/{CONFIG['TITRE']}/{filename}"

                # Paramètres OCS Nextcloud : shareType=3 (Lien public), permissions=1 (Lecture seule)
                payload = {
                    "path": remote_path,
                    "shareType": 3,
                    "permissions": 1
                }
                
                res_share = requests.post(share_api_url, data=payload, auth=auth, headers=headers)
                
                # Traitement ROBUSTE de l'arbre XML renvoyé par Nextcloud
                try:
                    root_xml = ET.fromstring(res_share.text)
                    status_code_elem = root_xml.find('.//meta/statuscode')
                    
                    if status_code_elem is not None and status_code_elem.text in ['100', '200']:
                        url_elem = root_xml.find('.//data/url')
                        if url_elem is not None and url_elem.text:
                            # Conservation stricte du lien renvoyé, on ajoute juste le suffixe
                            public_link = url_elem.text.rstrip('/') + '/download'
                            
                            self.log(f"   ➡️ Lien généré avec succès.")
                            csv_rows.append([student_name, public_link])
                            success_count += 1
                        else:
                            self.log("   ⚠️ Fichier envoyé mais impossible de trouver la balise <url> dans le XML.")
                    else:
                        status_msg_elem = root_xml.find('.//meta/message')
                        msg = status_msg_elem.text if status_msg_elem is not None else "Erreur inconnue"
                        code = status_code_elem.text if status_code_elem is not None else "N/A"
                        self.log(f"   ⚠️ Échec de la création du lien (Code {code} : {msg})")
                except ET.ParseError:
                    self.log(f"   ⚠️ Erreur : La réponse du serveur n'est pas un XML valide.")
                    
            except Exception as e:
                self.log(f"   ❌ Erreur système : {e}")

        # Écriture du fichier CSV de synthèse à côté des PDF
        if csv_rows:
            csv_path = os.path.join(folder, "liens_partages.csv")
            try:
                with open(csv_path, mode='w', encoding='utf-8-sig', newline='') as f_csv:
                    writer = csv.writer(f_csv, delimiter=';')
                    writer.writerow(["Élève", "Lien de partage PDF"])
                    writer.writerows(csv_rows)
                self.log(f"\\n🏁 Synthèse enregistrée avec succès dans : 'liens_partages.csv'")
                messagebox.showinfo("Terminé !", f"Opération finie !\\n\\nFichiers traités : {success_count}\\nLe fichier 'liens_partages.csv' a été ajouté à votre dossier.")
            except Exception as e:
                self.log(f"\\n⚠️ Impossible d'écrire le fichier CSV de synthèse : {e}")
        else:
            messagebox.showwarning("Avertissement", "Aucun lien n'a pu être généré.")

        self.root.after(0, self.reset_ui)

    def reset_ui(self):
        self.btn_run.config(state=tk.NORMAL)
        self.pwd_entry.config(state=tk.NORMAL)


if __name__ == '__main__':
    root = tk.Tk()
    app = CloudUploaderApp(root)
    root.mainloop()
`;
}

/**
 * Génère le script Python pour le dépôt global avec protection par mots de passe par fichier.
 */
export function buildCloudPasswordPythonScript(config, passwordMapping) {
    const serializedMapping = JSON.stringify(passwordMapping, null, 4);

    return `# -*- coding: utf-8 -*-
import os, sys, re, urllib.parse
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import threading
import xml.etree.ElementTree as ET

# Auto-installation de requests si manquant
try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "requests"])
    import requests


# Auto-installation de PyPDF2 si manquant
try:
    from PyPDF2 import PdfReader, PdfWriter
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "PyPDF2"])
    from PyPDF2 import PdfReader, PdfWriter

CONFIG = {
    "WEBDAV_URL": "${escapePyStr(config.webdavUrl)}",
    "USER": "${escapePyStr(config.webdavUser)}",
    "TITRE": "${escapePyStr(config.devoirTitre)}"
}

# Dictionnaire de correspondance Noms d'élèves -> Mots de passe
FICHIERS_ATTENDUS = ${serializedMapping}

class SecureCloudFolderUploaderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("MonSantorin — Dépôt Sécurisé par Mots de Passe")
        self.root.geometry("640x500")
        self.root.minsize(550, 400)
        
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TButton', font=('Segoe UI', 10), padding=6)
        style.configure('TLabel', font=('Segoe UI', 10))
        
        main_frame = ttk.Frame(root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(main_frame, text="Dépôt dans un dossier public protégé par mots de passe individuels", font=('Segoe UI', 11, 'bold'), foreground='#d97706').pack(anchor=tk.W, pady=(0,15))
        
        info_text = f"Dossier public global créé : /MonSantorin/{CONFIG['TITRE']}/\\nCompte WebDAV émetteur : {CONFIG['USER']}\\n\\nChaque PDF sera chiffré localement avec le mot de passe de l'élève avant l'envoi."
        ttk.Label(main_frame, text=info_text, justify=tk.LEFT, background='#f1f5f9', padding=10).pack(fill=tk.X, pady=(0,15))
        
        pwd_frame = ttk.Frame(main_frame)
        pwd_frame.pack(fill=tk.X, pady=(0,15))
        ttk.Label(pwd_frame, text="Mot de passe d'application Nuage (Clé WebDAV) : ").pack(side=tk.LEFT)
        self.pwd_entry = ttk.Entry(pwd_frame, show="*", width=25)
        self.pwd_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.pwd_entry.focus()
        
        ttk.Label(main_frame, text="Console de chiffrement et transfert :", font=('Segoe UI', 10, 'bold')).pack(anchor=tk.W)
        self.log_box = scrolledtext.ScrolledText(main_frame, height=12, font=('Consolas', 9), bg='#1e293b', fg='#f8fafc')
        self.log_box.pack(fill=tk.BOTH, expand=True, pady=(5,15))
        self.log("Prêt. Les mots de passe élèves sont chargés en mémoire interne.")
        
        self.btn_run = ttk.Button(main_frame, text="🔒 Sélectionner le dossier, Chiffrer & Déposer", command=self.start_process)
        self.btn_run.pack(fill=tk.X)

    def log(self, text):
        self.log_box.insert(tk.END, text + "\\n")
        self.log_box.see(tk.END)

    def start_process(self):
        password = self.pwd_entry.get().strip()
        if not password:
            messagebox.showerror("Erreur", "Veuillez saisir votre mot de passe d'application Nuage.")
            return
            
        folder = filedialog.askdirectory(title="Sélectionner le dossier contenant les fichiers PDF originaux")
        if not folder:
            return
            
        self.btn_run.config(state=tk.DISABLED)
        self.pwd_entry.config(state=tk.DISABLED)
        
        threading.Thread(target=self.run_secure_upload, args=(folder, password), daemon=True).start()

    def run_secure_upload(self, folder, password):
        base_url = CONFIG["WEBDAV_URL"].rstrip('/')
        auth = (CONFIG["USER"], password)
        
        devoir_encoded = urllib.parse.quote(CONFIG["TITRE"])
        target_dir_url = f"{base_url}/MonSantorin/{devoir_encoded}"
        
        # 1. Vérification et création itérative du répertoire distant
        try:
            requests.request("MKCOL", f"{base_url}/MonSantorin", auth=auth)
        except Exception:
            pass
        try:
            res = requests.request("MKCOL", target_dir_url, auth=auth)
            if res.status_code not in [201, 405]:
                raise Exception(f"Code HTTP {res.status_code}")
            self.log("✅ Dossier distant initialisé.")
        except Exception as e:
            self.log(f"❌ Impossible de configurer le dossier sur votre Nuage : {e}")
            messagebox.showerror("Erreur Nuage", f"Échec de l'accès WebDAV distant.\\n\\nDétail : {e}")
            self.root.after(0, self.reset_ui)
            return

        # 2. Création d'un sous-dossier de travail temporaire local pour stocker les PDF chiffrés
        crypto_folder = os.path.join(folder, "CRIPTO_TEMP_MONSANTORIN")
        os.makedirs(crypto_folder, exist_ok=True)
        
        success_count = 0
        
        # 3. Phase de Chiffrement Local des PDF (PyPDF2)
        self.log("\\n--- PHASE 1 : Chiffrement local des copies ---")
        for std_name, mdp in FICHIERS_ATTENDUS.items():
            # Reconstruction du nom du fichier attendu par convention
            safe_name_str = re.sub(r'[^a-zA-Z0-9]', '_', std_name)
            possible_filename = f"Correction_{safe_name_str}.pdf"
            
            source_file_path = os.path.join(folder, possible_filename)
            
            # Recherche souple (case-insensitive) si le fichier brut n'est pas trouvé directement
            if not os.path.exists(source_file_path):
                found = False
                for f_item in os.listdir(folder):
                    if f_item.lower() == possible_filename.lower():
                        source_file_path = os.path.join(folder, f_item)
                        possible_filename = f_item
                        found = True
                        break
                if not found:
                    continue
            
            encrypted_file_path = os.path.join(crypto_folder, possible_filename)
            self.log(f"Chiffrement de la copie de : {std_name}")
            
            try:
                reader = PdfReader(source_file_path)
                writer = PdfWriter()
                
                for page in reader.pages:
                    writer.add_page(page)
                    
                # Application de la clé secrète de l'élève (Mot de passe)
                writer.encrypt(str(mdp))
                
                with open(encrypted_file_path, "wb") as f_out:
                    writer.write(f_out)
                    
                success_count += 1
            except Exception as e:
                self.log(f"   ❌ Erreur technique lors du chiffrement : {e}")

        if success_count == 0:
            self.log("❌ Aucun fichier PDF correspondant à la liste des élèves n'a été trouvé dans ce dossier.")
            messagebox.showerror("Erreur", "Aucun PDF d'élève valide détecté. Vérifiez que vous avez bien extrait le ZIP.")
            # Nettoyage
            try:
                os.rmdir(crypto_folder)
            except Exception:
                pass
            self.root.after(0, self.reset_ui)
            return

        # 4. Phase de transfert WebDAV (PUT)
        self.log(f"\\n--- PHASE 2 : Transfert vers le Nuage ({success_count} fichiers) ---")
        uploaded_count = 0
        
        for filename in os.listdir(crypto_folder):
            path = os.path.join(crypto_folder, filename)
            filename_encoded = urllib.parse.quote(filename)
            file_dest_url = f"{target_dir_url}/{filename_encoded}"
            
            self.log(f"Téléversement de : {filename}...")
            try:
                with open(path, 'rb') as f:
                    res_put = requests.put(file_dest_url, data=f, auth=auth)
                if res_put.status_code in [201, 204]:
                    uploaded_count += 1
                else:
                    self.log(f"   ❌ Erreur serveur (Code HTTP {res_put.status_code})")
            except Exception as e:
                self.log(f"   ❌ Échec d'envoi : {e}")

        # 5. Nettoyage du dossier de travail temporaire local
        self.log("\\nNettoyage des fichiers temporaires...")
        for filename in os.listdir(crypto_folder):
            try:
                os.remove(os.path.join(crypto_folder, filename))
            except Exception:
                pass
        try:
            os.rmdir(crypto_folder)
        except Exception:
            pass

        if uploaded_count == 0:
            messagebox.showerror("Échec", "Le transfert a échoué. Aucun fichier n'a été déposé.")
            self.root.after(0, self.reset_ui)
            return

        # 6. Demande de création du lien public global Nextcloud (OCS API) pour le DOSSIER entier
        self.log("Génération du lien public global du dossier...")
        try:
            root_instance_url = base_url.split('/remote.php')[0]
            share_api_url = f"{root_instance_url}/ocs/v2.php/apps/files_sharing/api/v1/shares"
            headers = {"OCS-APIRequest": "true"}
            
            # Le chemin interne exact attendu par l'API OCS (le dossier lui-même)
            remote_path = f"/MonSantorin/{CONFIG['TITRE']}"

            payload = {
                "path": remote_path,
                "shareType": 3,
                "permissions": 1
            }
            
            res_share = requests.post(share_api_url, data=payload, auth=auth, headers=headers)
            lien_public = "Lien introuvable dans la réponse du serveur."
            
            # Traitement ROBUSTE de l'arbre XML renvoyé par Nextcloud
            try:
                root_xml = ET.fromstring(res_share.text)
                status_code_elem = root_xml.find('.//meta/statuscode')
                
                if status_code_elem is not None and status_code_elem.text in ['100', '200']:
                    url_elem = root_xml.find('.//data/url')
                    if url_elem is not None and url_elem.text:
                        lien_public = url_elem.text
                        self.log(f"\\n✅ LIEN DOSSIER PUBLIC : {lien_public}")
                        
                        # --- Sauvegarde du lien dans un fichier texte explicatif ---
                        with open(os.path.join(folder, "LIEN_DOSSIER_PUBLIC.txt"), "w", encoding="utf-8") as fl:
                            fl.write(f"Devoir : {CONFIG['TITRE']}\\n\\n")
                            fl.write(f"Lien public (à copier dans Pronote) :\\n{lien_public}\\n\\n")
                            fl.write("Rappel : Les élèves devront utiliser leur mot de passe personnel pour ouvrir leur PDF.")
                        self.log("\\nFichier 'LIEN_DOSSIER_PUBLIC.txt' sauvegardé à côté de vos fichiers.")

                        # --- Boîte de dialogue finale avec copie dans le presse-papier ---
                        def show_link_dialog(link):
                            dlg = tk.Toplevel(self.root)
                            dlg.title("Terminé !")
                            dlg.resizable(False, False)
                            dlg.grab_set()
                            ttk.Label(dlg, text="✅ Opération terminée ! Voici le lien public à distribuer :", font=("Segoe UI", 10, "bold"), wraplength=460).pack(padx=20, pady=(16, 6))
                            link_var = tk.StringVar(value=link)
                            entry = ttk.Entry(dlg, textvariable=link_var, width=60, font=("Segoe UI", 9))
                            entry.pack(padx=20, pady=(0, 8))
                            entry.select_range(0, tk.END)
                            def copy_link():
                                dlg.clipboard_clear()
                                dlg.clipboard_append(link)
                                copy_btn.config(text="✅ Copié !")
                                dlg.after(2000, lambda: copy_btn.config(text="📋 Copier le lien"))
                            def close_all():
                                dlg.destroy()
                                self.root.destroy()
                            btn_frame = ttk.Frame(dlg)
                            btn_frame.pack(pady=(0, 16))
                            copy_btn = ttk.Button(btn_frame, text="📋 Copier le lien", command=copy_link)
                            copy_btn.pack(side=tk.LEFT, padx=8)
                            ttk.Button(btn_frame, text="Fermer", command=close_all).pack(side=tk.LEFT, padx=8)
                            # Copie automatique à l'ouverture
                            dlg.clipboard_clear()
                            dlg.clipboard_append(link)
                            dlg.wait_window()
                        self.root.after(0, lambda: show_link_dialog(lien_public))
                    else:
                        self.log("⚠️ Le partage a réussi mais le lien public (<url>) n'a pas été trouvé dans la réponse XML.")
                else:
                    status_msg_elem = root_xml.find('.//meta/message')
                    msg = status_msg_elem.text if status_msg_elem is not None else "Erreur inconnue"
                    code = status_code_elem.text if status_code_elem is not None else "N/A"
                    self.log(f"\\n⚠️ Échec de la création du lien (Code {code} : {msg})")
            except ET.ParseError:
                self.log(f"\\n⚠️ Erreur : La réponse du serveur n'est pas un XML valide. \\n{res_share.text}")
                
        except Exception as e:
            self.log(f"❌ Erreur critique lors de la génération du lien public : {str(e)}")
            messagebox.showwarning("Avertissement", f"Fichiers envoyés avec succès, mais la création du lien public a échoué : {e}")

        self.root.after(0, self.reset_ui)

    def reset_ui(self):
        self.btn_run.config(state=tk.NORMAL)
        self.pwd_entry.config(state=tk.NORMAL)


if __name__ == '__main__':
    root = tk.Tk()
    app = SecureCloudFolderUploaderApp(root)
    root.mainloop()
`;
}