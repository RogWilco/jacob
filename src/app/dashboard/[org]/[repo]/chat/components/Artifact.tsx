import React, { useState, useEffect } from "react";
import { Editor } from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { useTheme } from "next-themes";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import { type CodeFile } from "./Chat";
import FileMenu from "./FileMenu";

interface ArtifactProps {
  content: string;
  fileName: string;
  filePath: string;
  language: string;
  onSelectNewFile: (path: string) => void;
  codeFiles?: CodeFile[];
  allFilePaths?: string[];
  onHideArtifact: () => void;
}

export function Artifact({
  content,
  fileName,
  filePath,
  language,
  codeFiles = [],
  allFilePaths = [],
  onSelectNewFile,
  onHideArtifact,
}: ArtifactProps) {
  const [activeTab, setActiveTab] = useState<"view" | "edit" | "diff">("view");
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };
  useEffect(() => {
    setSelectedFilePath(filePath);
  }, [filePath]);

  useEffect(() => {
    setSelectedContent(content);
  }, [content]);

  useEffect(() => {
    setSelectedFilename(fileName);
  }, [fileName]);

  useEffect(() => {
    if (codeFiles.length > 0) {
      console.log("looking for found content...");
      const foundContent =
        codeFiles.find((file) => file.path === selectedFilePath)?.content ??
        null;
      console.log("foundContent", foundContent);
      setOriginalContent(
        foundContent && foundContent.trim() !== "" ? foundContent : null,
      );
      if (foundContent) {
        setSelectedContent(foundContent);
      }
    }
  }, [selectedFilePath, codeFiles]);

  const handleFileSelect = (path: string) => {
    setSelectedFilePath(path);
    onSelectNewFile(path);
  };

  const handleSave = async () => {
    try {
      // Check if the File System Access API is supported
      if ("showSaveFilePicker" in window) {
        // @ts-ignore
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: selectedFilename,
          types: [
            {
              description: "Text Files",
              accept: {
                "text/plain": [".txt", ".js", ".ts", ".jsx", ".tsx", ".md"],
              },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        toast.success("File saved successfully!");
      } else {
        // Fallback for browsers that don't support the File System Access API
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = selectedFilename ?? "";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("File download started!");
      }
    } catch (error) {
      console.error("Error saving file:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        // User cancelled the save operation, do nothing
        console.log("Save operation cancelled by user");
      } else {
        // Display error toast for other types of errors
        toast.error("Failed to save file. Please try again.");
      }
    }
  };

  const showDiffTab = originalContent !== null && originalContent.trim() !== "";

  return (
    <div className="flex h-full w-full">
      <FileMenu
        filePaths={allFilePaths}
        selectedFilePath={selectedFilePath ?? ""}
        onFileSelect={handleFileSelect}
      />
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        className="flex h-full flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-md dark:bg-slate-800"
      >
        <div className="border-b border-aurora-200 bg-aurora-50/50 shadow-sm dark:border-gray-700 dark:bg-slate-800">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center space-x-2">
              <h2 className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                {selectedFilename}
              </h2>
            </div>
            <div className="flex">
              <button
                onClick={() => setActiveTab("view")}
                className={`px-3 py-2 text-sm font-medium ${
                  activeTab === "view"
                    ? "border-b-2 border-aurora-500 text-aurora-600"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                View
              </button>
              <button
                onClick={() => setActiveTab("edit")}
                className={`px-3 py-2 text-sm font-medium ${
                  activeTab === "edit"
                    ? "border-b-2 border-aurora-500 text-aurora-600"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Edit
              </button>
              {showDiffTab && (
                <button
                  onClick={() => setActiveTab("diff")}
                  className={`px-3 py-2 text-sm font-medium ${
                    activeTab === "diff"
                      ? "border-b-2 border-aurora-500 text-aurora-600"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Diff
                </button>
              )}
              <button
                onClick={onHideArtifact}
                className="ml-4 rounded p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                title="Hide artifact"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
        <div className="flex-grow overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === "view" ? (
              <motion.div
                key="view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full overflow-auto bg-gray-50 dark:bg-[#282c34]"
              >
                <MarkdownRenderer className={`markdown-chat`}>
                  {`\`\`\`${language}\n${selectedContent ?? originalContent}\n\`\`\``}
                </MarkdownRenderer>
              </motion.div>
            ) : activeTab === "diff" && showDiffTab ? (
              <motion.div
                key="diff"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <DiffEditor
                  original={originalContent ?? ""}
                  modified={selectedContent ?? ""}
                  language={language}
                  theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    selectionHighlight: false,
                    scrollbar: {
                      vertical: "hidden",
                      horizontal: "hidden",
                    },
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="edit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <Editor
                  value={selectedContent ?? ""}
                  language={language}
                  theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    selectionHighlight: false,
                    scrollbar: {
                      vertical: "hidden",
                      horizontal: "hidden",
                    },
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-end space-x-2 border-t border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-slate-800">
          <button
            onClick={() => copyToClipboard(selectedContent ?? "")}
            className="rounded p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title="Copy to clipboard"
          >
            <FontAwesomeIcon icon={faCopy} />
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-aurora-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-aurora-600"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default Artifact;
