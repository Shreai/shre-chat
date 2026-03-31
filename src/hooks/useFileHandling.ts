import { useState, useRef, useCallback } from 'react';
import type { UploadedFile } from '../store';
import { uid } from '../store';

interface UseFileHandlingOptions {
  activeSessionId: string | null;
  activeSessionTitle: string | undefined;
  activeAgentId: string;
  actions: { setStatusLine: (msg: string | null) => void };
}

export function useFileHandling({
  activeSessionId,
  activeSessionTitle,
  activeAgentId,
  actions,
}: UseFileHandlingOptions) {
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const processFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          actions.setStatusLine(
            `File "${file.name}" too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 5MB)`,
          );
          setTimeout(() => actions.setStatusLine(null), 4000);
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const uploaded: UploadedFile = {
            id: uid(),
            name: file.name,
            size: file.size,
            type: file.type,
            sessionId: activeSessionId || '',
            sessionTitle: activeSessionTitle || 'Chat',
            agentId: activeAgentId,
            uploadedAt: Date.now(),
            dataUrl: reader.result as string,
          };
          setPendingFiles((prev) => [...prev, uploaded]);
        };
        reader.readAsDataURL(file);
      }
    },
    [activeSessionId, activeSessionTitle, activeAgentId, actions],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList) return;
      processFiles(Array.from(fileList));
      e.target.value = '';
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processFiles(Array.from(files));
      }
    },
    [processFiles],
  );

  const removePendingFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > MAX_FILE_SIZE) {
          actions.setStatusLine(
            `Pasted image too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 5MB)`,
          );
          setTimeout(() => actions.setStatusLine(null), 4000);
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const uploaded: UploadedFile = {
            id: uid(),
            name: `pasted-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
            size: file.size,
            type: file.type,
            sessionId: activeSessionId || '',
            sessionTitle: activeSessionTitle || 'Chat',
            agentId: activeAgentId,
            uploadedAt: Date.now(),
            dataUrl: reader.result as string,
          };
          setPendingFiles((prev) => [...prev, uploaded]);
        };
        reader.readAsDataURL(file);
      }
    },
    [activeSessionId, activeSessionTitle, activeAgentId, actions],
  );

  return {
    pendingFiles,
    setPendingFiles,
    isDragging,
    fileRef,
    MAX_FILE_SIZE,
    processFiles,
    handleFileSelect,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    removePendingFile,
    handlePaste,
  };
}
