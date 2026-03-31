import { useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { Bot, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSuccess = (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      login(decoded, credentialResponse.credential);
      onClose();
    } catch (err) {
      console.error('Failed to decode Google credential', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(23,23,23,0.95) 0%, rgba(31,31,31,0.95) 100%)',
          border: '1px solid rgba(139,92,246,0.25)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.1)',
        }}
        className="relative w-full max-w-sm mx-4 rounded-2xl p-8 flex flex-col items-center gap-6"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/[0.07] transition-colors"
        >
          <X size={16} />
        </button>

      

        {/* Copy */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Sign in to continue</h2>
          <p className="text-sm text-muted leading-relaxed">
            You've used your free chat. Sign in with Google to create unlimited conversations and save your history.
          </p>
        </div>

        {/* Divider */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px bg-divider" />
          <span className="text-[11px] text-muted">continue with</span>
          <div className="flex-1 h-px bg-divider" />
        </div>

        {/* Google Login — using dark theme to match */}
        <div className="w-full flex justify-center">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => console.error('Google Login Failed')}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text="signin_with"
            width="280"
          />
        </div>

        <p className="text-[11px] text-muted text-center">
          By signing in you agree to our privacy policy. We only use your email to identify your chats.
        </p>
      </div>
    </div>
  );
}
