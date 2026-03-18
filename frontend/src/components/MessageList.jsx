import { useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

export default function MessageList({ messages, isLoading, onEdit }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user scrolled more than 80px from bottom, stop auto-scrolling
    userScrolledUp.current = distanceFromBottom > 80;
  }, []);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user') {
      // New user message — re-enable auto-scroll
      userScrolledUp.current = false;
    }
  }, [messages.length]);

  useEffect(() => {
    if (userScrolledUp.current) return;
    const el = containerRef.current;
    if (!el) return;
    // Use instant scroll (not smooth) so it never fights a manual scroll
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const lastAiMsg = isLoading
    ? [...messages].reverse().find(m => m.role === 'ai')
    : null;
  const streamingMsgId = lastAiMsg?.id ?? null;
  const showTyping = isLoading && !streamingMsgId;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4"
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isStreaming={msg.id === streamingMsgId}
          onEdit={onEdit}
        />
      ))}
      {showTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

