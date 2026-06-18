/** Chiffrement PDF via @cantoo/pdf-lib (Typst + encrypt). */
import { PDFDocument } from '@cantoo/pdf-lib';

export async function encryptPdfBytes(pdfBytes, password) {
    const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach(p => doc.addPage(p));
    doc.encrypt({
        userPassword: password,
        ownerPassword: password,
    });
    return doc.save({ useObjectStreams: false });
}
