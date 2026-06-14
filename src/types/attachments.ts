/**
 * Shared types for in-progress (pending) file/image attachments awaiting send.
 */

/** A `File` that may carry a custom relative-path tag set during directory traversal. */
export type FileWithRelativePath = File & { _relativePath?: string };

/** A file belonging to an uploaded directory group. */
export interface DirectoryFile {
  file: File;
  name: string;
  size: number;
  type: string;
  isImage?: boolean;
  relativePath?: string;
}

/** A pending image upload awaiting send (cleared once the message is sent). */
export interface PendingUpload {
  file?: File;
  dataUrl?: string | null;
  filename?: string;
  timestamp?: string;
}

/** A pending document or directory upload awaiting send. */
export interface PendingDocument {
  file?: File;
  name?: string;
  size?: number;
  type?: string;
  isDirectory?: boolean;
  directoryName?: string;
  files?: DirectoryFile[];
}
