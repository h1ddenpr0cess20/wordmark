/**
 * Attachment type support.
 *
 * @remarks
 * Decides which files the composer accepts for the active provider, and renames
 * the ones a provider's Files API would reject on extension alone. Every
 * provider path — client-side extraction, direct `input_file` upload, and vector
 * store ingestion — resolves through here so a format is not accepted in the
 * composer only to fail at upload time (or rejected in the composer when the
 * provider would have taken it).
 */

import { documentExtension, isExtractableDocument, isPlainTextDocument } from "./parsers/index.ts";
import { extractsDocumentsClientSide, usesDirectFileUpload } from "./providers.ts";

/**
 * Extensions a vector store indexes natively.
 *
 * @remarks
 * This is File Search's own list. It deliberately excludes the spreadsheet,
 * archive, and image formats the Assistants/code-interpreter list carried —
 * a vector store rejects those during processing, so accepting them here only
 * moved the failure later. Anything textual outside this list is uploaded under
 * a `.txt` name instead (see {@link toUploadableFile}).
 */
export const SUPPORTED_FILE_EXTENSIONS = [
  "c", "cpp", "cs", "css", "doc", "docx", "go", "html", "java", "js",
  "json", "md", "pdf", "php", "pptx", "py", "rb", "sh", "tex", "ts", "txt",
];

/**
 * Extensions a direct `input_file` upload is understood by name.
 *
 * @remarks
 * The vector-store set plus the tabular formats the Responses API runs through
 * its spreadsheet flow. Anything else textual is uploaded as `.txt`.
 */
const DIRECT_UPLOAD_EXTENSIONS = new Set<string>([
  ...SUPPORTED_FILE_EXTENSIONS,
  "csv", "tsv", "xls", "xlsx",
]);

const VECTOR_STORE_EXTENSIONS = new Set<string>(SUPPORTED_FILE_EXTENSIONS);

/** Whether a vector store indexes this file type natively. */
export function isSupportedFileType(filename: string): boolean {
  const ext = documentExtension(filename);
  return ext ? VECTOR_STORE_EXTENSIONS.has(ext) : false;
}

/**
 * Splits files into the ones a vector store indexes natively and the rest.
 *
 * @remarks
 * Callers that upload through {@link toUploadableFile} should not filter on
 * this — a textual file outside the native set uploads fine as `.txt`. It
 * remains the check for reporting which files went in unmodified.
 */
export function filterSupportedFiles(files: File[]) {
  const supported: File[] = [];
  const unsupported: File[] = [];

  files.forEach((file) => {
    if (isSupportedFileType(file.name)) {
      supported.push(file);
    } else {
      unsupported.push(file);
    }
  });

  return { supported, unsupported };
}

/**
 * Image types a model accepts as an image input.
 *
 * @remarks
 * Vision endpoints take PNG, JPEG, GIF, and WebP. Everything else the browser
 * labels `image/*` — SVG above all, but also TIFF, HEIC, BMP — is refused when
 * sent as an image, so those go down the document path instead: SVG is markup
 * and reads as text, and the rest are reported as unsupported rather than
 * uploaded to be rejected.
 */
const VIEWABLE_IMAGE_TYPES = new Set<string>([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
]);

const VIEWABLE_IMAGE_EXTENSIONS = new Set<string>(["png", "jpg", "jpeg", "gif", "webp"]);

/** Whether the file should be sent to the model as an image rather than a document. */
export function isModelViewableImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type) {
    return VIEWABLE_IMAGE_TYPES.has(type);
  }
  return VIEWABLE_IMAGE_EXTENSIONS.has(documentExtension(file.name));
}

/**
 * Whether the active provider can do anything with this attachment.
 *
 * @param filename - The file name (or path).
 * @param serviceKey - The active service key.
 *
 * @remarks
 * Providers that extract text in the browser and providers that upload the file
 * itself both accept any document or non-binary file: the first reads it here,
 * the second hands it over with an extension the Files API accepts. A vector
 * store additionally has to be able to index the result, so binary formats it
 * has no parser for (epub, odt, archives) are declined up front.
 */
export function canAttachDocument(filename: string, serviceKey: string | null | undefined): boolean {
  if (extractsDocumentsClientSide(serviceKey) || usesDirectFileUpload(serviceKey)) {
    return isExtractableDocument(filename);
  }
  return isSupportedFileType(filename) || isPlainTextDocument(filename);
}

/**
 * The file as it should be uploaded, renamed when the provider would reject its
 * extension.
 *
 * @param file - The file to upload.
 * @param serviceKey - The active service key, selecting the provider's native
 * extension set.
 *
 * @remarks
 * Files APIs validate the extension, not the bytes, so a `.wgsl` shader or a
 * `.toml` config is refused even though it is plain text. Appending `.txt`
 * (rather than replacing the extension) gets the same bytes accepted while
 * leaving the original name visible to the model. Files the provider already
 * understands, and binaries a rename would not help, are returned untouched.
 */
export function toUploadableFile(file: File, serviceKey: string | null | undefined): File {
  const nativeTypes = usesDirectFileUpload(serviceKey) ? DIRECT_UPLOAD_EXTENSIONS : VECTOR_STORE_EXTENSIONS;
  const ext = documentExtension(file.name);
  if (ext && nativeTypes.has(ext)) {
    return file;
  }
  if (!isPlainTextDocument(file.name)) {
    return file;
  }
  return new File([file], `${file.name}.txt`, {
    type: "text/plain",
    lastModified: file.lastModified,
  });
}
