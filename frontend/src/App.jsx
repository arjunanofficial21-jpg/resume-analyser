import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import EmptyState from './components/EmptyState';
import ChatInput from './components/ChatInput';
import DropOverlay from './components/DropOverlay';
import { 
  chatWithDocument, 
  uploadDocument, 
  getSessions, 
  getSessionMessages, 
  createSession, 
  deleteSession,
  renameSession
} from './services/chatbot';

// ── helpers ───────────────────────────────────────────────────────
const makeTitle = (text) => (text.length > 45 ? text.slice(0, 45) + '…' : text);
const makeId = (suffix = '') => `${Date.now()}${suffix ? '-' + suffix : ''}`;

/** Convert DB message format to frontend format */
const transformMessage = (m) => {
  if (m.role === 'files') {
    return {
      id: m.id,
      role: 'files',
      files: [{ name: m.content }],
      timestamp: new Date(m.created_at),
    };
  }
  return {
    id: m.id,
    role: m.role,
    text: m.content,
    timestamp: new Date(m.created_at),
  };
};

function ChatView({
  currentConvId,
  setCurrentConvId,
  messagesByConv,
  setMessagesByConv,
  chatMutation,
  uploadMutation,
  setConversations,
  appendMessage,
  isSubmittingRef,
  stagedFiles,
  setStagedFiles,
  ensureSession,
  onStop,
  uploadProgress
}) {
  const { id } = useParams();
  const navigate = useNavigate();

  // Sync route param with internal state
  useEffect(() => {
    if (id && id !== currentConvId) {
      setCurrentConvId(id);
      loadMessagesForSession(id);
    } else if (!id && currentConvId) {
      setCurrentConvId(null);
    }
  }, [id, currentConvId]);

  const loadMessagesForSession = async (sessionId) => {
    try {
      const dbMessages = await getSessionMessages(sessionId);
      setMessagesByConv(prev => ({
        ...prev,
        [sessionId]: dbMessages.map(transformMessage)
      }));
    } catch (err) {
      console.error('Failed to load messages', err);
      if (err?.response?.status === 404) navigate('/');
    }
  };

  const messages = messagesByConv[id] || [];

  // ── Send message ───────────────────────────────────────────────
  const sendMessage = async (text) => {
    if ((!text.trim() && stagedFiles.length === 0) || isSubmittingRef.current) return;

    try {
      isSubmittingRef.current = true;
      const convId = await ensureSession(stagedFiles, text);
      
      if (stagedFiles.length > 0) {
        if (text && text.trim().length > 0) {
          appendMessage(convId, {
            id: makeId('user'),
            role: 'user',
            text: text.trim(),
            createdAt: new Date().toISOString(),
          });
        }
        uploadMutation.mutate({ files: stagedFiles, convId, text });
        setStagedFiles([]);
      } else {
        const messageId = makeId('user');
        const userMsg = {
          id: messageId,
          role: 'user',
          text,
          createdAt: new Date().toISOString()
        };
        appendMessage(convId, userMsg);
        chatMutation.mutate({ id: convId, message: text });
      }
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // ── Edit & resend a user message ──────────────────────────────
  const handleEditMessage = (messageId, newText) => {
    if (!id || isSubmittingRef.current) return;
    setMessagesByConv((prev) => {
      const existing = prev[id] || [];
      const idx = existing.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const next = [
        ...existing.slice(0, idx),
        { ...existing[idx], text: newText },
      ];
      return { ...prev, [id]: next };
    });
    chatMutation.mutate({ id, message: newText });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      {messages.length === 0 && !chatMutation.isPending ? (
        <EmptyState onSuggest={sendMessage} />
      ) : (
      <MessageList messages={messages} isLoading={chatMutation.isPending} onEdit={handleEditMessage} />
      )}

      <ChatInput
        onSend={sendMessage}
        disabled={chatMutation.isPending}
        uploading={uploadMutation.isPending}
        uploadProgress={uploadProgress}
        stagedFiles={stagedFiles}
        setStagedFiles={setStagedFiles}
        onStop={onStop}
      />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    if (saved !== null) return saved === 'true';
    return window.innerWidth >= 768;
  });
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]);

  // Helper to ensure a session exists and return its ID
  const ensureSession = async (files = [], text = '') => {
    if (currentConvId) return currentConvId;

    try {
      let label;
      if (files.length > 0) {
        label = files.length === 1 ? `📄 ${files[0].name}` : `📄 ${files.length} documents`;
      } else {
        label = makeTitle(text.trim()) || 'New Chat';
      }
      const newSession = await createSession(label);
      const activeId = newSession.id;
      setCurrentConvId(activeId);
      setConversations((prev) => [
        { id: activeId, title: newSession.title, createdAt: new Date(newSession.created_at), fileCount: 0 },
        ...prev,
      ]);
      navigate(`/chat/${activeId}`, { replace: true });
      return activeId;
    } catch (err) {
      console.error('Failed to create session', err);
      throw err;
    }
  };

  const handleNewChat = () => {
    navigate('/?newchat=true');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarOpen', next);
      return next;
    });
  };

  // ── Drag & Drop Handlers ───────────────────────────────────────
  useEffect(() => {
    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
      if (dropped.length === 0) return;

      setStagedFiles((prev) => {
        const existing = new Set(prev.map((f) => f.name));
        return [...prev, ...dropped.filter((f) => !existing.has(f.name))];
      });
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [currentConvId]);

  // 1. Load sessions on mount
  useEffect(() => {
    getSessions()
      .then((data) => {
        setConversations(data.map(s => ({
          id: s.id,
          title: s.title,
          createdAt: new Date(s.created_at),
          fileCount: s.file_count || 0,
        })));
      })
      .catch(console.error);
  }, []);

  const appendMessage = (convId, message) => {
    setMessagesByConv((prev) => {
      const existing = prev[convId] || [];
      const index = existing.findIndex(m => m.id === message.id);
      
      if (index !== -1) {
        const next = [...existing];
        next[index] = message;
        return { ...prev, [convId]: next };
      }
      
      return {
        ...prev,
        [convId]: [...existing, message],
      };
    });
  };

  // ── TanStack mutation — streaming chat ─────────────────────────
  const chatMutation = useMutation({
    mutationFn: async ({ message, id: convId }) => {
      const aiMsgId = makeId('ai-stream');
      let fullContent = '';

      const controller = new AbortController();
      abortControllerRef.current = controller;

      appendMessage(convId, {
        id: aiMsgId,
        role: 'ai',
        text: '',
        timestamp: new Date(),
      });

      try {
        await chatWithDocument(message, convId, (chunk) => {
          fullContent += chunk;
          appendMessage(convId, {
            id: aiMsgId,
            role: 'ai',
            text: fullContent,
            timestamp: new Date(),
          });
        }, controller.signal);
        return fullContent;
      } catch (err) {
        if (err?.name === 'AbortError') return fullContent;
        throw err;
      } finally {
        abortControllerRef.current = null;
      }
    },
    onSuccess: () => {
      isSubmittingRef.current = false;
    },
    onError: (err, { id: convId }) => {
      const raw = err?.message || '';
      const detail = err?.response?.data?.detail || raw || 'Unknown error';
      appendMessage(convId, {
        id: makeId('err'),
        role: 'error',
        text: `Something went wrong: ${detail}`,
        timestamp: new Date(),
      });
      isSubmittingRef.current = false;
    },
  });

  // Track upload progress for individual files
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '' });

  const uploadMutation = useMutation({
    mutationFn: async ({ files, convId }) => {
      const results = [];
      // Upload sequentially — avoids FAISS race conditions
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length, fileName: file.name });
        try {
          const result = await uploadDocument(file, convId);
          results.push({ ...result, fileName: file.name, success: true });
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          results.push({ error: true, fileName: file.name, message: err.message, success: false });
        }
      }
      setUploadProgress({ current: 0, total: 0, fileName: '' });
      return results;
    },
    onSuccess: (results, { files, convId, text }) => {
      const successfulUploads = results.filter(r => r.success);
      const failedUploads = results.filter(r => !r.success);

      if (failedUploads.length > 0) {
        toast.error(`${failedUploads.length} file(s) failed to upload`, {
          description: failedUploads.map(f => f.fileName).join(', '),
        });
      }

      if (successfulUploads.length === 0) {
        isSubmittingRef.current = false;
        return;
      }

      const successfulFiles = files.filter(f =>
        successfulUploads.some(r => r.fileName === f.name)
      );

      // Show file card in chat
      appendMessage(convId, {
        id: makeId('file-card'),
        role: 'files',
        files: successfulFiles.map((f) => ({ name: f.name })),
        timestamp: new Date(),
      });

      // Update sidebar file count
      setConversations(prev =>
        prev.map(c => c.id === convId
          ? { ...c, fileCount: (c.fileCount || 0) + successfulUploads.length }
          : c
        )
      );

      // Auto-rename session if backend suggested a title
      const suggested = successfulUploads?.[0]?.suggested_title;
      if (suggested) {
        const currentConv = conversations.find(c => c.id === convId);
        const currentTitle = currentConv?.title || '';
        const isGeneric = currentTitle === 'New Chat' || currentTitle.startsWith('📄');
        if (isGeneric) {
          handleRenameConversation(convId, suggested);
        }
      }

      if (text && text.trim().length > 0) {
        chatMutation.mutate({ id: convId, message: text.trim() });
      }
      // No auto-question on upload — user asks manually
    },
    onError: (err, { convId }) => {
      const raw = err?.message || '';
      const is429 = raw.includes('429') || raw.toLowerCase().includes('too many requests');
      if (is429) {
        toast.warning('⚠️ Rate limit hit — please wait a moment and try again.', {
          description: 'The free AI model has a request limit. Try again in a few seconds.',
        });
      } else {
        const detail = err?.response?.data?.detail || raw || 'Upload failed';
        appendMessage(convId, {
          id: makeId('err'),
          role: 'error',
          text: `Something went wrong: ${detail}`,
          timestamp: new Date(),
        });
      }
      isSubmittingRef.current = false;
    }
  });

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleDeleteConversation = useCallback(
    async (id) => {
      try {
        await deleteSession(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setMessagesByConv((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (currentConvId === id) navigate('/?newchat=true');
      } catch (err) {
        console.error('Failed to delete session', err);
      }
    },
    [currentConvId, navigate]
  );

  const handleRenameConversation = useCallback(
    async (id, newTitle) => {
      try {
        await renameSession(id, newTitle);
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
      } catch (err) {
        console.error('Failed to rename session', err);
        toast.error('Could not rename chat. Please try again.');
      }
    },
    []
  );

  return (
    <div className="flex h-screen bg-base text-foreground overflow-hidden relative">
      <DropOverlay isVisible={isDragging} />
      
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-20 backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        conversations={conversations}
        currentConvId={currentConvId}
        onNewChat={handleNewChat}
        onSelect={(id) => {
          navigate(`/chat/${id}`);
          if (window.innerWidth < 768) setSidebarOpen(false);
        }}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <ChatHeader />

        <Routes>
          <Route path="/" element={
            <ChatView
              currentConvId={currentConvId}
              setCurrentConvId={setCurrentConvId}
              messagesByConv={messagesByConv}
              setMessagesByConv={setMessagesByConv}
              chatMutation={chatMutation}
              uploadMutation={uploadMutation}
              setConversations={setConversations}
              appendMessage={appendMessage}
              isSubmittingRef={isSubmittingRef}
              stagedFiles={stagedFiles}
              setStagedFiles={setStagedFiles}
              ensureSession={ensureSession}
              onStop={handleStop}
              uploadProgress={uploadProgress}
            />
          } />
          <Route path="/chat/:id" element={
            <ChatView
              currentConvId={currentConvId}
              setCurrentConvId={setCurrentConvId}
              messagesByConv={messagesByConv}
              setMessagesByConv={setMessagesByConv}
              chatMutation={chatMutation}
              uploadMutation={uploadMutation}
              setConversations={setConversations}
              appendMessage={appendMessage}
              isSubmittingRef={isSubmittingRef}
              stagedFiles={stagedFiles}
              setStagedFiles={setStagedFiles}
              ensureSession={ensureSession}
              onStop={handleStop}
              uploadProgress={uploadProgress}
            />
          } />
        </Routes>
      </div>
    </div>
  );
}
